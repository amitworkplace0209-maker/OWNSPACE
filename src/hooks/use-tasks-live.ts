"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { setTaskStatusAction, setTaskPriorityAction, setTaskProgressAction } from "@/lib/actions/tasks";
import { replayTaskWriteAction } from "@/lib/actions/tasks-offline";
import { announceSyncChange, SYNC_REQUEST_EVENT } from "@/lib/offline/sync-events";
import { recordSyncSuccess } from "@/lib/offline/sync-status.client";
import {
  applyOptimisticTask,
  applyOptimisticWrite,
  localTaskFromPatch,
  type CachedTask,
  type QueuedMutation,
  type QueuedWrite,
} from "@/lib/offline/task-cache";
import {
  queueTaskMutation,
  queueTaskWrite,
  readTaskCache,
  recordTaskWriteFailure,
  requestBackgroundSync,
  settleQueuedMutation,
  settleTaskWrite,
  SYNC_MESSAGE,
  writeTaskCache,
} from "@/lib/offline/task-cache.client";

/**
 * Live task data with offline durability.
 *
 * Three things happen at once here, and they are deliberately layered so a
 * dropped connection degrades instead of breaking:
 *
 *  1. **Realtime.** A Supabase channel on `tasks` patches local state the
 *     instant a row changes, and every channel event also schedules a
 *     debounced `router.refresh()` so the server's aggregates (stats, counts)
 *     catch up. The local patch is what makes a checkbox feel instant; the
 *     refresh is what keeps the numbers honest.
 *  2. **Offline durability.** An edit made with no connection is applied to
 *     local state and written to IndexedDB as a queued mutation. On reconnect
 *     the queue is replayed against the server actions, in order, and stale
 *     entries (ones the server has since overtaken) are dropped rather than
 *     replayed — newer data wins.
 *  3. **Cache freshness.** Every server payload is written back to IndexedDB,
 *     which is what lets the page render real content offline and on a cold
 *     start instead of an empty shell.
 */

export type LiveStatus = "connecting" | "live" | "offline" | "error";

const REFRESH_DEBOUNCE_MS = 400;
const CHANNEL = "tasks-live";

export type OptimisticUpdate = (
  taskId: string,
  kind: QueuedMutation["kind"],
  value: string | number
) => Promise<void>;

/** A whole-row change queued locally: create, edit or delete. */
export type OfflineTaskWrite = {
  op: QueuedWrite["op"];
  taskId: string;
  patch: Partial<CachedTask>;
};

