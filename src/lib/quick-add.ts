import type { Priority } from "@/types";

/**
 * Quick-add parser — turns "tomorrow 9am call mum" into a reminder.
 *
 * The point is that the common case never opens a form. The grammar is
 * deliberately small and forgiving: it recognises a *when*, takes everything
 * after it as the title, and anything it cannot parse still produces a usable
 * reminder with the default time rather than an error.
 *
 * Pure and dependency-free so the whole grammar is unit tested.
 */

export type ParsedQuickReminder = {
  /** What the user typed minus the recognised time expression. */
  title: string;
  /** Local `datetime-local` string, ready for the form field. */
  remindAt: string;
  /** Null when the input carried no recognisable time. */
  matched: string | null;
  /** Words we consumed but could not place on the calendar. */
  unmatched: string[];
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/** Default lead time when the input names no time at all. */
export const DEFAULT_LEAD_MINUTES = 60;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local `YYYY-MM-DDTHH:mm`, the shape `datetime-local` expects. */
function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

/** The next round half hour at least `leadMinutes` out. */
function defaultTarget(now: Date, leadMinutes: number): Date {
  const target = new Date(now.getTime() + leadMinutes * 60_000);
  target.setMinutes(target.getMinutes() < 30 ? 0 : 30, 0, 0);
  return target;
}

/** Days from `now` to the next occurrence of `weekday`, always in the future. */
function nextWeekday(now: Date, weekday: number): Date {
  const target = new Date(now.getTime());
  const delta = (weekday - target.getDay() + 7) % 7;
  target.setDate(target.getDate() + (delta === 0 ? 7 : delta));
  return target;
}

/**
 * The clock time inside a string, if there is one.
 *
 * Returns the minutes past midnight plus the span it occupied in the source,
 * so the caller can cut the words out of the title. `9` alone is deliberately
 * *not* a time — "buy 9 apples" must stay a title, not become 09:00.
 */
function findClock(text: string): { minutes: number; start: number; end: number } | null {
  const patterns: Array<{ re: RegExp; build: (h: number, m: number, meridiem: string | null) => number | null }> = [
    {
      // 9am, 9 am, 9:30pm, 9:30 pm
      re: /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,
      build: (h, m, meridiem) => to24(h, m, meridiem ?? null),
    },
    {
      // 21:30 — 24h clock. The leading \b plus a 0-23 range keeps version
      // numbers and sizes out.
      re: /\b([01]?\d|2[0-3]):([0-5]\d)\b/g,
      build: (h, m) => (h * 60 + m <= 24 * 60 - 1 ? h * 60 + m : null),
    },
    {
      // bare "at 9" — only with the preposition, which is what distinguishes it
      // from a quantity.
      re: /\bat\s+(\d{1,2})\b/gi,
      build: (h) => (h >= 0 && h <= 23 ? h * 60 : null),
    },
  ];

  for (const { re, build } of patterns) {
    re.lastIndex = 0;
    const match = re.exec(text);
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const minutes = build(hour, minute, (match[3] as string | undefined) ?? null);
    if (minutes === null) continue;
    return { minutes, start: match.index, end: match.index + match[0].length };
  }

  return null;
}

function to24(hour: number, minute: number, meridiem: string | null): number | null {
  if (minute > 59) return null;
  if (meridiem) {
    const lower = meridiem.toLowerCase();
    let h = hour;
    if (lower === "pm" && h < 12) h += 12;
    if (lower === "am" && h === 12) h = 0;
    return h > 23 ? null : h * 60 + minute;
  }
  return hour > 23 ? null : hour * 60 + minute;
}

/** Applies a found clock time to a date, rolling to tomorrow when it has passed. */
function applyClock(day: Date, minutes: number, now: Date, rollIfPast: boolean): Date {
  const target = new Date(day.getTime());
  target.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  if (rollIfPast && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

/**
 * Parses a quick-add line.
 *
 * Recognised, in priority order:
 *   - relative durations: `in 10m`, `in 2 hours`, `in 3d`
 *   - `today` / `tonight` / `tomorrow`
 *   - weekday names, with `next ` to force the following week
 *   - a bare clock time, which anchors to today (rolling to tomorrow if past)
 *
 * The day and the clock are resolved independently, so "tomorrow 9am" and
 * "friday" both work, and "friday 6pm" works as the combination.
 */
export function parseQuickReminder(
  input: string,
  now: Date = new Date()
): ParsedQuickReminder {
  const text = input.trim();
  if (!text) {
    return { title: "", remindAt: toLocalInput(defaultTarget(now, DEFAULT_LEAD_MINUTES)), matched: null, unmatched: [] };
  }

  const unmatched: string[] = [];
  let day: Date | null = null;
  let matched: string | null = null;

  // 1. Relative durations win — they carry their own time of day.
  const relative = text.match(/\bin\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)\b/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const minutes = unit.startsWith("h")
      ? amount * 60
      : unit.startsWith("d")
        ? amount * 1440
        : amount;
    const target = new Date(now.getTime() + minutes * 60_000);
    day = target;
    matched = relative[0];
    unmatched.push(relative[0]);
  }

  // 2. Named days.
  const dayToken = text.match(
    /\b(today|tonight|tomorrow|tmrw|next\s+(?:sun|mon|tue|tues|wed|thu|thurs|fri|sat)[a-z]*|(?:sun|mon|tue|tues|wed|thu|thurs|fri|sat)[a-z]*day)\b/i
  );
  if (dayToken) {
    const token = dayToken[0].toLowerCase().replace(/\s+/g, " ");
    unmatched.push(dayToken[0]);

    if (token === "today" || token === "tonight") {
      const base = new Date(now.getTime());
      day = base;
      matched = dayToken[0];
    } else if (token === "tomorrow" || token === "tmrw") {
      const base = new Date(now.getTime());
      base.setDate(base.getDate() + 1);
      day = base;
      matched = dayToken[0];
    } else {
      const name = token.replace(/^next\s+/, "");
      const weekday = WEEKDAYS[name];
      if (weekday !== undefined) {
        const base = nextWeekday(now, weekday);
        day = base;
        matched = dayToken[0];
      }
    }
  }

  // 3. A clock time, anchored to whichever day we resolved (or today).
  const clock = findClock(text);
  let hasClock = false;
  if (clock) {
    hasClock = true;
    unmatched.push(text.slice(clock.start, clock.end));
    const anchor = day ?? new Date(now.getTime());
    // A named day means "that day's time", so it must never roll forward.
    day = applyClock(anchor, clock.minutes, now, !dayToken && !relative);
    if (!matched) matched = text.slice(clock.start, clock.end);
  }

  // 4. "tonight" implies a sensible hour when no clock was given.
  if (!hasClock && dayToken && /tonight/i.test(dayToken[0]) && day) {
    day.setHours(20, 0, 0, 0);
  }

  const target = day ?? defaultTarget(now, DEFAULT_LEAD_MINUTES);

  // Title = everything except the words we consumed as time.
  let title = text;
  for (const token of unmatched) {
    title = title.replace(token, " ");
  }
  title = title
    .replace(/\b(at|on|in|by|remind me|remind)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();

  // Capitalise the first letter so "call mum" becomes "Call mum".
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title, remindAt: toLocalInput(target), matched, unmatched };
}

/**
 * Priority keywords, checked against the title after parsing.
 *
 * Returns null when nothing matched, so the caller can leave the stored
 * priority alone rather than overwriting a "none" it never set.
 */
export function quickPriority(title: string): Priority | null {
  const text = title.toLowerCase();
  if (/\b(urgent|asap|critical|emergency)\b/.test(text)) return "urgent";
  if (/\b(important|high)\b/.test(text)) return "high";
  if (/\b(low priority|whenever|optional|nice to have)\b/.test(text)) return "low";
  return null;
}