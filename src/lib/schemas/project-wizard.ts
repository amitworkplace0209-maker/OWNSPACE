import { z } from "zod";
import {
  CURRENCIES,
  NODE_TYPES,
  NOTIFICATION_CHANNELS,
  PRIORITIES,
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  REMINDER_REPEATS,
  RESOURCE_TYPES,
} from "@/types";
import { DETAIL_FIELDS } from "@/lib/project-wizard";

/**
 * Schema for the 12-step project wizard payload.
 *
 * The browser sends one JSON blob, so everything is validated here again on the
 * server — the client already validated it, but a server action argument is
 * untrusted input and must never reach Postgres unchecked. Every optional text
 * field collapses `""` to `null` so the database stores a real null rather than
 * an empty string, which is what the CHECK constraints and date comparisons
 * expect.
 */

const trimmed = z.string().trim();

/**
 * Free-form text that becomes a real NULL when blank.
 *
 * Annotated explicitly because a bare transform-plus-catch infers `{}` in Zod
 * 4, which silently turns every downstream string into `unknown`.
 */
const optional: z.ZodType<string | null> = trimmed
  .max(10_000)
  .transform((value) => (value ? value : null));

/** Comma-separated tag list; always a string, so `.split()` is safe. */
const tagList: z.ZodType<string> = trimmed.max(2000).catch("");

const isoDate = trimmed
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .transform((v) => (v ? v : null))
  .nullable()
  .catch(null);

const isoDateTime = trimmed
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Use a valid date and time")
  .transform((v) => (v ? v : null))
  .nullable()
  .catch(null);

const positiveInt = (max: number) =>
  trimmed
    .transform((v) => (v === "" ? null : Number(v)))
    .refine(
      (v) => v === null || (Number.isInteger(v) && v > 0 && v <= max),
      "Enter a whole number between 1 and " + max
    )
    .nullable()
    .catch(null);

const nodeStatusSchema = z.enum(["planned", "in_progress", "completed", "blocked", "on_hold"]);
const taskStatusSchema = z.enum(["backlog", "todo", "in_progress", "done", "cancelled"]);

const keySchema = trimmed.min(1).max(80);

const wizardNodeSchema = z.object({
  key: keySchema,
  parentKey: trimmed.nullable().catch(null),
  nodeType: z.enum(NODE_TYPES),
  title: trimmed.min(1, "Every structure item needs a name").max(200),
  description: optional,
  startDate: isoDate,
  dueDate: isoDate,
  status: nodeStatusSchema,
  priority: z.enum(PRIORITIES),
  notes: optional,
});

const wizardTaskSchema = z.object({
  key: keySchema,
  nodeKey: trimmed.nullable().catch(null),
  parentKey: trimmed.nullable().catch(null),
  title: trimmed.min(1, "Every task needs a title").max(200),
  description: optional,
  priority: z.enum(PRIORITIES),
  status: taskStatusSchema,
  startDate: isoDate,
  dueDate: isoDate,
  tags: tagList,
  estimatedMinutes: positiveInt(100_000),
});

const wizardChecklistItemSchema = z.object({
  key: keySchema,
  content: trimmed.min(1, "Checklist items cannot be empty").max(500),
  description: optional,
  dueDate: isoDate,
  priority: z.enum(PRIORITIES),
  isCompleted: z.boolean().catch(false),
  parentKey: trimmed.nullable().catch(null),
});

const wizardChecklistSchema = z.object({
  key: keySchema,
  nodeKey: trimmed.nullable().catch(null),
  taskKey: trimmed.nullable().catch(null),
  parentKey: trimmed.nullable().catch(null),
  title: trimmed.min(1, "Every checklist needs a name").max(200),
  description: optional,
  dueDate: isoDate,
  priority: z.enum(PRIORITIES),
  items: z.array(wizardChecklistItemSchema).max(500).catch([]),
});

