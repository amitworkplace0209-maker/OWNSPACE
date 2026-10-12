"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/hooks/use-online-status";
import {
  completeReminderAction,
  deleteReminderAction,
  snoozeReminderAction,
  toggleReminderEnabledAction,
  unsnoozeReminderAction,
} from "@/lib/actions/calendar";
import { applyOptimisticReminder, type CachedProject, type CachedReminder } from "@/lib/offline/reminder-cache";
import {
  queueReminderMutation,
  readReminderCache,
  REMINDER_SYNC_MESSAGE,
  requestReminderBackgroundSync,
  settleQueuedReminder,
  writeReminderCache,
} from "@/lib/offline/reminder-cache.client";

/**
 * Live reminder data with offline durability.
 *
 * Deliberately the same three layers as `useTasksLive`, so the two behave
 * identically from the user's point of view:
 *
 *  1. **Realtime.** A Supabase channel on `reminders` patches local state the
 *     instant a row changes — including the server's own reminder sweep rolling
 *     a repeating reminder forward — and also schedules a debounced
 *     `router.refresh()` so server aggregates catch up.
 *  2. **Offline durability.** An edit made with no connection is applied
 *     locally and written to IndexedDB as a queued mutation, then replayed in
 *     order on reconnect. Stale entries (ones the server has overtaken) are
 *     dropped rather than replayed: newer data wins.
 *  3. **Cache freshness.** Every server payload is written back to IndexedDB,
 *     which is what lets a cold or offline start render real rows.
 */

export type RemindersLiveStatus = "connecting" | "live" | "offline" | "error";

const REFRESH_DEBOUNCE_MS = 400;
const CHANNEL = "reminders-live";

/** The writes a row can queue while offline. */
export type ReminderMutationInput =
  | { kind: "complete"; value: boolean }
  | { kind: "snooze"; value: string }
  | { kind: "unsnooze"; value: "" }
  | { kind: "enabled"; value: boolean }
  | { kind: "delete"; value: "" };

export type ReminderUpdate = (
  reminderId: string,
  input: ReminderMutationInput
) => Promise<void>;

