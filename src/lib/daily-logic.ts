import type { DailyNote, PlanningEntry } from "@/types";

/**
 * Daily planner — pure logic.
 *
 * Everything here is calendar arithmetic and shaping, kept out of the component
 * and the route so it can be tested without a clock or a database.
 *
 * The one rule that drives the whole page: **a journal day is the viewer's
 * local calendar day.** The rest of the app stores UTC (`todayIsoDate`), which
 * is right for a due date — but a journal that rolled over at 00:00 UTC would
 * change day at 05:30 for anyone east of Greenwich, which is not what "today"
 * means to the person writing it.
 */

/** A journal day as YYYY-MM-DD, resolved in the viewer's own time zone. */
export function localDateIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Parses YYYY-MM-DD as a *local* midnight.
 *
 * `new Date("2026-03-01")` parses as UTC, which lands on the previous day for
 * anyone west of Greenwich. Splitting the parts and using the numeric
 * constructor keeps every date arithmetic on the same clock as the calendar the
 * user is looking at.
 */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/**
 * Moves a date by whole days.
 *
 * Done through the local Date constructor rather than by adding milliseconds:
 * across a DST boundary, 24 hours is not one calendar day.
 */
export function shiftDate(date: string, delta: number): string {
  const base = parseLocalDate(date);
  base.setDate(base.getDate() + delta);
  return localDateIso(base);
}

/** Whole days between two dates, ignoring the time of day. */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from).getTime();
  const b = parseLocalDate(to).getTime();
  // Both are local midnight, so the difference is exact across DST.
  return Math.round((b - a) / 86_400_000);
}

/** The seven dates of the week containing `date`, Sunday first. */
export function weekDates(date: string): string[] {
  const base = parseLocalDate(date);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return localDateIso(day);
  });
}

/**
 * The window the route fetches: a week either side of the selected day.
 *
 * Fetching only the visible week meant the next day fell outside the payload
 * the moment the week ended, so crossing midnight needed a full refetch. With a
 * week of slack on both sides, moving between nearby days — which is what the
 * rollover does — is served entirely from data already on the client.
 */
export function windowAround(date: string, days = 7): { from: string; to: string } {
  return { from: shiftDate(date, -days), to: shiftDate(date, days) };
}

/**
 * Milliseconds until the next journal day begins, plus a grace period.
 *
 * The default minute of grace is deliberate: firing exactly on the hour races
 * the browser's own clock change and a server whose date has not ticked yet, so
 * the page would render the new day with the old day's data for a moment.
 */
export const ROLLOVER_GRACE_MS = 60_000;

export function msUntilRollover(now: Date = new Date(), graceMs = ROLLOVER_GRACE_MS): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  next.setTime(next.getTime() + graceMs);
  return next.getTime() - now.getTime();
}

/** "8h 12m" / "42m" / "in a moment" — for the countdown chip. */
export function describeDuration(ms: number): string {
  if (ms <= 0) return "now";
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) return "less than a minute";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** "Today" / "Yesterday" / "Tomorrow" / "Friday" / "Mar 14". */
export function relativeDayLabel(date: string, today: string): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  const parsed = parseLocalDate(date);
  if (diff > 1 && diff < 7) {
    return parsed.toLocaleDateString(undefined, { weekday: "long" });
  }
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function longDayLabel(date: string): string {
  return parseLocalDate(date).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** "14:30" → 870 minutes past midnight. Null when the value is not a time. */
export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  const fmt = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  if (from === null && to === null) return "Any time";
  if (from === null) return `Until ${fmt(to as number)}`;
  if (to === null) return `From ${fmt(from)}`;
  return `${fmt(from)} – ${fmt(to)}`;
}

/**
 * Minutes a block occupies.
 *
 * An end that is not after the start is treated as a one-hour block rather than
 * as a negative duration — a planning block that crosses midnight is a mistake,
 * and reporting "-120m" would be worse than a sensible fallback.
 */
export function blockMinutes(entry: {
  start_time: string | null;
  end_time: string | null;
}): number {
  const start = timeToMinutes(entry.start_time);
  const end = timeToMinutes(entry.end_time);
  if (start === null || end === null) return 0;
  if (end <= start) return 60;
  return end - start;
}

export function planningTotalMinutes(entries: PlanningEntry[]): number {
  return entries.reduce((total, entry) => total + blockMinutes(entry), 0);
}

/** Entries ordered by start time, with untimed blocks last but stable. */
export function sortPlanning(entries: PlanningEntry[]): PlanningEntry[] {
  return [...entries].sort((a, b) => {
    const left = timeToMinutes(a.start_time);
    const right = timeToMinutes(b.start_time);
    if (left === null && right === null) return a.created_at.localeCompare(b.created_at);
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
}

/** Longest run of consecutive days ending today (or yesterday) with a note. */
export function journalStreak(noteDates: string[], today: string): number {
  if (noteDates.length === 0) return 0;
  const set = new Set(noteDates);

  // A streak is still alive if today has no note yet but yesterday did — it
  // should not read as "broken" simply because the day has just begun.
  let cursor = set.has(today) ? today : shiftDate(today, -1);
  if (!set.has(cursor)) return 0;

  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export const NOTE_SECTIONS = [
  { key: "todays_work", label: "Today's work", placeholder: "What are you working on?" },
  { key: "completed_work", label: "Completed", placeholder: "What got finished?" },
  { key: "problems", label: "Problems", placeholder: "What is in the way?" },
  { key: "ideas", label: "Ideas", placeholder: "Anything worth remembering?" },
  { key: "next_steps", label: "Next steps", placeholder: "Where you pick this up tomorrow." },
] as const;

export type NoteSectionKey = (typeof NOTE_SECTIONS)[number]["key"];

/** The structured blocks that actually hold something. */
export function filledSections(note: DailyNote | null): Array<{ key: NoteSectionKey; label: string; value: string }> {
  if (!note) return [];
  return NOTE_SECTIONS.flatMap((section) => {
    const value = (note[section.key] ?? "").trim();
    return value ? [{ key: section.key, label: section.label, value }] : [];
  });
}

export type DaySummary = {
  notes: number;
  sectionsFilled: number;
  plannedBlocks: number;
  plannedMinutes: number;
  hasNote: boolean;
};

/** Headline numbers for one day, derived from the same rows the page renders. */
export function summariseDay(
  date: string,
  notes: DailyNote[],
  planning: PlanningEntry[]
): DaySummary {
  const dateNotes = notes.filter((note) => note.note_date === date);
  const datePlanning = planning.filter((entry) => entry.plan_date === date);

  let sectionsFilled = 0;
  for (const note of dateNotes) {
    sectionsFilled += filledSections(note).length;
  }

  return {
    notes: dateNotes.length,
    sectionsFilled,
    plannedBlocks: datePlanning.length,
    plannedMinutes: planningTotalMinutes(datePlanning),
    hasNote: dateNotes.some((note) => note.content.trim() || sectionsFilled > 0),
  };
}

/** Trims a textarea value into the column shape the database expects. */
export function normaliseSection(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

/**
 * Accent for a priority chip.
 *
 * Fixed hexes rather than theme tokens, because they sit as a bare dot against
 * the card background and have to read the same in every appearance preset.
 */
export function fillColour(priority: string): string {
  switch (priority) {
    case "urgent":
      return "#ef4444";
    case "high":
      return "#f97316";
    case "medium":
      return "#eab308";
    case "low":
      return "#3b82f6";
    default:
      return "var(--muted-foreground)";
  }
}