const wizardReminderSchema = z.object({
  key: keySchema,
  title: trimmed.min(1, "Every reminder needs a title").max(200),
  description: optional,
  nodeKey: trimmed.nullable().catch(null),
  taskKey: trimmed.nullable().catch(null),
  checklistKey: trimmed.nullable().catch(null),
  remindAt: trimmed
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a date and time")
    .max(40),
  repeat: z.enum(REMINDER_REPEATS).catch("none"),
  repeatInterval: positiveInt(365),
  repeatUntil: isoDate,
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1, "Pick at least one channel").catch(["in_app"]),
  priority: z.enum(PRIORITIES),
  snoozeMinutes: positiveInt(10_080),
  sound: trimmed.max(80).transform((v) => (v ? v : null)),
  isEnabled: z.boolean().catch(true),
  advanceMinutes: positiveInt(43_200),
});

const wizardDailyNoteSchema = z.object({
  key: keySchema,
  noteDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  title: optional,
  content: optional,
  todaysWork: optional,
  completedWork: optional,
  problems: optional,
  ideas: optional,
  nextSteps: optional,
});

const wizardCalendarEventSchema = z.object({
  key: keySchema,
  title: trimmed.min(1, "Calendar entries need a title").max(200),
  nodeKey: trimmed.nullable().catch(null),
  startsAt: trimmed
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Enter a start date and time")
    .max(40),
  endsAt: isoDateTime,
  allDay: z.boolean().catch(false),
  location: trimmed.max(300).transform((v) => (v ? v : null)),
});

const wizardTransactionSchema = z.object({
  key: keySchema,
  type: z.enum(["income", "expense"]),
  amount: trimmed
    .max(20)
    .transform(Number)
    .refine((v) => Number.isFinite(v) && v > 0, "Amount must be greater than zero"),
  categoryName: trimmed.max(120).transform((v) => (v ? v : null)),
  transactionDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  occurredAt: trimmed
    .regex(/^\d{2}:\d{2}/, "Enter a valid time")
    .transform((v) => (v ? v : null))
    .catch(null),
  description: trimmed.max(300).transform((v) => (v ? v : null)),
  paymentMethod: trimmed.max(40).transform((v) => (v ? v : null)),
  reference: trimmed.max(200).transform((v) => (v ? v : null)),
  nodeKey: trimmed.nullable().catch(null),
});

const wizardResourceSchema = z.object({
  key: keySchema,
  resourceType: z.enum(RESOURCE_TYPES),
  name: trimmed.min(1, "Every resource needs a name").max(200),
  description: optional,
  url: trimmed.max(2000).transform((v) => (v ? v : null)),
  tags: tagList,
  nodeKey: trimmed.nullable().catch(null),
  // Only ever an id from the caller's own `files` rows — verified server-side.
  fileId: trimmed.nullable().catch(null),
  // A path under the caller's own storage prefix; verified server-side too.
  upload: z
    .object({
      path: trimmed.min(1).max(400),
      name: trimmed.min(1).max(300),
      mimeType: trimmed.max(150).transform((v) => (v ? v : null)).catch(null),
      sizeBytes: z.number().int().nonnegative().catch(0),
    })
    .nullable()
    .catch(null),
});

const wizardMilestoneSchema = z.object({
  key: keySchema,
  title: trimmed.min(1, "Every milestone needs a title").max(200),
  description: optional,
  dueDate: isoDate,
  status: z.enum(["not_started", "in_progress", "completed"]),
  nodeKey: trimmed.nullable().catch(null),
});

const detailShape = Object.fromEntries(
  DETAIL_FIELDS.map((field) => [field.key, trimmed.max(30_000).transform((v) => (v ? v : null))])
) as Record<string, z.ZodType<string | null>>;

