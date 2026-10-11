import {
  NODE_TYPES,
  PRIORITIES,
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  RESOURCE_TYPES,
  type NodeType,
  type Priority,
  type ProjectCategory,
  type ProjectStatus,
  type ProjectType,
  type ResourceType,
} from "@/types";
import { CURRENCIES } from "@/types";
import {
  NOTIFICATION_CHANNELS,
  REMINDER_REPEATS,
  type Currency,
  type NotificationChannel,
  type ReminderRepeat,
} from "@/types";

/**
 * The 12-step project wizard.
 *
 * Everything in this file is pure data or pure arithmetic so it can be unit
 * tested (see `project-wizard.test.ts`) and reused by the review screen without
 * duplicating rules. The React components only bind inputs to it.
 */

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

export type WizardStepId =
  | "basic"
  | "dates"
  | "appearance"
  | "details"
  | "structure"
  | "tasks"
  | "reminders"
  | "daily"
  | "finance"
  | "resources"
  | "advanced"
  | "review";

export type WizardStep = {
  id: WizardStepId;
  /** 1-based position, shown in the stepper. */
  step: number;
  title: string;
  summary: string;
  /** Steps the wizard refuses to advance past while their required field is empty. */
  required: boolean;
};

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: "basic",
    step: 1,
    title: "Basic Information",
    summary: "Name, category, type, status, priority, tags",
    required: true,
  },
  {
    id: "dates",
    step: 2,
    title: "Dates & Countdown",
    summary: "Schedule, automatic day counts, milestones",
    required: false,
  },
  {
    id: "appearance",
    step: 3,
    title: "Appearance & Identity",
    summary: "Icon, color, banner, live card preview",
    required: false,
  },
  {
    id: "details",
    step: 4,
    title: "Description & Details",
    summary: "Objective, scope, requirements, tech stack, links",
    required: false,
  },
  {
    id: "structure",
    step: 5,
    title: "Project Structure",
    summary: "Phases, chapters, lessons, topics, custom nodes",
    required: false,
  },
  {
    id: "tasks",
    step: 6,
    title: "Tasks & Checklist",
    summary: "Tasks, subtasks, checklists and items",
    required: false,
  },
  {
    id: "reminders",
    step: 7,
    title: "Reminders",
    summary: "Repeat rules, channels, snooze, advance notice",
    required: false,
  },
  {
    id: "daily",
    step: 8,
    title: "Daily Notes & Calendar",
    summary: "Daily log sections and calendar entries",
    required: false,
  },
  {
    id: "finance",
    step: 9,
    title: "Project Finance",
    summary: "Budget, income and expense transactions",
    required: false,
  },
  {
    id: "resources",
    step: 10,
    title: "Resources & Attachments",
    summary: "Links, repositories, files and documents",
    required: false,
  },
  {
    id: "advanced",
    step: 11,
    title: "Advanced Options",
    summary: "Feature toggles and defaults for this project",
    required: false,
  },
  {
    id: "review",
    step: 12,
    title: "Final Review",
    summary: "Everything that will be created",
    required: false,
  },
] as const;

export const WIZARD_STEP_COUNT = WIZARD_STEPS.length;

