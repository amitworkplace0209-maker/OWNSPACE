import {
  format,
  formatDistanceToNow,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from "date-fns";

/** Formats a YYYY-MM-DD date or an ISO timestamp into "Sep 7, 2026". */
export function formatDate(
  value: string | null | undefined,
  opts?: { fallback?: string }
): string {
  if (!value) return opts?.fallback ?? "—";
  const d = parseISO(value);
  try {
    return format(d, "MMM d, yyyy");
  } catch {
    return opts?.fallback ?? "—";
  }
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d");
  } catch {
    return "—";
  }
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    // value is an ISO datetime or a plain "HH:MM:SS" from a `time` column
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) {
      const [h, m] = value.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return format(d, "h:mm a");
    }
    return format(parseISO(value), "h:mm a");
  } catch {
    return value;
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, yyyy 'at' h:mm a");
  } catch {
    return "—";
  }
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return formatDistanceToNow(parseISO(value), { addSuffix: true });
  } catch {
    return "—";
  }
}

/** Short human label used on calendar chips: "Today", "Tomorrow", or a date. */
export function dayLabel(value: string | Date): string {
  const d = typeof value === "string" ? parseISO(value) : value;
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "MMM d");
}

/** Short date-time for lists, e.g. "Sep 7, 2026 2:30 PM". */
export function formatDateTimeShort(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return format(parseISO(value), "MMM d, h:mm a");
  } catch {
    return "—";
  }
}

/** Human duration from a millisecond span, e.g. "1h 5m". */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000);
  return formatDurationMinutes(totalMinutes);
}

export function isOverdueDate(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    return isPast(parseISO(value)) && !isToday(parseISO(value));
  } catch {
    return false;
  }
}

export function formatDurationMinutes(totalMinutes: number): string {
  const m = Math.round(totalMinutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Splits a camelCase/snake_case identifier into readable words. */
export function humanize(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/(^|[\s.])([a-z])/g, (_, pre, c) => pre + c.toUpperCase());
}

/**
 * Converts a local `<input type="datetime-local">` value ("YYYY-MM-DDTHH:MM")
 * into a full ISO-8601/UTC string for storage. A value that is already a full
 * ISO timestamp passes through unchanged. Returns "" for empty input.
 */
export function toIsoSubmit(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) {
    return new Date(trimmed).toISOString();
  }
  return trimmed;
}