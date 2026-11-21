/**
 * Sync status — pure rules.
 *
 * The indicator has to tell the truth in six states, from "online and clean"
 * to "offline with unsent work". Keeping the derivation here means the UI and
 * its tests agree on what each count means.
 */

export type SyncPhase = "online" | "offline" | "syncing" | "pending" | "error" | "synced";

export type SyncReport = {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export function deriveSyncPhase(report: SyncReport): SyncPhase {
  if (!report.online) return "offline";
  if (report.failed > 0) return "error";
  if (report.syncing) return "syncing";
  if (report.pending > 0) return "pending";
  if (report.lastSuccessAt) return "synced";
  return "online";
}

export const SYNC_PHASE_LABEL: Record<SyncPhase, string> = {
  online: "Online",
  offline: "Offline",
  syncing: "Synchronizing",
  pending: "Changes pending",
  error: "Sync failed",
  synced: "Synced",
};

/** Human-readable last-sync time, or null when nothing has synced yet. */
export function formatLastSync(iso: string | null, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
