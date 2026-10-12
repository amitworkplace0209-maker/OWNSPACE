import { deriveReminderState, type ReminderState } from "@/lib/dashboard-logic";
import type {
  NotificationChannel,
  Priority,
  Reminder,
  ReminderRepeat,
  ReminderStatus,
} from "@/types";

/** Statuses that are still live — i.e. work that can still fire. */
export const LIVE_STATUSES: ReminderStatus[] = ["pending", "snoozed"];

/** Statuses that mean "this reminder is finished with". */
export const DONE_STATUSES: ReminderStatus[] = ["triggered", "dismissed"];

/** Ordering used wherever reminders are listed: urgency first. */
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "None",
};

export const REPEAT_LABEL: Record<ReminderRepeat, string> = {
  none: "Does not repeat",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
  custom: "Custom weekdays",
};

/** Plurals for "every N ___", which is not a plain +"s" on any of these. */
const REPEAT_UNIT: Partial<Record<ReminderRepeat, string>> = {
  daily: "days",
  weekly: "weeks",
  monthly: "months",
  yearly: "years",
};

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  in_app: "In-app",
  browser: "Browser",
  push: "Push",
  email: "Email",
};

export const SNOOZE_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "10m", minutes: 10 },
  { label: "30m", minutes: 30 },
  { label: "1h", minutes: 60 },
  { label: "3h", minutes: 180 },
  { label: "Tomorrow", minutes: 0 }, // 0 is the "next 9am" sentinel, see snoozeUntilTomorrow
];

export const ADVANCE_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "At the time", minutes: 0 },
  { label: "5 min before", minutes: 5 },
  { label: "15 min before", minutes: 15 },
  { label: "30 min before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
  { label: "1 week before", minutes: 10080 },
];

export const CHANNEL_OPTIONS = Object.entries(CHANNEL_LABEL) as Array<
  [NotificationChannel, string]
>;

/**
 * When a reminder actually *fires*, as opposed to the time the user set.
 *
 * `advance_minutes` exists to nag you before the deadline, so a reminder set
 * for 3pm with a 1-hour heads-up fires at 2pm. Without this the advance field
 * would be decoration.
 */
export function fireTime(reminder: Pick<Reminder, "remind_at" | "advance_minutes">): Date {
  const at = new Date(reminder.remind_at);
  const advance = Number.isFinite(reminder.advance_minutes) ? reminder.advance_minutes : 0;
  return new Date(at.getTime() - Math.max(0, advance) * 60_000);
}

/**
 * The next time a repeating reminder should fire, or null when it is done.
 *
 * Returns null for `repeat_rule: "none"` and for an occurrence past
 * `repeat_until`. Monthly and yearly clamp to the last valid day rather than
 * rolling into the next month — a reminder on the 31st that skips February
 * would otherwise silently land on 3 March and never come back.
 */
