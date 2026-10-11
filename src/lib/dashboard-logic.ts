// ============================================================================
// Dashboard domain logic — pure, dependency-free and shared by both the server
// (DAL rollups) and the client (live indicators).
//
// Keeping these rules here (rather than inline in components) means they can
// be unit tested, and that every dashboard surface computes the same answer
// from the same real data. No value in this file is invented: each function
// takes real rows from Supabase and derives a label, tone or number.
// ============================================================================

export type HealthState = "healthy" | "attention" | "at_risk";

export type ReminderState =
  | "overdue"
  | "due_soon"
  | "upcoming"
  | "snoozed"
  | "done";

export type SemanticTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type OpenTaskStatus = "backlog" | "todo" | "in_progress";

/** Statuses that still count as outstanding work. */
export const OPEN_TASK_STATUSES: readonly string[] = [
  "backlog",
  "todo",
  "in_progress",
];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * "Today" as a YYYY-MM-DD string.
 *
 * Deliberately UTC (`toISOString`), matching every other `due_date` filter in
 * the app (`getTasksDueToday`, `/tasks?due=today`, the calendar grid, the
 * analytics snapshot). Using the viewer's local date here would make the
 * dashboard's counts disagree with the pages it links to.
 */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whole calendar days from today until `value`.
 * Negative = in the past. Returns null when there is no date.
 *
 * Both sides resolve as UTC calendar days so the result never flips across a
 * time-zone boundary part-way through the day.
 */
export function daysUntil(
  value: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = Date.UTC(y, m - 1, d);
  if (Number.isNaN(target)) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / 86_400_000);
}

/** Hours from now until an ISO timestamp. Negative = in the past. */
export function hoursUntil(
  value: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return (ms - now.getTime()) / 3_600_000;
}

