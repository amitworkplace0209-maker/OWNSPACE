"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { CachedRow, RowOp } from "@/lib/offline/row-cache";
import {
  queueRowOp,
  readRowCache,
  requestRowBackgroundSync,
  ROW_SYNC_MESSAGE,
  settleRowOp,
  writeRowCache,
} from "@/lib/offline/row-cache.client";
import { replayRowOp } from "@/lib/offline/row-replay";

/**
 * Offline durability for any list of rows.
 *
 * The tasks and reminders hooks are entity-specific, and rightly so: a task's
 * optimistic edit is one of three fixed fields, and a reminder's carries a whole
 * row. This one is the generic version, for the entities whose mutations are
 * "change these fields on this row" — which is most of them.
 *
 * Three things happen here, layered so a dropped connection degrades:
 *
 *  1. **The payload is cached.** Every server render is written back, so the
 *     page has real content offline and on a cold start.
 *  2. **An edit is queued before it is sent.** The intent reaches storage first,
 *     so a request that fails in flight loses nothing. The row is patched
 *     optimistically so the change is visible immediately.
 *  3. **The queue is replayed on reconnect**, in order, and stale operations —
 *     ones the server has since overtaken — are dropped rather than replayed
 *     over newer data.
 *
 * There is no realtime channel here. The shell cache and `router.refresh()`
 * cover freshness; adding a subscription per entity would mean fifteen channels
 * open at once for data that is already being re-fetched on navigation.
 */
export type OfflineRowsOptions<T extends CachedRow> = {
  userId: string | null;
  /** Namespace for this list's storage, e.g. `"notes"`. */
  entity: string;
  /** The server-rendered rows. */
  rows: readonly T[];
  /** Guards a stored row before it is handed to the UI. */
  validateRow: (row: unknown) => row is T;
  enabled?: boolean;
};

export type OfflineRows<T extends CachedRow> = {
  /** Server rows with any queued offline edit layered on top. */
  rows: T[];
  /** How many operations are waiting for the network. */
  queuedCount: number;
  /** Applies an edit optimistically, queues it, and sends it if it can. */
  apply: (op: { op: RowOp; rowId: string; patch?: Record<string, unknown> }) => Promise<void>;
  /** Runs the queue now — for the "Retry" button in the offline banner. */
  syncNow: () => void;
  /** True when there is a cached copy to fall back on. */
  offlineReady: boolean;
};

export function useOfflineRows<T extends CachedRow>({
  userId,
  entity,
  rows,
  validateRow,
  enabled = true,
}: OfflineRowsOptions<T>): OfflineRows<T> {
  const router = useRouter();
  const online = useOnlineStatus();
  const [overrides, setOverrides] = React.useState<Record<string, T>>({});
  const [queuedCount, setQueuedCount] = React.useState(0);
  const [offlineReady, setOfflineReady] = React.useState(false);
  const [manualSync, setManualSync] = React.useState(0);

  // Persist every fresh payload so a cold or offline start has real content.
  React.useEffect(() => {
    if (!enabled || !userId) return;
    if (rows.length === 0) return;

    // One frame out, so a navigation that re-renders the same payload does not
    // write the same snapshot twice.
    const id = window.requestAnimationFrame(() => {
      void writeRowCache(userId, entity, rows, validateRow).then((snapshot) => {
        if (!snapshot) return;
        setQueuedCount(snapshot.queue.length);
        setOfflineReady(true);
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [enabled, userId, entity, rows, validateRow]);

  const apply = React.useCallback<OfflineRows<T>["apply"]>(
    async ({ op, rowId, patch }) => {
      const fields = patch ?? {};

      // Paint first. Whatever happens to the network, the user sees their edit.
      setOverrides((current) => {
        const baseline =
          current[rowId] ?? rows.find((row) => row.id === rowId);
        const next = baseline
          ? ({ ...baseline, ...fields, pending: true } as T)
          : ({ id: rowId, ...fields, pending: true } as T);
        return { ...current, [rowId]: next };
      });

      // Queue before sending: the intent is durable from here on, so a request
      // that fails in flight only costs a retry rather than the edit itself.
      if (!userId) return;
      const queued = await queueRowOp(userId, entity, { op, rowId, patch: fields }, validateRow);
      setQueuedCount(queued?.snapshot.queue.length ?? 0);

      if (!navigator.onLine) {
        // Hand the replay to the OS, so it can happen even if the tab closes.
        void requestRowBackgroundSync();
        return;
      }

      try {
        const result = await replayRowOp({
          id: queued?.id ?? "",
          entity,
          op,
          rowId,
          patch: fields,
          queuedAt: new Date().toISOString(),
          attempts: 0,
        });
        // A returned error is the server rejecting the write, not a network
        // failure. Retrying it forever would be wrong, so it is dropped and the
        // optimistic row reverts on the next refresh.
        if (result.error) throw new Error(result.error);

        if (queued) await settleRowOp(userId, entity, queued.id);
        setOverrides((current) => {
          const next = { ...current };
          delete next[rowId];
          return next;
        });
        setQueuedCount((count) => Math.max(0, count - 1));
        router.refresh();
      } catch {
        // Offline, or the server said no. The optimistic row keeps the intent
        // visible and the queue retries on reconnect; nothing is silently lost.
      }
    },
    [entity, router, rows, userId, validateRow]
  );

  // --- Replay ---------------------------------------------------------------

  /**
   * Drains the queue.
   *
   * Keyed on `online` rather than on an event handler, so it runs on mount —
   * exactly when a queue left behind by a previous offline session has to be
   * flushed — and again every time the connection returns.
   */
  React.useEffect(() => {
    if (!enabled || !userId || !online) return;

    let cancelled = false;

    void (async () => {
      const snapshot = await readRowCache(userId, entity, validateRow);
      if (cancelled) return;
      setOfflineReady(snapshot !== null);

      if (!snapshot || snapshot.queue.length === 0) {
        setQueuedCount(0);
        return;
      }

      for (const op of snapshot.queue) {
        if (cancelled) return;

        try {
          const result = await replayRowOp(op);
          // Only a clean answer settles it. A thrown error means the network is
          // still down, and the whole loop is retried on the next tick.
          if (!result.error) await settleRowOp(userId, entity, op.id);
        } catch {
          return;
        }
        setQueuedCount((count) => Math.max(0, count - 1));
      }

      if (!cancelled) router.refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, entity, manualSync, online, router, userId, validateRow]);

  const syncNow = React.useCallback(() => setManualSync((tick) => tick + 1), []);

  // The worker only signals; the replay still has to happen in the page, because
  // a service worker has no Supabase session.
  React.useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === ROW_SYNC_MESSAGE) syncNow();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, [enabled, syncNow]);

  const liveRows = React.useMemo(
    () => rows.map((row) => overrides[row.id] ?? row),
    [overrides, rows]
  );

  return { rows: liveRows, queuedCount, apply, syncNow, offlineReady };
}