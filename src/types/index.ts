// ============================================================================
// Shared domain types — aligned 1:1 with the live PostgreSQL schema.
// The database check constraints are the source of truth for union members.
// ============================================================================

// Appearance unions live in one place so the CSS attribute names, the settings
// UI, the Zod enums and the database CHECK constraints cannot drift apart.
import type {
  AccentColor,
  BackgroundPreset,
  CardStyle,
  Density,
  ResolvedTheme,
  Theme,
} from "@/config/appearance";

export type {
  AccentColor,
  BackgroundPreset,
  CardStyle,
  Density,
  ResolvedTheme,
  Theme,
};

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

export const NODE_TYPES = [
  "phase",
  "chapter",
  "lesson",
  "topic",
  "section",
  "collection",
  "module",
  "milestone",
  "custom",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const RESOURCE_TYPES = [
  "link",
  "file",
  "google_drive",
  "supabase_file",
  "note",
  "document",
  "repository",
  "api",
  "video",
  "image",
  "custom",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

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

export const REMINDER_REPEATS = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type ReminderRepeat = (typeof REMINDER_REPEATS)[number];

/**
 * Delivery channels a reminder can request. `push` and `email` are accepted by
 * the schema but only fire when the matching client capability exists, so the
 * UI has to describe them as "configured separately" rather than promising
 * delivery.
 */
export const NOTIFICATION_CHANNELS = ["in_app", "browser", "push", "email"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const PROJECT_CATEGORIES = [
  "development",
  "business",
  "learning",
  "personal",
  "research",
  "design",
  "marketing",
  "finance",
  "health",
  "other",
] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export const PROJECT_TYPES = [
  "web_app",
  "pwa",
  "mobile_app",
  "desktop_app",
  "api",
  "research",
  "design",
  "marketing",
  "other",
] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "JPY", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

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
  "project_node",
  "resource",
  "finance",
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
  | "profile"
  | "project_node"
  | "resource";

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
  accent_color: AccentColor;
  card_style: CardStyle;
  density: Density;
  background_preset: BackgroundPreset;
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

/**
 * The long-form blocks collected in step 4. Stored as jsonb on `projects`
 * because they are written and read as one unit and never filtered on.
 */
export type ProjectDetails = {
  detailed_description?: string;
  objective?: string;
  goals?: string;
  scope?: string;
  requirements?: string;
  important_info?: string;
  tech_frontend?: string;
  tech_backend?: string;
  tech_database?: string;
  tech_hosting?: string;
  api_details?: string;
  repo_url?: string;
  website_url?: string;
  docs_url?: string;
  additional_notes?: string;
};

/** Per-project feature toggles from step 11. */
export type ProjectOptions = {
  history_enabled?: boolean;
  version_history_enabled?: boolean;
  daily_notes_enabled?: boolean;
  calendar_enabled?: boolean;
  default_task_priority?: Priority;
  default_reminder_minutes?: number | null;
  notify_on_task_complete?: boolean;
  notify_on_overdue?: boolean;
  archive_after_completion?: boolean;
  export_format?: "json" | "csv" | "both";
  offline_draft?: boolean;
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
  title: string | null;
  category: ProjectCategory | null;
  project_type: ProjectType | null;
  is_favorite: boolean;
  is_pinned: boolean;
  timezone: string;
  currency: Currency;
  budget: number | null;
  card_style: CardStyle | null;
  banner_path: string | null;
  logo_path: string | null;
  details: ProjectDetails;
  options: ProjectOptions;
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

export type ProjectNode = {
  id: string;
  user_id: string;
  project_id: string;
  parent_id: string | null;
  node_type: NodeType;
  title: string;
  description: string | null;
  status: "planned" | "in_progress" | "completed" | "blocked" | "on_hold";
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  sort_order: number;
  progress: number;
  metadata: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectResource = {
  id: string;
  user_id: string;
  project_id: string;
  node_id: string | null;
  resource_type: ResourceType;
  name: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  gdrive_file_id: string | null;
  gdrive_account: string | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ProjectHistory = {
  id: string;
  user_id: string;
  project_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  summary: string | null;
  created_at: string;
};

export type Milestone = {
  id: string;
  user_id: string;
  project_id: string;
  phase_id: string | null;
  node_id: string | null;
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
  node_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  reminder_at: string | null;
  estimated_minutes: number | null;
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
  task_id: string | null;
  node_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  parent_checklist_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ChecklistItem = {
  id: string;
  user_id: string;
  checklist_id: string;
  content: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  parent_item_id: string | null;
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
  node_id: string | null;
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
  title: string | null;
  content: string;
  todays_work: string | null;
  completed_work: string | null;
  problems: string | null;
  ideas: string | null;
  next_steps: string | null;
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
  node_id: string | null;
  checklist_id: string | null;
  note_id: string | null;
  title: string;
  note: string | null;
  description: string | null;
  remind_at: string;
  /** Set while snoozed: when it fires again. `remind_at` keeps the original. */
  snoozed_until: string | null;
  status: ReminderStatus;
  priority: Priority;
  repeat_rule: ReminderRepeat;
  repeat_interval: number | null;
  repeat_until: string | null;
  /** Weekdays (0 = Sunday) used when `repeat_rule` is "custom". */
  repeat_days: number[];
  notification_channels: NotificationChannel[];
  snooze_minutes: number | null;
  sound: string | null;
  is_enabled: boolean;
  advance_minutes: number;
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

// --- Finance ---

export const FINANCE_TYPES = ["income", "expense"] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];

export const PAYMENT_METHODS = [
  "cash",
  "card",
  "bank_transfer",
  "upi",
  "wallet",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type FinanceCategory = {
  id: string;
  user_id: string;
  name: string;
  type: FinanceType;
  color: string | null;
  created_at: string;
  updated_at: string;
};

export type FinanceTransaction = {
  id: string;
  user_id: string;
  category_id: string | null;
  project_id: string | null;
  node_id: string | null;
  type: FinanceType;
  amount: number;
  description: string | null;
  payment_method: PaymentMethod | null;
  tags: string[] | null;
  notes: string | null;
  transaction_date: string;
  occurred_at: string | null;
  reference: string | null;
  file_id: string | null;
  /** Which schedule produced this row. Guards against double-posting. */
  source: FinanceSource;
  recurring_id: string | null;
  bill_id: string | null;
  created_at: string;
  updated_at: string;
};

export const FINANCE_SOURCES = ["manual", "recurring", "bill"] as const;
export type FinanceSource = (typeof FINANCE_SOURCES)[number];

export const RECURRENCE_RULES = ["daily", "weekly", "monthly", "yearly", "custom"] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const BILL_STATUSES = ["unpaid", "paid", "skipped"] as const;
export type BillStatus = (typeof BILL_STATUSES)[number];

export type FinanceBudget = {
  id: string;
  user_id: string;
  /** NULL means "everything", i.e. an overall monthly cap. */
  category_id: string | null;
  project_id: string | null;
  /** YYYY-MM */
  month: string;
  amount: number;
  currency: Currency;
  created_at: string;
  updated_at: string;
};

export type FinanceRecurring = {
  id: string;
  user_id: string;
  name: string;
  type: FinanceType;
  amount: number;
  category_id: string | null;
  project_id: string | null;
  payment_method: PaymentMethod | null;
  description: string | null;
  notes: string | null;
  repeat_rule: RecurrenceRule;
  repeat_interval: number | null;
  repeat_until: string | null;
  repeat_days: number[];
  /** Date the next occurrence is due; drives generation. */
  next_due_on: string;
  last_generated_on: string | null;
  is_active: boolean;
  remind_days_before: number | null;
  created_at: string;
  updated_at: string;
};

export type FinanceBill = {
  id: string;
  user_id: string;
  name: string;
  amount: number;
  category_id: string | null;
  project_id: string | null;
  /** Day of month, 1-31; clamped to short months at read time. */
  due_day: number;
  payment_method: PaymentMethod | null;
  notes: string | null;
  status: BillStatus;
  last_paid_on: string | null;
  is_active: boolean;
  remind_days_before: number | null;
  created_at: string;
  updated_at: string;
};

export type FinanceHolding = {
  id: string;
  user_id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  buy_price: number;
  /** Entered by the user; there is no live quote feed. */
  current_price: number | null;
  currency: Currency;
  notes: string | null;
  acquired_on: string | null;
  created_at: string;
  updated_at: string;
};

// --- Google Drive ---

export type GDriveConnectionStatus = "active" | "revoked" | "error";

export type GDriveConnection = {
  id: string;
  user_id: string;
  /** Google account this row belongs to, lower-cased. One row per user+account. */
  account_email: string;
  email: string | null;
  label: string | null;
  status: GDriveConnectionStatus;
  last_connected_at: string | null;
  last_error: string | null;
  refresh_token: string;
  access_token: string | null;
  scope: string | null;
  expires_at: string | null;
  connected_at: string;
  updated_at: string;
};

export type GDriveFileRef = {
  id: string;
  user_id: string;
  /** Which linked Drive this file came from. */
  connection_id: string | null;
  project_id: string | null;
  task_id: string | null;
  note_id: string | null;
  drive_file_id: string;
  drive_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  modified_at: string | null;
  web_link: string | null;
  created_at: string;
  updated_at: string;
};

// --- Chart data types ---

export type ActivityDay = {
  day: string;
  tasksCompleted: number;
  minutesTracked: number;
  pomodoros: number;
  notesCreated: number;
};

export type ActivityDayBucket = {
  key: string;
  tasksCompleted: number;
  minutesTracked: number;
  pomodoros: number;
  notesCreated: number;
};

export type MonthlyPoint = {
  month: string; // YYYY-MM
  label: string; // "Sep 26"
  income: number;
  expense: number;
  net: number;
};

export type ProjectAnalytics = {
  projectId: string;
  taskTotal: number;
  taskDone: number;
  taskCompletionRate: number;
  tasksByStatus: Record<TaskStatus, number>;
  phases: { total: number; completed: number };
  milestones: { total: number; completed: number };
  timeMinutes: number;
  pomodoroSessions: number;
  notes: number;
  wikiPages: number;
};