export const projectWizardSchema = z.object({
  // Step 1
  name: trimmed.min(1, "Project name is required").max(200),
  title: trimmed.max(200).transform((v) => (v ? v : null)),
  description: trimmed.max(2000).transform((v) => (v ? v : null)),
  category: z.enum(PROJECT_CATEGORIES).catch("other"),
  projectType: z.enum(PROJECT_TYPES).catch("other"),
  status: z.enum(PROJECT_STATUSES).catch("active"),
  priority: z.enum(PRIORITIES).catch("none"),
  tags: tagList,
  isFavorite: z.boolean().catch(false),
  isPinned: z.boolean().catch(false),

  // Step 2
  startDate: isoDate,
  dueDate: isoDate,
  timezone: trimmed.min(1).max(80).catch("UTC"),
  milestones: z.array(wizardMilestoneSchema).max(200).catch([]),

  // Step 3
  icon: trimmed.max(50).transform((v) => (v ? v : null)),
  color: trimmed
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour")
    .catch("#6366f1"),
  cardStyle: z
    .enum(["default", "elevated", "soft", "outline", "glass", "compact", "gradient"])
    .catch("default"),
  bannerName: trimmed.max(300).transform((v) => (v ? v : null)),
  logoName: trimmed.max(300).transform((v) => (v ? v : null)),

  // Step 4
  details: z.object(detailShape).partial().catch({}),

  // Step 5
  nodes: z.array(wizardNodeSchema).max(1000).catch([]),

  // Step 6
  tasks: z.array(wizardTaskSchema).max(2000).catch([]),
  checklists: z.array(wizardChecklistSchema).max(500).catch([]),

  // Step 7
  reminders: z.array(wizardReminderSchema).max(500).catch([]),

  // Step 8
  dailyNotes: z.array(wizardDailyNoteSchema).max(400).catch([]),
  calendarEvents: z.array(wizardCalendarEventSchema).max(500).catch([]),

  // Step 9
  currency: z.enum(CURRENCIES).catch("INR"),
  budget: trimmed
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isFinite(v) && v >= 0), "Budget must be zero or more")
    .nullable()
    .catch(null),
  transactions: z.array(wizardTransactionSchema).max(1000).catch([]),

  // Step 10
  resources: z.array(wizardResourceSchema).max(500).catch([]),

  // Step 11
  options: z
    .object({
      historyEnabled: z.boolean().catch(true),
      versionHistoryEnabled: z.boolean().catch(false),
      dailyNotesEnabled: z.boolean().catch(true),
      calendarEnabled: z.boolean().catch(true),
      defaultTaskPriority: z.enum(PRIORITIES).catch("medium"),
      defaultReminderMinutes: positiveInt(43_200),
      notifyOnTaskComplete: z.boolean().catch(true),
      notifyOnOverdue: z.boolean().catch(true),
      archiveAfterCompletion: z.boolean().catch(false),
      exportFormat: z.enum(["json", "csv", "both"]).catch("json"),
      offlineDraft: z.boolean().catch(true),
    })
    .catch({
      historyEnabled: true,
      versionHistoryEnabled: false,
      dailyNotesEnabled: true,
      calendarEnabled: true,
      defaultTaskPriority: "medium" as const,
      defaultReminderMinutes: null,
      notifyOnTaskComplete: true,
      notifyOnOverdue: true,
      archiveAfterCompletion: false,
      exportFormat: "json" as const,
      offlineDraft: true,
    }),
});

export type ProjectWizardPayload = z.infer<typeof projectWizardSchema>;

/**
 * Parse the JSON string a server action receives.
 *
 * A malformed blob must produce a message, not a thrown error the user sees as
 * an opaque 500.
 */
export function parseWizardPayload(
  raw: unknown
): { data?: ProjectWizardPayload; error?: string } {
  let value: unknown = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { error: "The project data could not be read. Please try again." };
    }
  }

  const result = projectWizardSchema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join(".") ?? "";
    return {
      error: path
        ? `${path.replace(/([A-Z])/g, " $1").toLowerCase()}: ${first?.message ?? "is invalid"}`
        : (first?.message ?? "Please check the form and try again."),
    };
  }
  return { data: result.data };
}