export function stepById(id: WizardStepId): WizardStep {
  const found = WIZARD_STEPS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown wizard step: ${id}`);
  return found;
}

export function nextStep(id: WizardStepId): WizardStepId | null {
  const index = WIZARD_STEPS.findIndex((s) => s.id === id);
  return index >= 0 && index < WIZARD_STEPS.length - 1
    ? WIZARD_STEPS[index + 1].id
    : null;
}

export function previousStep(id: WizardStepId): WizardStepId | null {
  const index = WIZARD_STEPS.findIndex((s) => s.id === id);
  return index > 0 ? WIZARD_STEPS[index - 1].id : null;
}

// ---------------------------------------------------------------------------
// Draft shape
// ---------------------------------------------------------------------------

export type DraftNode = {
  /** Stable client-generated id so a child can point at its parent before save. */
  key: string;
  parentKey: string | null;
  nodeType: NodeType;
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  status: "planned" | "in_progress" | "completed" | "blocked" | "on_hold";
  priority: Priority;
  notes: string;
};

export type DraftTask = {
  key: string;
  /** `nodeKey` when attached to a structure node, otherwise null. */
  nodeKey: string | null;
  parentKey: string | null;
  title: string;
  description: string;
  priority: Priority;
  status: "backlog" | "todo" | "in_progress" | "done" | "cancelled";
  startDate: string;
  dueDate: string;
  tags: string;
  estimatedMinutes: string;
};

export type DraftChecklistItem = {
  key: string;
  content: string;
  description: string;
  dueDate: string;
  priority: Priority;
  isCompleted: boolean;
  parentKey: string | null;
};

export type DraftChecklist = {
  key: string;
  nodeKey: string | null;
  taskKey: string | null;
  parentKey: string | null;
  title: string;
  description: string;
  dueDate: string;
  priority: Priority;
  items: DraftChecklistItem[];
};

export type DraftReminder = {
  key: string;
  title: string;
  description: string;
  nodeKey: string | null;
  taskKey: string | null;
  checklistKey: string | null;
  /** `YYYY-MM-DDTHH:mm` in the project's timezone. */
  remindAt: string;
  repeat: ReminderRepeat;
  repeatInterval: string;
  repeatUntil: string;
  channels: NotificationChannel[];
  priority: Priority;
  snoozeMinutes: string;
  sound: string;
  isEnabled: boolean;
  advanceMinutes: string;
};

export type DraftDailyNote = {
  key: string;
  noteDate: string;
  title: string;
  content: string;
  todaysWork: string;
  completedWork: string;
  problems: string;
  ideas: string;
  nextSteps: string;
};

export type DraftCalendarEvent = {
  key: string;
  title: string;
  nodeKey: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string;
};

export type DraftTransaction = {
  key: string;
  type: "income" | "expense";
  amount: string;
  categoryName: string;
  transactionDate: string;
  occurredAt: string;
  description: string;
  paymentMethod: string;
  reference: string;
  nodeKey: string | null;
};

export type DraftResource = {
  key: string;
  resourceType: ResourceType;
  name: string;
  description: string;
  url: string;
  tags: string;
nodeKey: string | null;
  /** Id of an already-uploaded row in `files`, for supabase_file resources. */
  fileId: string | null;
  /**
   * A file uploaded during this wizard run.
   *
   * The wizard cannot create a `files` row yet — that table requires a
   * project_id, and the project does not exist until the final step. So the
   * object is stored immediately and the row is created on save.
   */
  upload: {
    path: string;
    name: string;
    mimeType: string | null;
    sizeBytes: number;
  } | null;
};

export type DraftMilestone = {
  key: string;
  title: string;
  description: string;
  dueDate: string;
  status: "not_started" | "in_progress" | "completed";
  nodeKey: string | null;
};

export type ProjectDraft = {
  version: number;
  updatedAt: number;
  step: WizardStepId;

  // Step 1
  name: string;
  title: string;
  description: string;
  category: ProjectCategory;
  projectType: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  tags: string;
  isFavorite: boolean;
  isPinned: boolean;

  // Step 2
  startDate: string;
  dueDate: string;
  timezone: string;
  milestones: DraftMilestone[];

  // Step 3
  icon: string;
  color: string;
  cardStyle: string;
  bannerName: string;
  logoName: string;

  // Step 4
  details: Record<string, string>;

  // Step 5
  nodes: DraftNode[];

  // Step 6
  tasks: DraftTask[];
  checklists: DraftChecklist[];

  // Step 7
  reminders: DraftReminder[];

  // Step 8
  dailyNotes: DraftDailyNote[];
  calendarEvents: DraftCalendarEvent[];

  // Step 9
  currency: Currency;
  budget: string;
  transactions: DraftTransaction[];

  // Step 10
  resources: DraftResource[];

  // Step 11
  options: {
    historyEnabled: boolean;
    versionHistoryEnabled: boolean;
    dailyNotesEnabled: boolean;
    calendarEnabled: boolean;
    defaultTaskPriority: Priority;
    defaultReminderMinutes: string;
    notifyOnTaskComplete: boolean;
    notifyOnOverdue: boolean;
    archiveAfterCompletion: boolean;
    exportFormat: "json" | "csv" | "both";
    offlineDraft: boolean;
  };
};

export const DRAFT_VERSION = 1;

export type { NodeType };

export const CURRENCY_LIST: readonly Currency[] = CURRENCIES;
export const CATEGORY_LIST: readonly ProjectCategory[] = PROJECT_CATEGORIES;
export const PROJECT_TYPE_LIST: readonly ProjectType[] = PROJECT_TYPES;
export const STATUS_LIST: readonly ProjectStatus[] = PROJECT_STATUSES;
export const PRIORITY_LIST: readonly Priority[] = PRIORITIES;
export const NODE_TYPE_LIST: readonly NodeType[] = NODE_TYPES;
export const RESOURCE_TYPE_LIST: readonly ResourceType[] = RESOURCE_TYPES;
export const REPEAT_LIST: readonly ReminderRepeat[] = REMINDER_REPEATS;
export const CHANNEL_LIST: readonly NotificationChannel[] = NOTIFICATION_CHANNELS;

export const DETAIL_FIELDS = [
  { key: "detailed_description", label: "Detailed Description", rows: 4 },
  { key: "objective", label: "Project Objective", rows: 3 },
  { key: "goals", label: "Goals / Expected Outcome", rows: 3 },
  { key: "scope", label: "Scope", rows: 3 },
  { key: "requirements", label: "Requirements", rows: 4 },
  { key: "important_info", label: "Important Information", rows: 3 },
  { key: "tech_frontend", label: "Technology Stack — Frontend", rows: 2 },
  { key: "tech_backend", label: "Technology Stack — Backend", rows: 2 },
  { key: "tech_database", label: "Technology Stack — Database", rows: 2 },
  { key: "tech_hosting", label: "Technology Stack — Hosting", rows: 2 },
  { key: "api_details", label: "API Details", rows: 3 },
  { key: "repo_url", label: "GitHub Repository URL", rows: 1, url: true },
  { key: "website_url", label: "Live Website URL", rows: 1, url: true },
  { key: "docs_url", label: "Documentation URL", rows: 1, url: true },
  { key: "additional_notes", label: "Additional Notes", rows: 3 },
] as const satisfies ReadonlyArray<DetailField>;

export type DetailField = {
  key: string;
  label: string;
  rows: number;
  /** Rendered as a URL input rather than a textarea. */
  url?: boolean;
};

/** Whether a detail field renders as a URL input. */
export function isUrlField(field: DetailField): boolean {
  return field.url === true;
}

export function createEmptyDraft(): ProjectDraft {
  return {
    version: DRAFT_VERSION,
    updatedAt: Date.now(),
    step: "basic",

    name: "",
    title: "",
    description: "",
    category: "development",
    projectType: "web_app",
    status: "active",
    priority: "medium",
    tags: "",
    isFavorite: false,
    isPinned: false,

    startDate: "",
    dueDate: "",
    timezone: "UTC",
    milestones: [],

    icon: "",
    color: "#6366f1",
    cardStyle: "default",
    bannerName: "",
    logoName: "",

    details: {},

    nodes: [],
    tasks: [],
    checklists: [],
    reminders: [],
    dailyNotes: [],
    calendarEvents: [],
    currency: "INR",
    budget: "",
    transactions: [],
    resources: [],
    options: {
      historyEnabled: true,
      versionHistoryEnabled: false,
      dailyNotesEnabled: true,
      calendarEnabled: true,
      defaultTaskPriority: "medium",
      defaultReminderMinutes: "",
      notifyOnTaskComplete: true,
      notifyOnOverdue: true,
      archiveAfterCompletion: false,
      exportFormat: "json",
      offlineDraft: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Countdown (step 2)
// ---------------------------------------------------------------------------

export type Countdown = {
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  elapsedPercent: number;
  remainingPercent: number;
  isOverdue: boolean;
  hasSchedule: boolean;
};

/** Midnight-UTC day difference, which is what a `date` column actually stores. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export function todayIso(today = new Date()): string {
  return today.toISOString().slice(0, 10);
}

/**
 * Total / elapsed / remaining day counts for a start → due schedule.
 *
 * A project with only one bound returns `hasSchedule: false` rather than
 * inventing a duration — showing "0 days remaining" for a project that simply
 * has no deadline is worse than showing nothing.
 */
export function computeCountdown(
  startDate: string,
  dueDate: string,
  today: string = todayIso()
): Countdown {
  const empty: Countdown = {
    totalDays: 0,
    daysElapsed: 0,
    daysRemaining: 0,
    elapsedPercent: 0,
    remainingPercent: 0,
    isOverdue: false,
    hasSchedule: false,
  };

  if (!startDate && !dueDate) return empty;

  // With only a start, the window runs from start to today; with only a due
  // date, it runs from today to due.
  const from = startDate || today;
  const to = dueDate || today;

  const span = daysBetween(from, to);
  const totalDays = Math.max(span, 0);
  const elapsed = Math.max(daysBetween(from, today), 0);
  const remaining = Math.max(daysBetween(today, to), 0);

  return {
    totalDays,
    daysElapsed: elapsed,
    daysRemaining: remaining,
    elapsedPercent: totalDays === 0 ? 0 : Math.min(100, Math.round((elapsed / totalDays) * 100)),
    remainingPercent: totalDays === 0 ? 0 : Math.max(0, 100 - Math.min(100, Math.round((elapsed / totalDays) * 100))),
    isOverdue: Boolean(dueDate) && daysBetween(today, dueDate) < 0,
    hasSchedule: true,
  };
}

// ---------------------------------------------------------------------------
// Progress (step 6)
// ---------------------------------------------------------------------------

/**
 * Checklist progress as completed ÷ total.
 *
 * Returns 0 for an empty checklist rather than NaN, and rounds rather than
 * truncating so 12/20 reads as 60% instead of 59%.
 */
export function computeChecklistProgress(
  items: ReadonlyArray<{ isCompleted: boolean }>
): number {
  const total = items.length;
  if (total === 0) return 0;
  const done = items.filter((item) => item.isCompleted).length;
  return Math.round((done / total) * 100);
}

export type StructureCounts = Record<NodeType, number> & { total: number };

/** Counts every node in a flat draft list by type. */
export function countStructure(nodes: ReadonlyArray<{ nodeType: NodeType }>): StructureCounts {
  const counts = Object.fromEntries(
    NODE_TYPES.map((type) => [type, 0])
  ) as Record<NodeType, number>;

  for (const node of nodes) counts[node.nodeType] += 1;

  return {
    ...counts,
    total: nodes.length,
  } as StructureCounts;
}

/**
 * Roll a node's own completion up to its parent.
 *
 * A node with no children reports `status === "completed"` as 100 and anything
 * else as 0 — an empty leaf has no partial state to show.
 */
export function computeNodeProgress(
  node: { status: string; children: ReadonlyArray<{ status: string }> }
): number {
  if (node.children.length === 0) {
    return node.status === "completed" ? 100 : 0;
  }
  const done = node.children.filter((child) => child.status === "completed").length;
  return Math.round((done / node.children.length) * 100);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type StepErrors = Partial<Record<WizardStepId, string[]>>;

/**
 * Per-step validation.
 *
 * Only genuinely required fields block the wizard; everything else is optional
 * by design, so an empty optional field is never reported as an error.
 */
export function validateDraft(draft: ProjectDraft): StepErrors {
  const errors: StepErrors = {};

  const basic: string[] = [];
  if (!draft.name.trim()) basic.push("Project name is required.");
  else if (draft.name.trim().length > 200) basic.push("Project name must be under 200 characters.");
  if (draft.description.length > 2000) basic.push("Short description must be under 2000 characters.");
  if (basic.length) errors.basic = basic;

  const dates: string[] = [];
  if (draft.startDate && draft.dueDate && daysBetween(draft.startDate, draft.dueDate) < 0) {
    dates.push("Due date must be on or after the start date.");
  }
  const nodeDates = draft.nodes.filter(
    (node) =>
      node.startDate &&
      node.dueDate &&
      daysBetween(node.startDate, node.dueDate) < 0
  );
  if (nodeDates.length > 0) {
    dates.push(`${nodeDates.length} structure item(s) have a due date before their start date.`);
  }
  if (dates.length) errors.dates = dates;

  const structure: string[] = [];
  const nodeKeys = new Set<string>();
  for (const node of draft.nodes) {
    if (!node.title.trim()) structure.push("Every structure item needs a name.");
    if (nodeKeys.has(node.key)) structure.push(`Duplicate structure id "${node.key}".`);
    nodeKeys.add(node.key);
    if (node.parentKey && !draft.nodes.some((other) => other.key === node.parentKey)) {
      structure.push(`"${node.title || node.key}" references a parent that no longer exists.`);
    }
  }
  // A cycle would make the saved tree impossible to walk.
  for (const node of draft.nodes) {
    const seen = new Set<string>();
    let cursor: DraftNode | undefined = node;
    while (cursor?.parentKey) {
      if (seen.has(cursor.key)) {
        structure.push(`"${node.title || node.key}" is part of a circular parent chain.`);
        break;
      }
      seen.add(cursor.key);
      cursor = draft.nodes.find((other) => other.key === cursor!.parentKey);
    }
  }
  if (structure.length) errors.structure = structure;

  const tasks: string[] = [];
  for (const task of draft.tasks) {
    if (!task.title.trim()) tasks.push("Every task needs a title.");
    if (
      task.startDate &&
      task.dueDate &&
      daysBetween(task.startDate, task.dueDate) < 0
    ) {
      tasks.push(`"${task.title || task.key}" is due before it starts.`);
    }
  }
  for (const checklist of draft.checklists) {
    if (!checklist.title.trim()) tasks.push("Every checklist needs a name.");
    for (const item of checklist.items) {
      if (!item.content.trim()) tasks.push(`"${checklist.title}" has an empty checklist item.`);
    }
  }
  if (tasks.length) errors.tasks = tasks;

  const reminders: string[] = [];
  for (const reminder of draft.reminders) {
    if (!reminder.title.trim()) reminders.push("Every reminder needs a title.");
    if (!reminder.remindAt) reminders.push(`"${reminder.title || reminder.key}" has no date and time.`);
    if (reminder.channels.length === 0) {
      reminders.push(`"${reminder.title || reminder.key}" has no notification channel.`);
    }
  }
  if (reminders.length) errors.reminders = reminders;

  const daily: string[] = [];
  for (const note of draft.dailyNotes) {
    if (!note.noteDate) daily.push("Every daily note needs a date.");
  }
  for (const event of draft.calendarEvents) {
    if (!event.title.trim()) daily.push("Every calendar entry needs a title.");
    if (!event.startsAt) daily.push(`"${event.title || event.key}" has no start time.`);
  }
  if (daily.length) errors.daily = daily;

  const finance: string[] = [];
  if (draft.budget && !Number.isFinite(Number(draft.budget))) {
    finance.push("Budget must be a number.");
  } else if (draft.budget && Number(draft.budget) < 0) {
    finance.push("Budget cannot be negative.");
  }
  for (const transaction of draft.transactions) {
    const amount = Number(transaction.amount);
    if (!transaction.amount.trim()) finance.push(`"${transaction.description || transaction.key}" has no amount.`);
    else if (!Number.isFinite(amount) || amount <= 0) {
      finance.push(`"${transaction.description || transaction.key}" needs an amount greater than zero.`);
    }
    if (!transaction.transactionDate) {
      finance.push(`"${transaction.description || transaction.key}" has no date.`);
    }
  }
  if (finance.length) errors.finance = finance;

const resources: string[] = [];
  for (const resource of draft.resources) {
    if (!resource.name.trim()) resources.push("Every resource needs a name.");
    const needsUrl =
      resource.resourceType !== "supabase_file" && resource.resourceType !== "note";
    // A freshly uploaded object counts just as much as an existing file row.
    const hasAttachment = Boolean(resource.url.trim() || resource.fileId || resource.upload);
    if (needsUrl && !hasAttachment) {
      resources.push(`"${resource.name || resource.key}" needs a URL or an uploaded file.`);
    }
  }
  if (resources.length) errors.resources = resources;

  const advanced: string[] = [];
  if (
    draft.options.defaultReminderMinutes &&
    !Number.isFinite(Number(draft.options.defaultReminderMinutes))
  ) {
    advanced.push("Default reminder lead time must be a number of minutes.");
  }
  if (advanced.length) errors.advanced = advanced;

  return errors;
}

export function countErrors(errors: StepErrors): number {
  return Object.values(errors).reduce((total, list) => total + (list?.length ?? 0), 0);
}

export function canAdvance(
  stepId: WizardStepId,
  draft: ProjectDraft,
  errors: StepErrors
): boolean {
  const step = stepById(stepId);
  return !step.required || (errors[stepId]?.length ?? 0) === 0;
}

// ---------------------------------------------------------------------------
// Review summary (step 12)
// ---------------------------------------------------------------------------

export type FinanceSummary = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  budget: number | null;
  remainingBudget: number | null;
};

export function summarizeFinance(draft: ProjectDraft): FinanceSummary {
  let income = 0;
  let expense = 0;

  for (const transaction of draft.transactions) {
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount)) continue;
    if (transaction.type === "income") income += amount;
    else expense += amount;
  }

  const budget = draft.budget.trim() === "" ? null : Number(draft.budget);
  const safeBudget = budget !== null && Number.isFinite(budget) ? budget : null;

  return {
    totalIncome: round2(income),
    totalExpense: round2(expense),
    balance: round2(income - expense),
    budget: safeBudget,
    remainingBudget: safeBudget === null ? null : round2(safeBudget - expense),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ReviewSummary = {
  countdown: Countdown;
  structure: StructureCounts;
  checklistItems: number;
  checklistProgress: number;
  taskCount: number;
  completedTaskCount: number;
  initialProgress: number;
  reminderCount: number;
  dailyNoteCount: number;
  calendarEventCount: number;
  milestoneCount: number;
  finance: FinanceSummary;
  resourceCount: number;
  tagCount: number;
  detailFieldCount: number;
};

/**
 * Everything the review step shows.
 *
 * `initialProgress` is derived from the checklist items the user actually
 * ticked, not from a stored column, so the number on the review screen is the
 * same number the database will end up with.
 */
export function summarizeDraft(
  draft: ProjectDraft,
  today: string = todayIso()
): ReviewSummary {
  const allItems = draft.checklists.flatMap((checklist) => checklist.items);
  const structure = countStructure(draft.nodes);
  const finance = summarizeFinance(draft);

  const completedTaskCount = draft.tasks.filter((task) => task.status === "done").length;

  return {
    countdown: computeCountdown(draft.startDate, draft.dueDate, today),
    structure,
    checklistItems: allItems.length,
    checklistProgress: computeChecklistProgress(allItems),
    taskCount: draft.tasks.length,
    completedTaskCount,
    initialProgress:
      allItems.length > 0
        ? computeChecklistProgress(allItems)
        : draft.tasks.length > 0
          ? Math.round((completedTaskCount / draft.tasks.length) * 100)
          : 0,
    reminderCount: draft.reminders.length,
    dailyNoteCount: draft.dailyNotes.length,
    calendarEventCount: draft.calendarEvents.length,
    milestoneCount: draft.milestones.length,
    finance,
    resourceCount: draft.resources.length,
    tagCount: parseTags(draft.tags).length,
    detailFieldCount: Object.values(draft.details).filter((value) => value.trim()).length,
  };
}

/** Comma-separated tag input → trimmed, de-duplicated, order-preserving list. */
export function parseTags(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}