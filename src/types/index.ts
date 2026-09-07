// ============================================================================
// Shared domain types — aligned 1:1 with the live PostgreSQL schema.
// The database check constraints are the source of truth for union members.
// ============================================================================

export type Theme = "light" | "dark" | "system";

export type SidebarState = "expanded" | "collapsed";

// --- Enums (must match DB check constraints) ---

export const PROJECT_STATUSES = [
  "active",
  "on_hold",
  "completed",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PHASE_STATUSES = [
  "planned",
  "in_progress",
  "completed",
  "blocked",
] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

export const MILESTONE_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EVENT_TYPES = ["event", "meeting", "appointment", "personal"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const REMINDER_STATUSES = [
  "pending",
  "triggered",
  "dismissed",
  "snoozed",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const POMODORO_STATUSES = ["running", "completed", "cancelled"] as const;
export type PomodoroStatus = (typeof POMODORO_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "project",
  "phase",
  "milestone",
  "task",
  "comment",
  "checklist",
  "note",
  "wiki",
  "file",
  "calendar",
  "reminder",
  "time",
  "pomodoro",
  "system",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const NOTIFICATION_TYPES = ["reminder", "task", "project", "system"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type EntityType =
  | "project"
  | "phase"
  | "milestone"
  | "task"
  | "checklist"
  | "note"
  | "file"
  | "reminder"
  | "wiki_page"
  | "calendar_event"
  | "planning_entry"
  | "notification"
  | "profile";

// --- Row types ---

/** Row from public.profiles (owner-only via RLS). */
export type Profile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type UserPreferences = {
  user_id: string;
  theme: Theme;
  default_view: "dashboard" | "projects" | "tasks" | "calendar" | "wiki";
  daily_note_time: string | null;
  focus_duration_minutes: number;
  break_duration_minutes: number;
  created_at: string;
  updated_at: string;
};

export type Tag = {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProjectPhase = {
  id: string;
  user_id: string;
  project_id: string;
  name: string;
  description: string | null;
  status: PhaseStatus;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Milestone = {
  id: string;
  user_id: string;
  project_id: string;
  phase_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  created_at: string;
  updated_at: string;
};

export type Task = {
  id: string;
  user_id: string;
  project_id: string;
  phase_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  due_date: string | null;
  reminder_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type TaskComment = {
  id: string;
  user_id: string;
  task_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type Checklist = {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChecklistItem = {
  id: string;
  user_id: string;
  checklist_id: string;
  content: string;
  is_completed: boolean;
  completed_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  content: string;
  is_pinned: boolean;
  is_favorited: boolean;
  color: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type NoteVersion = {
  id: string;
  user_id: string;
  note_id: string;
  content: string;
  created_at: string;
};

export type DailyNote = {
  id: string;
  user_id: string;
  project_id: string;
  note_date: string;
  content: string;
  created_at: string;
  updated_at: string;
};

export type PlanningEntry = {
  id: string;
  user_id: string;
  project_id: string;
  plan_date: string;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CalendarEvent = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  event_type: EventType;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type Reminder = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  title: string;
  note: string | null;
  remind_at: string;
  status: ReminderStatus;
  created_at: string;
  updated_at: string;
};

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  user_id: string;
  project_id: string | null;
  activity_type: ActivityType;
  entity_type: EntityType | null;
  entity_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type WikiPage = {
  id: string;
  user_id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  slug: string;
  content: string;
  is_published: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WikiVersion = {
  id: string;
  user_id: string;
  wiki_page_id: string;
  content: string;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  user_id: string;
  project_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type PomodoroSession = {
  id: string;
  user_id: string;
  task_id: string | null;
  focus_duration_minutes: number;
  break_duration_minutes: number;
  started_at: string;
  ended_at: string | null;
  status: PomodoroStatus;
  created_at: string;
  updated_at: string;
};

export type StoredFile = {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  updated_at: string;
};

// --- Composed / read-model shapes ---

/** Serializable session identity shared with client components. */
export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
};

export type TagWithUsage = Tag & { usage: number };