/** "Good evening" — bucketed by the viewer's local hour. */
export function greetingFor(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Today's work
// ---------------------------------------------------------------------------

export type TodayProgress = {
  completed: number;
  total: number;
  percent: number;
};

/**
 * Progress across the tasks due today.
 *
 *   total     = every task whose due date is today (completed ones included)
 *   completed = those with status "done"
 *
 * Tasks finished but not due today are deliberately excluded — the `tasks`
 * table has no `completed_at`, so "finished today" cannot be derived honestly.
 */
export function computeTodayProgress<
  T extends { status: string },
>(tasks: T[]): TodayProgress {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "done").length;
  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

// ---------------------------------------------------------------------------
// Project health
// ---------------------------------------------------------------------------

export type ProjectHealthInput = {
  /** Open tasks (backlog/todo/in_progress) whose due date is before today. */
  overdueTasks: number;
  /** Calendar days until the project due date. null = no due date set. */
  daysLeft: number | null;
  /** Project progress, 0–100. */
  progress: number;
};

/**
 * Project health, computed only from real project data.
 *
 * Evaluated top-down; the first rule that matches decides the state:
 *
 *   1. at_risk   — due date already passed and progress < 100
 *   2. at_risk   — 3 days or fewer left and progress < 50
 *   3. at_risk   — 7 days or fewer left and progress < 25
 *   4. at_risk   — 3+ overdue tasks and progress < 40
 *   5. attention — 1+ overdue tasks
 *   6. attention — 7 days or fewer left and progress < 50
 *   7. healthy   — otherwise
 *
 * Projects without a due date are never judged on time, only on overdue work.
 */
export function computeProjectHealth(input: ProjectHealthInput): HealthState {
  const { overdueTasks, daysLeft, progress } = input;

  if (daysLeft !== null && daysLeft < 0 && progress < 100) return "at_risk";
  if (daysLeft !== null && daysLeft <= 3 && progress < 50) return "at_risk";
  if (daysLeft !== null && daysLeft <= 7 && progress < 25) return "at_risk";
  if (overdueTasks >= 3 && progress < 40) return "at_risk";

  if (overdueTasks > 0) return "attention";
  if (daysLeft !== null && daysLeft <= 7 && progress < 50) return "attention";

  return "healthy";
}

export const HEALTH_LABEL: Record<HealthState, string> = {
  healthy: "Healthy",
  attention: "Attention",
  at_risk: "At risk",
};

export const HEALTH_TONE: Record<HealthState, SemanticTone> = {
  healthy: "success",
  attention: "warning",
  at_risk: "danger",
};

/** Short human countdown, e.g. "12 days left" / "Due today" / "5 days overdue". */
export function countdownLabel(daysLeft: number | null): string {
  if (daysLeft === null) return "";
  if (daysLeft < 0) return `${Math.abs(daysLeft)}d overdue`;
  if (daysLeft === 0) return "Due today";
  if (daysLeft === 1) return "1 day left";
  return `${daysLeft} days left`;
}

// ---------------------------------------------------------------------------
// Reminders & events
// ---------------------------------------------------------------------------

/**
 * Reminder visual state, mapped from the real `reminders.status` constraint
 * (pending | triggered | dismissed | snoozed) plus the remind time.
 *
 *   overdue   — still pending and the time has passed
 *   due_soon  — pending and due within the next 24 hours
 *   upcoming  — pending and further out
 *   snoozed   — explicitly snoozed
 *   done      — triggered or dismissed
 */
export function deriveReminderState(
  reminder: {
    remind_at: string;
    status: string;
    /** Fires this many minutes before `remind_at`; 0/undefined = at the time. */
    advance_minutes?: number | null;
    /** A muted reminder never counts as overdue, however far past it is. */
    is_enabled?: boolean | null;
  },
  now: Date = new Date()
): ReminderState {
  if (reminder.status === "snoozed") return "snoozed";
  if (reminder.status === "triggered" || reminder.status === "dismissed") {
    return "done";
  }
  // Muted means "do not fire", not "ignore forever" — it still shows as upcoming.
  if (reminder.is_enabled === false) return "upcoming";

  const advance = Number.isFinite(reminder.advance_minutes as number)
    ? Math.max(0, reminder.advance_minutes as number)
    : 0;
  // Compared as epoch millis rather than via `hoursUntil` on a rebuilt ISO
  // string: `new Date("nope").toISOString()` throws a RangeError, which would
  // turn a bad timestamp into a 500 instead of the "upcoming" fallback.
  const at = new Date(reminder.remind_at).getTime();
  if (Number.isNaN(at)) return "upcoming";

  const hours = (at - advance * 60_000 - now.getTime()) / 3_600_000;
  if (hours < 0) return "overdue";
  if (hours <= 24) return "due_soon";
  return "upcoming";
}

/** Same shape for calendar events, which have no status column. */
export function deriveEventState(
  event: { starts_at: string },
  now: Date = new Date()
): "overdue" | "due_soon" | "upcoming" {
  const hours = hoursUntil(event.starts_at, now);
  if (hours === null) return "upcoming";
  if (hours < 0) return "overdue";
  if (hours <= 24) return "due_soon";
  return "upcoming";
}

export const REMINDER_STATE_LABEL: Record<ReminderState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  snoozed: "Snoozed",
  done: "Done",
};

export const REMINDER_STATE_TONE: Record<ReminderState, SemanticTone> = {
  overdue: "danger",
  due_soon: "warning",
  upcoming: "neutral",
  snoozed: "info",
  done: "success",
};

/** Date-only items (task deadlines, milestones) have no status column. */
export function deriveDeadlineState(
  daysLeft: number | null
): "overdue" | "due_soon" | "upcoming" {
  if (daysLeft === null) return "upcoming";
  if (daysLeft < 0) return "overdue";
  if (daysLeft <= 1) return "due_soon";
  return "upcoming";
}

/** Shared tone/label maps for every state an agenda item can take. */
export type AgendaState = "overdue" | "due_soon" | "upcoming" | "snoozed";

export const AGENDA_STATE_LABEL: Record<AgendaState, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  upcoming: "Upcoming",
  snoozed: "Snoozed",
};

export const AGENDA_STATE_TONE: Record<AgendaState, SemanticTone> = {
  overdue: "danger",
  due_soon: "warning",
  upcoming: "neutral",
  snoozed: "info",
};

// ---------------------------------------------------------------------------
// KPI semantics
// ---------------------------------------------------------------------------

/** Overdue work: 0 is a good outcome, anything above 0 needs attention. */
export function overdueTone(count: number): SemanticTone {
  return count > 0 ? "danger" : "success";
}

/** Due today: neutral when empty, warning once there is something to do. */
export function dueTodayTone(count: number): SemanticTone {
  return count > 0 ? "warning" : "neutral";
}

/** Mirror of overdueTone for a boolean "is anything late" chip. */
export function syncTone(online: boolean): SemanticTone {
  return online ? "success" : "warning";
}
