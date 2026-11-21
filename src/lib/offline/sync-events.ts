/**
 * Cross-component messages for the offline sync UI.
 *
 * Kept in one place so the indicator that asks for a sync and the hooks that
 * perform it cannot drift apart on the event name.
 */

/** Dispatched by the sync indicator's "Sync now" button. */
export const SYNC_REQUEST_EVENT = "ownspece:sync-request";

/** Dispatched when a cache records a change to pending/failed counts. */
export const SYNC_STATUS_EVENT = "ownspece:sync-status-changed";

/** Lets a cache tell the UI (and the baked readers) that its contents changed. */
export function announceSyncChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SYNC_STATUS_EVENT));
}