export function nextOccurrence(
  from: string | Date,
  repeat: {
    repeat_rule: ReminderRepeat;
    repeat_interval: number | null;
    repeat_until: string | null;
    repeat_days?: number[] | null;
  }
): string | null {
  if (repeat.repeat_rule === "none") return null;

  const base = typeof from === "string" ? new Date(from) : new Date(from.getTime());
  if (Number.isNaN(base.getTime())) return null;

  const every = Math.max(1, Math.trunc(repeat.repeat_interval ?? 1));
  const until = repeat.repeat_until ? new Date(`${repeat.repeat_until}T23:59:59.999`) : null;

  let next: Date | null = null;

  if (repeat.repeat_rule === "custom") {
    const days = (repeat.repeat_days ?? []).filter((day) => day >= 0 && day <= 6);
    if (days.length === 0) return null;

    // Same clock time, next occurrence on one of the chosen weekdays. Scanning
    // a bounded 8 days is enough: 7 days covers every weekday, and the extra
    // day lets "today" stay valid when today is one of the chosen days.
    for (let offset = 1; offset <= 8; offset += 1) {
      const candidate = new Date(base.getTime());
      candidate.setDate(base.getDate() + offset);
      if (days.includes(candidate.getDay())) {
        next = candidate;
        break;
      }
    }
  } else {
    // Day-of-month is captured before the arithmetic: setMonth on a 31st
    // overflows straight into the next month (Jan 31 -> Mar 3), so the day is
    // pinned to the 1st first and restored clamped afterwards.
    const dayOfMonth = base.getDate();
    next = new Date(base.getTime());

    if (repeat.repeat_rule === "monthly") {
      next.setDate(1);
      next.setMonth(base.getMonth() + every);
      next.setDate(clampToMonth(next.getFullYear(), next.getMonth(), dayOfMonth));
    } else if (repeat.repeat_rule === "yearly") {
      next.setDate(1);
      next.setFullYear(base.getFullYear() + every);
      // Clamping by month also covers Feb 29 -> Feb 28 in a non-leap year.
      next.setDate(clampToMonth(next.getFullYear(), base.getMonth(), dayOfMonth));
    } else if (repeat.repeat_rule === "daily") {
      next.setDate(next.getDate() + every);
    } else if (repeat.repeat_rule === "weekly") {
      next.setDate(next.getDate() + every * 7);
    } else {
      return null;
    }
  }

  if (!next) return null;
  if (until && next.getTime() > until.getTime()) return null;
  return next.toISOString();
}

/** Last valid day of a month, used to clamp month/year arithmetic. */
function clampToMonth(year: number, month: number, desiredDay: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(desiredDay, lastDay);
}

/** True when a reminder is set to come back around. */
export function isRecurring(reminder: Pick<Reminder, "repeat_rule">): boolean {
  return reminder.repeat_rule !== "none";
}