export function useRemindersLive({
  userId,
  reminders,
  projects = [],
  enabled = true,
}: {
  userId: string | null;
  /** The server-rendered rows. Changes refresh the cache. */
  reminders: CachedReminder[];
  projects?: CachedProject[];
  enabled?: boolean;
}): {
  status: RemindersLiveStatus;
  /** Live rows: server data with optimistic edits layered on top. */
  liveReminders: CachedReminder[];
  queuedCount: number;
  update: ReminderUpdate;
  /** Force a replay of the queue, e.g. from the offline banner. */
  syncNow: () => void;
} {
  const router = useRouter();
  const online = useOnlineStatus();
  const [channelStatus, setChannelStatus] = React.useState<RemindersLiveStatus>("connecting");
  const [overrides, setOverrides] = React.useState<Record<string, CachedReminder>>({});
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [manualSync, setManualSync] = React.useState(0);

  // Persist every fresh server payload so a cold or offline start has something
  // real to render.
  React.useEffect(() => {
    if (!enabled || !userId) return;
    const id = window.requestAnimationFrame(() => {
      void writeReminderCache(userId, reminders, projects).then((snapshot) => {
        if (!snapshot) return;
        setQueuedCount(snapshot.queue.length);
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, projects, reminders, userId]);

  const update = React.useCallback<ReminderUpdate>(
    async (reminderId, input) => {
      // Paint the change immediately, from whatever row we currently hold.
      setOverrides((current) => {
        const baseline =
          current[reminderId] ?? reminders.find((reminder) => reminder.id === reminderId);
        if (!baseline) return current;
        const optimistic = applyOptimisticReminder([baseline], {
          reminderId,
          kind: input.kind,
          value: input.value,
        })[0];
        return { ...current, [reminderId]: optimistic };
      });

      // Always queue first: if the write fails, the intent is already durable
      // and the replay below sends it when the network is back.
      if (!userId) return;
      const queued = await queueReminderMutation(userId, {
        reminderId,
        kind: input.kind,
        value: input.value,
        queuedAt: new Date().toISOString(),
      });
      setQueuedCount(queued?.snapshot.queue.length ?? 0);

      if (!navigator.onLine) {
        // Hand the replay to the OS so it can happen even if the tab is closed.
        void requestReminderBackgroundSync();
        return;
      }

      try {
        const result = await runMutation(reminderId, input);
        if (result.error) throw new Error(result.error);

        if (queued) await settleQueuedReminder(userId, queued.id);
        setOverrides((current) => {
          const next = { ...current };
          delete next[reminderId];
          return next;
        });
        setQueuedCount((count) => Math.max(0, count - 1));
        router.refresh();
      } catch {
        // Offline or the server rejected it. The optimistic row keeps the
        // user's intent visible and the queued mutation retries on reconnect.
      }
    },
    [reminders, router, userId]
  );

  // --- Realtime -------------------------------------------------------------

  React.useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
    };

    const handleChange = (payload: {
      eventType: string;
      new: Record<string, unknown>;
      old: Record<string, unknown>;
    }) => {
      // A local patch for the common case: the row's own fields changed. The
      // debounced refresh reconciles anything this misses — new rows, joins,
      // and the aggregates behind the stat tiles.
      if (payload.eventType === "UPDATE" && payload.new?.id) {
        const id = String(payload.new.id);
        setOverrides((current) => {
          const existing = current[id];
          if (!existing) return current;
          return {
            ...current,
            [id]: { ...existing, ...(payload.new as Partial<CachedReminder>) } as CachedReminder,
          };
        });
      }
      scheduleRefresh();
    };

    const channel = supabase
      .channel(CHANNEL)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reminders" },
        handleChange
      )
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setChannelStatus("live");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT")
          setChannelStatus("error");
        else setChannelStatus("connecting");
      });

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, router]);

  // --- Connectivity ---------------------------------------------------------

  const status: RemindersLiveStatus = !enabled
    ? "connecting"
    : !online
      ? "offline"
      : channelStatus;

  // --- Replay ---------------------------------------------------------------

  React.useEffect(() => {
    if (!enabled || !userId || !online) return;

    let cancelled = false;

    void (async () => {
      const snapshot = await readReminderCache(userId);
      if (cancelled) return;
      if (!snapshot || snapshot.queue.length === 0) {
        setQueuedCount(0);
        return;
      }

      for (const mutation of snapshot.queue) {
        if (cancelled) return;

        const input = toMutationInput(mutation.kind, mutation.value);
        if (!input) {
          // An unrecognised kind is a corrupt record, not a transient failure.
          await settleQueuedReminder(userId, mutation.id);
          setQueuedCount((count) => Math.max(0, count - 1));
          continue;
        }

        const result = await runMutation(mutation.reminderId, input);

        // A rejected write is a real answer from the server, not a network
        // failure — retrying it forever would be wrong, so drop it and let the
        // optimistic row revert on the next refresh.
        if (!result.error) await settleQueuedReminder(userId, mutation.id);
        setQueuedCount((count) => Math.max(0, count - 1));
      }

      if (!cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, manualSync, online, router, userId]);

  const syncNow = React.useCallback(() => setManualSync((tick) => tick + 1), []);

  // The service worker's background sync only signals; the replay still has to
  // happen in the page, because a worker has no Supabase session.
  React.useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === REMINDER_SYNC_MESSAGE) syncNow();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [enabled, syncNow]);

  const liveReminders = React.useMemo(
    () => reminders.map((reminder) => overrides[reminder.id] ?? reminder),
    [overrides, reminders]
  );

  return { status, liveReminders, queuedCount, update, syncNow };
}

/** One write, shared by the optimistic path and the offline replay. */
async function runMutation(
  reminderId: string,
  input: ReminderMutationInput
): Promise<{ error?: string }> {
  switch (input.kind) {
    case "complete":
      return completeReminderAction(reminderId, input.value);
    case "snooze":
      // Stored as an ISO string on the queued row; the action takes minutes.
      return snoozeReminderAction(reminderId, undefined, new Date(input.value));
    case "unsnooze":
      return unsnoozeReminderAction(reminderId);
    case "enabled":
      return toggleReminderEnabledAction(reminderId);
    case "delete":
      return deleteReminderAction(reminderId);
    default:
      return { error: "Unknown reminder action." };
  }
}

/**
 * Rebuilds a queued mutation into the input `runMutation` expects.
 *
 * Returns null for a kind this build no longer understands, which the replay
 * loop treats as a corrupt record to discard rather than retry forever.
 */
function toMutationInput(
  kind: string,
  value: string | number | boolean | Record<string, unknown>
): ReminderMutationInput | null {
  switch (kind) {
    case "complete":
      return { kind: "complete", value: value === true || value === "true" };
    case "snooze":
      return { kind: "snooze", value: String(value) };
    case "unsnooze":
      return { kind: "unsnooze", value: "" };
    case "enabled":
      return { kind: "enabled", value: value === true || value === "true" };
    case "delete":
      return { kind: "delete", value: "" };
    default:
      return null;
  }
}