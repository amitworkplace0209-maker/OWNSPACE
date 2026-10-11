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
// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/**
 * Currency formatters, cached per code.
 *
 * `Intl.NumberFormat` construction is expensive enough that calling it inside a
 * table row shows up in a profile, so each currency is built once.
 */
const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, compact: boolean): Intl.NumberFormat {
  const key = `${currency}:${compact}`;
  let formatter = moneyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      // Compact mode drops the decimals: "?1.2Cr" reads better on a KPI tile
      // than "?1,20,00,000.00".
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    });
    moneyFormatters.set(key, formatter);
  }
  return formatter;
}

/**
 * Formats an amount as currency.
 *
 * Defaults to INR and formats with `en-IN`, which is the part that matters:
 * Indian grouping is 2-2-3, so twelve lakh fifty-six thousand renders
 * "?12,56,000.00" not "?1,256,000.00" as it would under `en-US`. Getting
 * this wrong makes every large figure look wrong to the people reading it.
 */
export function formatCurrency(
  value: number | null | undefined,
  currency = "INR",
  opts?: { compact?: boolean; fallback?: string }
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return opts?.fallback ?? "—";
  }

  try {
    return moneyFormatter(currency, opts?.compact ?? false).format(value);
  } catch {
    // An unknown code would throw; showing the bare number beats an error.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Signed amount, for income/expense rows where the direction is the point. */
export function formatSignedCurrency(
  value: number | null | undefined,
  currency = "INR",
  opts?: { compact?: boolean }
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const formatted = formatCurrency(Math.abs(value), currency, opts);
  if (value === 0) return formatted;
  return `${value > 0 ? "+" : "-"}${formatted}`;
}

/**
 * A percentage from a part of a total.
 *
 * Returns 0 rather than NaN when the total is zero an empty month is normal,
 * and "NaN%" would read as a bug.
 */
export function formatPercent(part: number, total: number, decimals = 0): string {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0) return "0%";
  const value = (part / total) * 100;
  return `${value.toFixed(decimals)}%`;
}

/** A plain grouped number, for counts and quantities with no currency. */
export function formatNumber(value: number | null | undefined, fallback = "0"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
}

/** True when a currency symbol leads the string, which Indian formats do. */
export function isNegativeCurrency(formatted: string): boolean {
  return formatted.startsWith("-") || formatted.includes("-?") || formatted.startsWith("-");
}
