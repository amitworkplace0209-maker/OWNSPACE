/**
 * Timeline labels and date helpers.
 *
 * In its own module with no `"use client"`, deliberately. These are pure string
 * functions, and the timeline page is a server component that calls them while it
 * builds the rows — but they were living inside `timeline-workspace.tsx`, which is
 * a client module. Next then refuses to let the server call them, and the whole
 * page fails with "Attempted to call statusLabelOf() from the server" and falls
 * back to the error boundary. Nothing about the function needs a browser; only
 * its old location said it did.
 *
 * The same applies to the date helpers below, which the server needs for the same
 * reason: grouping by month has to happen before anything is rendered.
 */

const statusLabel: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  triggered: "Triggered",
  dismissed: "Dismissed",
  snoozed: "Snoozed",
  archived: "Archived",
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

/**
 * A human label for a status, falling back to the raw value.
 *
 * The fallback matters: a status added to the database later than this file would
 * otherwise render as an empty cell. Showing `in_review` is odd; showing nothing
 * is worse, because it reads as a rendering bug rather than as new data.
 */
export function statusLabelOf(status: string): string {
  return statusLabel[status] ?? status;
}

/** `YYYY-MM-DD` in local time, deliberately not `toISOString`. */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `YYYY-MM` in local time. */
export function localMonthStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** `YYYY-MM-DD HH:MM` in local time, for grouping keys and subtitles. */
export function localDateTimeStr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${localDateStr(d)} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}