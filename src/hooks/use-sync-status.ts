"use client";

import * as React from "react";
import { SYNC_REQUEST_EVENT, SYNC_STATUS_EVENT } from "@/lib/offline/sync-events";
import { collectSyncReport } from "@/lib/offline/sync-status.client";
import { deriveSyncPhase, type SyncPhase, type SyncReport } from "@/lib/offline/sync-status";

const REFRESH_MS = 20_000;

/**
 * One status readout for every offline queue.
 *
 * Counts come from IndexedDB rather than React state so the number is still
 * right after a cold start. A same-tab event keeps it fresh while the app is
 * open, and a slow poll covers writes made by another tab.
 */
export function useSyncStatus(userId: string | null): {
  report: SyncReport;
  phase: SyncPhase;
  syncing: boolean;
  syncNow: () => void;
} {
  const [syncing, setSyncing] = React.useState(false);
  const [report, setReport] = React.useState<SyncReport>({
    online: true,
    syncing: false,
    pending: 0,
    failed: 0,
    lastSuccessAt: null,
    lastError: null,
  });

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const refresh = () => {
      void collectSyncReport(userId, navigator.onLine, syncing).then((next) => {
        if (!cancelled) setReport(next);
      });
    };

    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener(SYNC_STATUS_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(SYNC_STATUS_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [syncing, userId]);

  const syncNow = React.useCallback(() => {
    if (!navigator.onLine) return;
    setSyncing(true);
    window.dispatchEvent(new Event(SYNC_REQUEST_EVENT));
    // The replay hooks announce their progress through SYNC_STATUS_EVENT. This
    // is only a safety net for a queue that turns out to be empty.
    window.setTimeout(() => setSyncing(false), 1_500);
  }, []);

  return {
    report,
    phase: deriveSyncPhase(report),
    syncing,
    syncNow,
  };
}