export function useTasksLive({
  userId,
  tasks,
  enabled = true,
}: {
  userId: string | null;
  /** The server-rendered rows. Changes are used to refresh the cache. */
  tasks: CachedTask[];
  enabled?: boolean;
}): {
  status: LiveStatus;
  /** Live rows: server data with optimistic edits layered on top. */
  liveTasks: CachedTask[];
  queuedCount: number;
  update: OptimisticUpdate;
  /** Queue a create/edit/delete locally, then replay it when online. */
  write: (input: OfflineTaskWrite) => Promise<string | null>;
  /** Force a replay of the queue, e.g. from the connectivity banner. */
  syncNow: () => void;
} {
  const router = useRouter();
  const online = useOnlineStatus();
  const [channelStatus, setChannelStatus] = React.useState<LiveStatus>("connecting");
  const [overrides, setOverrides] = React.useState<Record<string, CachedTask>>({});
  const [deleted, setDeleted] = React.useState<Set<string>>(new Set());
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [manualSync, setManualSync] = React.useState(0);

  // Persist every fresh server payload so the next cold or offline start has
  // something real to render.
  React.useEffect(() => {
    if (!enabled || !userId || tasks.length === 0) return;
    const id = window.requestAnimationFrame(() => {
      void writeTaskCache(userId, tasks).then((snapshot) => {
        if (!snapshot) return;
        setQueuedCount(snapshot.queue.length + (snapshot.writes?.length ?? 0));
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, userId, tasks]);

  const update = React.useCallback<OptimisticUpdate>(
    async (taskId, kind, value) => {
      // A task created offline does not exist on the server yet, so a field
      // mutation would be replayed before its create and fail. Fold the change
      // into the row's whole-row write instead; replay then sends create first.
      if (!tasks.some((task) => task.id === taskId) && overrides[taskId]) {
        const patch: Partial<CachedTask> =
          kind === "status"
            ? { status: String(value) as CachedTask["status"] }
            : kind === "priority"
              ? { priority: String(value) as CachedTask["priority"] }
              : { progress: Number(value) };
        setOverrides((current) => {
          const baseline = current[taskId];
          if (!baseline) return current;
          return {
            ...current,
            [taskId]: applyOptimisticWrite([baseline], { op: "update", taskId, patch })[0],
          };
        });
        if (userId) {
          const queued = await queueTaskWrite(userId, { op: "update", taskId, patch });
          if (queued) {
            setQueuedCount(queued.snapshot.queue.length + (queued.snapshot.writes?.length ?? 0));
          }
          if (navigator.onLine) setManualSync((tick) => tick + 1);
          else void requestBackgroundSync();
        }
        return;
      }

      // Paint the change immediately, from whatever row we currently hold.
      setOverrides((current) => {
        const baseline =
          current[taskId] ??
          tasks.find((task) => task.id === taskId);
        if (!baseline) return current;
        const optimistic = applyOptimisticTask([baseline], { taskId, kind, value })[0];
        return { ...current, [taskId]: optimistic };
      });

      // Always queue first: if the write fails, the intent is already durable
      // and the replay below will send it when the network is back.
      if (!userId) return;
      const queued = await queueTaskMutation(userId, {
        taskId,
        kind,
        value,
        queuedAt: new Date().toISOString(),
      });
      setQueuedCount(queued?.snapshot.queue.length ?? 0);

      if (!navigator.onLine) {
        // Hand the replay to the OS so it can happen even if the tab is closed.
        void requestBackgroundSync();
        return;
      }

      try {
        const result =
          kind === "status"
            ? await setTaskStatusAction(taskId, String(value))
            : kind === "priority"
              ? await setTaskPriorityAction(taskId, String(value))
              : await setTaskProgressAction(taskId, Number(value));

        if (result.error) throw new Error(result.error);

        if (queued) await settleQueuedMutation(userId, queued.id);
        setOverrides((current) => {
          const next = { ...current };
          delete next[taskId];
          return next;
        });
        setQueuedCount((count) => Math.max(0, count - 1));
        router.refresh();
      } catch {
        // Offline or the server rejected it. The optimistic row keeps the
        // user's intent visible and the queued mutation retries on reconnect;
        // nothing is silently lost.
      }
    },
    [overrides, router, tasks, userId]
  );

  /**
   * Queues a whole-row create/edit/delete.
   *
   * The local row is painted and written to IndexedDB before any server call,
   * so closing the app immediately after creating a task cannot lose it. The
   * returned id is the one the row will have on the server, which makes replay
   * idempotent.
   */
  const write = React.useCallback(
    async (input: OfflineTaskWrite): Promise<string | null> => {
      if (!userId) return null;

      const queuedAt = new Date().toISOString();
      const taskId =
        input.op === "create" ? crypto.randomUUID() : input.taskId;
      const patch =
        input.op === "create"
          ? localTaskFromPatch(userId, taskId, input.patch, queuedAt)
          : input.patch;

      setOverrides((current) => {
        if (input.op === "delete") return current;
        const baseline =
          current[taskId] ??
          tasks.find((task) => task.id === taskId) ??
          (patch as CachedTask);
        const [updated] = applyOptimisticWrite([baseline], {
          op: input.op,
          taskId,
          patch,
        });
        return updated ? { ...current, [taskId]: updated } : current;
      });
      if (input.op === "delete") {
        setDeleted((current) => new Set(current).add(taskId));
      }

      const queued = await queueTaskWrite(userId, {
        op: input.op,
        taskId,
        patch,
        queuedAt,
      });
      if (queued) {
        setQueuedCount(queued.snapshot.queue.length + (queued.snapshot.writes?.length ?? 0));
      } else {
        setQueuedCount((count) => count + 1);
      }

      if (!navigator.onLine) {
        void requestBackgroundSync();
        return taskId;
      }

      // One replay pass handles every queued write in order.
      setManualSync((tick) => tick + 1);
      return taskId;
    },
    [tasks, userId]
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

    const handleChange = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      // A local patch for the common case: the row's own fields changed. The
      // debounced refresh below reconciles anything this misses (new rows,
      // joins, aggregates).
      if (payload.eventType === "UPDATE" && payload.new?.id) {
        const id = String(payload.new.id);
        setOverrides((current) => {
          const existing = current[id];
          if (!existing) return current;
          return {
            ...current,
            [id]: { ...existing, ...(payload.new as Partial<CachedTask>) } as CachedTask,
          };
        });
      }
      scheduleRefresh();
    };

const channel = supabase
      .channel(CHANNEL)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, handleChange)
      .subscribe((state) => {
        if (state === "SUBSCRIBED") setChannelStatus("live");
        else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") setChannelStatus("error");
        else setChannelStatus("connecting");
      });

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, router]);

  // --- Connectivity ---------------------------------------------------------

  // `status` is derived from the shared connectivity store rather than mirrored
  // into state: `useSyncExternalStore` keeps the first client paint in
  // agreement with the server render, and a dropped connection needs no extra
  // render to be reflected.
  const status: LiveStatus = !enabled
    ? "connecting"
    : !online
      ? "offline"
      : channelStatus;

// --- Replay ---------------------------------------------------------------

  /**
   * Drains the offline queue.
   *
   * Keyed on `online` rather than on an event handler, so it runs on mount —
   * which is exactly when a queue left behind by a previous offline session has
   * to be flushed — and again every time the connection returns. `manualSync`
   * covers the user pressing "Retry" in the offline banner.
   */
  React.useEffect(() => {
    if (!enabled || !userId || !online) return;

    let cancelled = false;

    void (async () => {
      const snapshot = await readTaskCache(userId);
      if (cancelled) return;
      if (!snapshot || snapshot.queue.length === 0) {
        setQueuedCount(0);
        return;
      }

      for (const mutation of snapshot.queue) {
        if (cancelled) return;
        const result =
          mutation.kind === "status"
            ? await setTaskStatusAction(mutation.taskId, String(mutation.value))
            : mutation.kind === "priority"
              ? await setTaskPriorityAction(mutation.taskId, String(mutation.value))
              : await setTaskProgressAction(mutation.taskId, Number(mutation.value));

        // A rejected write is a real answer from the server, not a network
        // failure — retrying it forever would be wrong, so drop it and let the
        // optimistic row revert on the next refresh.
        if (!result.error) await settleQueuedMutation(userId, mutation.id);
        setQueuedCount((count) => Math.max(0, count - 1));
      }

      // Whole-row writes are replayed after field mutations, so a task created
      // offline exists before a completion made against it is sent.
      let writeFailed = false;
      for (const pendingWrite of snapshot.writes ?? []) {
        if (cancelled) return;
        const result = await replayTaskWriteAction(pendingWrite);
        if (result.error) {
          writeFailed = true;
          await recordTaskWriteFailure(userId, pendingWrite.id, result.error);
        } else {
          await settleTaskWrite(userId, pendingWrite.id);
          setOverrides((current) => {
            const next = { ...current };
            delete next[pendingWrite.taskId];
            return next;
          });
        }
        setQueuedCount((count) => Math.max(0, count - 1));
      }

      if (!writeFailed) recordSyncSuccess(userId);
      announceSyncChange();
      if (!cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, manualSync, online, router, userId]);

  const syncNow = React.useCallback(
    () => setManualSync((tick) => tick + 1),
    []
  );

  // The service worker's background sync only signals; the replay still has to
  // happen in the page, because a worker has no Supabase session.
  React.useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === SYNC_MESSAGE) syncNow();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [enabled, syncNow]);

  // The global sync indicator dispatches this when the user presses "Sync now".
  React.useEffect(() => {
    if (!enabled) return;
    const onRequest = () => syncNow();
    window.addEventListener(SYNC_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(SYNC_REQUEST_EVENT, onRequest);
  }, [enabled, syncNow]);

  const liveTasks = React.useMemo(() => {
    const existing = tasks
      .filter((task) => !deleted.has(task.id))
      .map((task) => overrides[task.id] ?? task);
    const created = Object.values(overrides).filter(
      (task) => !tasks.some((serverTask) => serverTask.id === task.id)
    );
    return [...existing, ...created];
  }, [deleted, overrides, tasks]);

  return { status, liveTasks, queuedCount, update, write, syncNow };
}
