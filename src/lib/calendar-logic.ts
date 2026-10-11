import type { CalendarItem, CalendarSource } from "@/lib/dal/calendar-bundle";

/**
 * Calendar arithmetic and presentation rules.
 *
 * Pure so the month/week/day/agenda views cannot disagree about which items
 * belong where, and so the rules are testable without a DOM (see
 * `calendar-logic.test.ts`).
 */

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** 0 = Sunday. Matches `Date#getDay`, which is what the grid is anchored to. */
export function monthGrid(year: number, monthIndex: number): Date[] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Always render whole weeks, so the grid is a stable 5 or 6 rows instead of
  // a ragged last row that reflows on every navigation.
  const leading = first.getDay();
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;

  return Array.from({ length: cells }, (_, i) => {
    const day = i - leading + 1;
    return new Date(year, monthIndex, day);
  });
}

export function startOfWeek(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const start = new Date(date);
  start.setDate(date.getDate() - date.getDay());
  return toIsoDate(start);
}

export function shiftDays(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftMonths(monthStr: string, delta: number): string {
  const [year, month] = monthStr.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "All day";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** Duration in minutes, or null when the end time is unknown. */
export function durationMinutes(item: CalendarItem): number | null {
  if (item.startMinutes === null || item.endMinutes === null) return null;
  const span = item.endMinutes - item.startMinutes;
  return span > 0 ? span : null;
}

/**
 * Items grouped by `YYYY-MM-DD`, sorted by time inside each day.
 *
 * All-day entries come first — they have no time to sort by, and putting them
 * at the top matches how people read a day.
 */
export function groupByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const grouped = new Map<string, CalendarItem[]>();

  for (const item of items) {
    const list = grouped.get(item.date) ?? [];
    list.push(item);
    grouped.set(item.date, list);
  }

  for (const [date, list] of grouped) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
    });
    grouped.set(date, list);
  }

  return grouped;
}

/** Drop finished or disabled work — a calendar is a plan, not an archive. */
export function isActive(item: CalendarItem): boolean {
  if (item.status === "done") return false;
  if (item.status === "completed") return false;
  if (item.status === "cancelled") return false;
  if (item.status === "disabled") return false;
  return true;
}

export type CalendarFilterState = {
  query: string;
  sources: CalendarSource[];
  projectId: string;
  types: string[];
};

export function applyCalendarFilters(
  items: CalendarItem[],
  filter: CalendarFilterState
): CalendarItem[] {
  const needle = filter.query.trim().toLowerCase();

  return items.filter((item) => {
    if (filter.sources.length > 0 && !filter.sources.includes(item.source)) return false;
    if (filter.projectId && item.projectId !== filter.projectId) return false;

    if (needle) {
      const haystack = [item.title, item.projectName ?? "", item.location ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

/** How busy each day is, used to shade the month grid. */
export function dayDensity(
  items: CalendarItem[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(item.date, (counts.get(item.date) ?? 0) + 1);
  }
  return counts;
}

/** 0-3, so a cell can pick a background step without a colour scale library. */
export function densityStep(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

export const DENSITY_CLASSES = [
  "",
  "bg-primary/5",
  "bg-primary/10",
  "bg-primary/20",
] as const;

/** Colour for a source badge — derived from tokens, never a literal hue. */
export const SOURCE_STYLES: Record<
  CalendarSource,
  { label: string; badge: string; dot: string }
> = {
  event: {
    label: "Event",
    badge: "bg-info/12 text-info",
    dot: "bg-info",
  },
  task: {
    label: "Task",
    badge: "bg-primary/12 text-primary",
    dot: "bg-primary",
  },
  reminder: {
    label: "Reminder",
    badge: "bg-warning/15 text-warning",
    dot: "bg-warning",
  },
  milestone: {
    label: "Milestone",
    badge: "bg-success/12 text-success",
    dot: "bg-success",
  },
};

/** Fallback event colours, keyed by event type. */
export const EVENT_TYPE_COLORS: Record<string, string> = {
  event: "#0ea5e9",
  meeting: "#8b5cf6",
  appointment: "#f59e0b",
  personal: "#10b981",
};

export function itemColor(item: CalendarItem): string | null {
  if (item.color) return item.color;
  if (item.source === "event") return EVENT_TYPE_COLORS.event ?? null;
  return null;
}