/** A short, human description of the repeat rule, e.g. "Every 2 weeks". */
export function repeatSummary(
  reminder: Pick<Reminder, "repeat_rule" | "repeat_interval" | "repeat_until" | "repeat_days">
): string | null {
  const { repeat_rule: rule, repeat_interval: interval, repeat_until: until } = reminder;
  if (rule === "none") return null;

  if (rule === "custom") {
    const days = reminder.repeat_days ?? [];
    if (days.length === 0) return "Custom — no days picked";
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Every ${[...days].sort((a, b) => a - b).map((day) => names[day]).join(", ")}`;
  }

  const every = Math.max(1, Math.trunc(interval ?? 1));
  if (every === 1) {
    const base = REPEAT_LABEL[rule].toLowerCase();
    return until ? `${base} until ${until}` : base;
  }

  // "weekly" does not pluralise by appending "s" — that gives "weeklys".
  const unit = REPEAT_UNIT[rule] ?? rule;
  const base = `every ${every} ${unit}`;
  return until ? `${base} until ${until}` : base;
}

/**
 * Single definition of a reminder's display state.
 *
 * Re-exported rather than redefined: an earlier version of this file had its
 * own copy that ignored `advance_minutes` and lacked the "due soon" state, so
 * the dashboard and this page disagreed about the same reminder. The one in
 * `dashboard-logic` is the original and is where the logic now lives.
 */
export { deriveReminderState } from "@/lib/dashboard-logic";

export function isLive(reminder: Pick<Reminder, "status">): boolean {
  return LIVE_STATUSES.includes(reminder.status);
}

export function isDone(reminder: Pick<Reminder, "status">): boolean {
  return DONE_STATUSES.includes(reminder.status);
}

/**
 * Minutes until a snoozed reminder comes back, or null when it is not snoozed.
 * The value lives in `snoozed_until`, so `remind_at` keeps the time the user
 * originally chose and un-snoozing can put it back.
 */
export function minutesUntilSnooze(reminder: Pick<Reminder, "status" | "snoozed_until">): number | null {
  if (reminder.status !== "snoozed" || !reminder.snoozed_until) return null;
  const at = new Date(reminder.snoozed_until).getTime();
  if (Number.isNaN(at)) return null;
  return Math.round((at - Date.now()) / 60_000);
}

/** Snooze target for the "Tomorrow" preset: 9am the next day. */
export function snoozeUntilTomorrow(from: Date = new Date()): Date {
  const target = new Date(from.getTime());
  target.setDate(target.getDate() + 1);
  target.setHours(9, 0, 0, 0);
  return target;
}

// ---------------------------------------------------------------------------
// Filtering, grouping, stats — all pure so the page can be tested without a DB.
// ---------------------------------------------------------------------------

export type ReminderFilterState = {
  query: string;
  projectId: string;
  /** "all" mixes project reminders with personal ones; "personal" excludes any
   *  that belong to a project; otherwise an exact project id. */
  scope: "all" | "personal";
  priority: Priority | "";
  state: ReminderState | "live" | "";
  repeat: "any" | "repeating" | "once";
};

export type ReminderListItem = Reminder & {
  project_name: string | null;
  project_color: string | null;
  /**
   * Set while the row differs from the server because of a queued offline edit.
   * Declared here as well as on `CachedReminder` so the list can render the
   * "not synced" state without the DAL type and the cache type diverging.
   */
  pending?: boolean;
};

export type ReminderGroup = { id: string; label: string; items: ReminderListItem[] };

/**
 * Applies every filter in one place, so the list, the stat tiles and the empty
 * state can never disagree about what is visible.
 */
export function applyReminderFilters(
  reminders: ReminderListItem[],
  filter: ReminderFilterState,
  now: Date = new Date()
): ReminderListItem[] {
  const needle = filter.query.trim().toLowerCase();

  return reminders.filter((reminder) => {
    if (filter.scope === "personal" && reminder.project_id) return false;
    if (filter.projectId && reminder.project_id !== filter.projectId) return false;
    if (filter.priority && reminder.priority !== filter.priority) return false;

    if (filter.repeat === "repeating" && !isRecurring(reminder)) return false;
    if (filter.repeat === "once" && isRecurring(reminder)) return false;

    const state = deriveReminderState(reminder, now);
    if (filter.state === "live" && !isLive(reminder)) return false;
    if (filter.state && filter.state !== "live" && state !== filter.state) return false;

    if (needle) {
      const haystack = [reminder.title, reminder.note ?? "", reminder.description ?? "", reminder.project_name ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

export type ReminderStats = {
  total: number;
  dueToday: number;
  overdue: number;
  /** Fires within the next 24 hours. Part of `upcoming`, not separate from it. */
  dueSoon: number;
  upcoming: number;
  snoozed: number;
  done: number;
  disabled: number;
  repeating: number;
  personal: number;
  byProject: Record<string, number>;
  byPriority: Record<string, number>;
  /** Share of live reminders that are not overdue, 0-100. */
  onTimeRate: number;
};

/**
 * Stats are computed from the same array the list renders, never from a second
 * aggregate query — otherwise the numbers above the list can drift from the
 * list itself.
 */
export function computeReminderStats(
  reminders: ReminderListItem[],
  now: Date = new Date()
): ReminderStats {
  const stats: ReminderStats = {
    total: reminders.length,
    dueToday: 0,
    overdue: 0,
    dueSoon: 0,
    upcoming: 0,
    snoozed: 0,
    done: 0,
    disabled: 0,
    repeating: 0,
    personal: 0,
    byProject: {},
    byPriority: {},
    onTimeRate: 0,
  };

  const today = localIsoDate(now);
  let live = 0;
  let onTime = 0;

  for (const reminder of reminders) {
    const state = deriveReminderState(reminder, now);

    if (isRecurring(reminder)) stats.repeating += 1;
    if (!reminder.project_id) stats.personal += 1;
    if (!reminder.is_enabled) stats.disabled += 1;

    stats.byPriority[reminder.priority] = (stats.byPriority[reminder.priority] ?? 0) + 1;
    const projectKey = reminder.project_id ?? "personal";
    stats.byProject[projectKey] = (stats.byProject[projectKey] ?? 0) + 1;

    if (isLive(reminder)) {
      live += 1;
      if (state !== "overdue") onTime += 1;
    }

    if (state === "overdue") stats.overdue += 1;
    else if (state === "snoozed") stats.snoozed += 1;
    else if (isDone(reminder)) stats.done += 1;
    else {
      // `due_soon` is its own state but is not a separate bucket from
      // upcoming — counting only "upcoming" would silently drop every
      // reminder inside the next 24 hours.
      if (state === "due_soon") stats.dueSoon += 1;
      stats.upcoming += 1;
      if (localIsoDate(new Date(reminder.remind_at)) === today) stats.dueToday += 1;
    }
  }

  stats.onTimeRate = live === 0 ? 100 : Math.round((onTime / live) * 100);
  return stats;
}

export type ReminderGrouping = "none" | "project" | "state" | "priority" | "day";

/**
 * Buckets for the list view. Overdue sorts above today above the rest, because
 * that is the order someone actually works a reminder list in.
 */
export function groupReminders(
  reminders: ReminderListItem[],
  grouped: ReminderGrouping,
  now: Date = new Date()
): ReminderGroup[] {
  if (grouped === "none") return [{ id: "all", label: "All reminders", items: reminders }];

  const buckets = new Map<string, ReminderGroup>();
  const ensure = (id: string, label: string): ReminderGroup => {
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { id, label, items: [] };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  for (const reminder of reminders) {
    if (grouped === "project") {
      ensure(
        reminder.project_id ?? "personal",
        reminder.project_name ?? "Personal reminders"
      ).items.push(reminder);
      continue;
    }
    if (grouped === "state") {
      ensure(deriveReminderState(reminder, now), deriveReminderState(reminder, now)).items.push(reminder);
      continue;
    }
    if (grouped === "priority") {
      ensure(reminder.priority, PRIORITY_LABEL[reminder.priority]).items.push(reminder);
      continue;
    }
    if (grouped === "day") {
      const key = localIsoDate(new Date(reminder.remind_at));
      ensure(key, dayLabelFor(key, now)).items.push(reminder);
    }
  }

  const stateOrder = ["overdue", "due_soon", "snoozed", "upcoming", "done"];
  const rank = (id: string): number => {
    if (grouped === "state") return stateOrder.indexOf(id);
    if (grouped === "priority") return PRIORITY_RANK[id as Priority] ?? 99;
    return 0;
  };

  return [...buckets.values()].sort((a, b) => rank(a.id) - rank(b.id));
}

/** Sort that puts the work that matters first, regardless of group. */
export function sortReminders(reminders: ReminderListItem[]): ReminderListItem[] {
  return [...reminders].sort((a, b) => {
    const aLive = isLive(a) ? 0 : 1;
    const bLive = isLive(b) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;

    if (aLive === 0) {
      const at = fireTime(a).getTime();
      const bt = fireTime(b).getTime();
      if (at !== bt) return at - bt;
    }

    const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priority !== 0) return priority;
    return a.title.localeCompare(b.title);
  });
}

/** Local YYYY-MM-DD, matching how reminders are grouped and counted. */
export function localIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "Today" / "Tomorrow" / "Yesterday", else a short date. */
export function dayLabelFor(key: string, now: Date = new Date()): string {
  const today = localIsoDate(now);
  const tomorrow = new Date(now.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now.getTime());
  yesterday.setDate(yesterday.getDate() - 1);

  if (key === today) return "Today";
  if (key === localIsoDate(tomorrow)) return "Tomorrow";
  if (key === localIsoDate(yesterday)) return "Yesterday";
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * A default for the form: the next round hour at least `leadMinutes` out, so
 * "new reminder" opens on something sensible instead of a past timestamp.
 */
export function defaultRemindAt(leadMinutes = 60, now: Date = new Date()): string {
  const target = new Date(now.getTime() + leadMinutes * 60_000);
  target.setMinutes(target.getMinutes() < 30 ? 0 : 30, 0, 0);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(
    target.getHours()
  )}:${pad(target.getMinutes())}`;
}

/** Short label for a snooze preset or a saved snooze_minutes value. */
export function snoozeLabel(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}