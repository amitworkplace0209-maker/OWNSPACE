import { z } from "zod";
import {
  ACCENT_IDS,
  BACKGROUND_IDS,
  CARD_STYLE_IDS,
  DENSITY_IDS,
  THEME_IDS,
} from "@/config/appearance";
import {
  CURRENCIES,
  EVENT_TYPES,
  FINANCE_TYPES,
  MILESTONE_STATUSES,
  NODE_TYPES,
  PAYMENT_METHODS,
  PHASE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  RECURRENCE_RULES,
  RESOURCE_TYPES,
  TASK_STATUSES,
} from "@/types";

const nameRequired = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(200, "Keep it under 200 characters");

const optionalText = (max = 10000) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max.toLocaleString()} characters`)
    .optional()
    .or(z.literal(""));

/**
 * An HTML checkbox, read from FormData.
 *
 * A checked box submits "on"; an unchecked one submits nothing at all. Plain
 * `z.coerce.boolean()` gets this backwards — it turns the string "false" and
 * even "" into `true`.
 */
const checkboxToBoolean = z.preprocess(
  (value) => value === true || value === "on" || value === "true" || value === "1",
  z.boolean()
);

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD)")
  .optional()
  .or(z.literal(""));

const isoDateTime = z
  .string()
  .trim()
  .datetime({ message: "Enter a valid date and time" })
  .optional()
  .or(z.literal(""));

export const projectSchema = z
  .object({
    name: nameRequired.max(200),
    description: optionalText(10000),
    status: z.enum(PROJECT_STATUSES),
    priority: z.enum(PRIORITIES),
    start_date: isoDate,
    due_date: isoDate,
    icon: optionalText(50).transform((v) => (v ? v : null)),
    color: optionalText(30).transform((v) => (v ? v : null)),
    sort_order: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (d) =>
      !d.start_date ||
      !d.due_date ||
      d.due_date >= d.start_date,
    {
      message: "Due date must be on or after the start date",
      path: ["due_date"],
    }
  )
  .transform((d) => ({
    ...d,
    start_date: d.start_date || null,
    due_date: d.due_date || null,
    description: d.description || null,
  }));

export const phaseSchema = z
  .object({
    name: nameRequired,
    description: optionalText(10000),
    status: z.enum(PHASE_STATUSES),
    start_date: isoDate,
    due_date: isoDate,
    sort_order: z.coerce.number().int().min(0).max(9999).optional(),
  })
  .refine(
    (d) => !d.start_date || !d.due_date || d.due_date >= d.start_date,
    {
      message: "Due date must be on or after the start date",
      path: ["due_date"],
    }
  )
  .transform((d) => ({
    ...d,
    start_date: d.start_date || null,
    due_date: d.due_date || null,
    description: d.description || null,
  }));

export const milestoneSchema = z.object({
  title: nameRequired.max(200),
  description: optionalText(5000),
  due_date: isoDate,
  phase_id: z.string().uuid().optional().or(z.literal("")),
  status: z.enum(MILESTONE_STATUSES),
}).transform((d) => ({
  ...d,
  due_date: d.due_date || null,
  phase_id: d.phase_id || null,
  description: d.description || null,
}));

export const taskSchema = z.object({
  title: nameRequired.max(300),
  description: optionalText(30000),
  status: z.enum(TASK_STATUSES),
  priority: z.enum(PRIORITIES),
  due_date: isoDate,
  reminder_at: isoDateTime,
  project_id: z.string().uuid("Select a project"),
  phase_id: z.string().uuid().optional().or(z.literal("")),
  progress: z.coerce.number().int().min(0).max(100).optional(),
}).transform((d) => ({
  ...d,
  due_date: d.due_date || null,
  reminder_at: d.reminder_at || null,
  phase_id: d.phase_id || null,
  description: d.description || null,
  progress: d.progress ?? 0,
}));

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty").max(10000),
});

export const checklistSchema = z.object({
  title: nameRequired.max(100),
});

export const checklistItemSchema = z.object({
  content: z.string().trim().min(1, "Item cannot be empty").max(500),
});

export const noteSchema = z
  .object({
    // Rebuilt rather than reusing `nameRequired`: that helper already carries
    // `.max(200)`, so the old `nameRequired.max(240)` added a second, dead
    // check and notes were still silently capped at 200.
    title: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(240, "Keep it under 240 characters"),
    content: z.string().max(200_000).optional().default(""),
    project_id: z.string().uuid().optional().or(z.literal("")),
    node_id: z.string().uuid().optional().or(z.literal("")),
    // Checkboxes, so `checkboxToBoolean` rather than `z.coerce.boolean()` —
    // coerce turns the string "false" into true.
    is_pinned: checkboxToBoolean,
    is_favorited: checkboxToBoolean,
    color: optionalText(30),
    sort_order: z
      .union([z.literal(""), z.coerce.number().int()])
      .catch(0),
  })
  .transform((d) => ({
    ...d,
    project_id: d.project_id || null,
    node_id: d.node_id || null,
    color: d.color || null,
    sort_order: d.sort_order === "" ? 0 : d.sort_order,
  }));

export const dailyNoteSchema = z.object({
  note_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  project_id: z.string().uuid("Select a project"),
  content: z.string().max(200_000),
});

export const planningEntrySchema = z
  .object({
    plan_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
    project_id: z.string().uuid("Select a project"),
    start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a valid time (HH:MM)").optional().or(z.literal("")),
    end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a valid time (HH:MM)").optional().or(z.literal("")),
    note: optionalText(5000),
  })
  .refine(
    (d) =>
      !d.start_time || !d.end_time || d.end_time > d.start_time,
    {
      message: "End time must be after start time",
      path: ["end_time"],
    }
  )
  .transform((d) => ({
    ...d,
    start_time: d.start_time || null,
    end_time: d.end_time || null,
    note: d.note || null,
  }));

export const calendarEventSchema = z
  .object({
    title: nameRequired.max(200),
    description: optionalText(10000),
    event_type: z.enum(EVENT_TYPES),
    starts_at: z.string().datetime({ message: "Enter a valid start date and time" }),
    ends_at: z
      .string()
      .trim()
      .datetime({ message: "Enter a valid end date and time" })
      .optional()
      .or(z.literal("")),
    all_day: z.coerce.boolean().optional(),
    project_id: z.string().uuid().optional().or(z.literal("")),
    location: optionalText(200),
    color: optionalText(30),
  })
  .refine((d) => !d.ends_at || d.ends_at === "" || d.ends_at > d.starts_at, {
    message: "End time must be after start time",
    path: ["ends_at"],
  })
  .transform((d) => ({
    ...d,
    project_id: d.project_id || null,
    ends_at: d.ends_at || null,
    location: d.location || null,
    color: d.color || null,
    description: d.description || null,
  }));

// Migration 017 added 13 more scheduling columns and only the project wizard
// could write them. Every one of these is reachable from /reminders now.
const uuidOrEmpty = z.string().uuid().optional().or(z.literal(""));

const positiveIntOrEmpty = z
  .union([z.literal(""), z.coerce.number().int()])
  .refine((value) => value === "" || value > 0, "Enter a number above zero");

export const reminderSchema = z
  .object({
    title: nameRequired.max(200),
    note: optionalText(5000),
    description: optionalText(10_000),
    remind_at: z.string().datetime({ message: "Enter a valid date and time" }),

    project_id: uuidOrEmpty,
    task_id: uuidOrEmpty,
    node_id: uuidOrEmpty,
    checklist_id: uuidOrEmpty,
    note_id: uuidOrEmpty,

    priority: z
      .enum(["none", "low", "medium", "high", "urgent"])
      .catch("none"),
    is_enabled: checkboxToBoolean,

    repeat_rule: z
      .enum(["none", "daily", "weekly", "monthly", "yearly", "custom"])
      .catch("none"),
    repeat_interval: positiveIntOrEmpty,
    repeat_until: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).catch(""),
    // Weekdays arrive as repeated form fields, 0 = Sunday.
    repeat_days: z.array(z.coerce.number().int().min(0).max(6)).max(7).catch([]),

    advance_minutes: z
      .union([z.literal(""), z.coerce.number().int().min(0).max(43_200)])
      .catch(""),
    snooze_minutes: positiveIntOrEmpty,
    sound: optionalText(80),
    notification_channels: z
      .array(z.enum(["in_app", "browser", "push", "email"]))
      .min(1, "Pick at least one notification channel")
      .catch([]),
  })
  .transform((d) => ({
    title: d.title,
    note: d.note || null,
    description: d.description || null,
    remind_at: d.remind_at,
    project_id: d.project_id || null,
    task_id: d.task_id || null,
    node_id: d.node_id || null,
    checklist_id: d.checklist_id || null,
    note_id: d.note_id || null,
    priority: d.priority,
    is_enabled: d.is_enabled,
    repeat_rule: d.repeat_rule,
    repeat_interval: d.repeat_interval === "" ? null : d.repeat_interval,
    repeat_until: d.repeat_until || null,
    repeat_days: d.repeat_days,
    advance_minutes: d.advance_minutes === "" ? 0 : d.advance_minutes,
    snooze_minutes: d.snooze_minutes === "" ? null : d.snooze_minutes,
    sound: d.sound || null,
    notification_channels: d.notification_channels,
  }))
  .superRefine((d, ctx) => {
    // These combinations are meaningless, and silently accepting them would
    // produce a reminder that can never fire again.
    if (d.repeat_rule === "custom" && d.repeat_days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick at least one day for a custom repeat",
        path: ["repeat_days"],
      });
    }
    if (d.repeat_rule !== "none" && d.repeat_until) {
      if (d.repeat_until < d.remind_at.slice(0, 10)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Repeat end date is before the reminder date",
          path: ["repeat_until"],
        });
      }
    }
  });

export const wikiPageSchema = z.object({
  title: nameRequired.max(200),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(200)
    .regex(/^[a-z0-9-]+$/i, "Use letters, numbers and dashes only")
    .transform((v) => v.toLowerCase()),
  content: z.string().max(200_000),
  parent_id: z.string().uuid().optional().or(z.literal("")),
  is_published: z.coerce.boolean().optional(),
}).transform((d) => ({
  ...d,
  parent_id: d.parent_id || null,
}));

export const tagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(60),
  color: optionalText(30).transform((v) => (v ? v : null)),
});

export const profileSchema = z.object({
  display_name: optionalText(60),
  username: z
    .string()
    .trim()
    .regex(/^[a-z0-9._-]{3,30}$/i, "3–30 letters, numbers, dots, dashes or underscores")
    .optional()
    .or(z.literal("")),
});

// Every field is optional: `updatePreferencesAction` writes patch semantics, so
// a form that only touches `default_view` must not round-trip a stale `theme`
// captured when the page was rendered.
export const preferencesSchema = z.object({
  theme: z.enum(THEME_IDS).optional(),
  default_view: z.enum(["dashboard", "projects", "tasks", "calendar", "wiki"]),
  daily_note_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a valid time (HH:MM)")
    .optional()
    .or(z.literal("")),
  accent_color: z.enum(ACCENT_IDS).optional(),
  card_style: z.enum(CARD_STYLE_IDS).optional(),
  density: z.enum(DENSITY_IDS).optional(),
  background_preset: z.enum(BACKGROUND_IDS).optional(),
});

export const timeEntrySchema = z.object({
  project_id: z.string().uuid("Select a project"),
  task_id: z.string().uuid().optional().or(z.literal("")),
  started_at: z.string().datetime({ message: "Enter a valid start time" }),
  duration_minutes: z.coerce.number().int().min(1, "Duration must be at least 1 minute").max(60 * 24 * 30),
  description: optionalText(2000),
}).transform((d) => ({
  ...d,
  task_id: d.task_id || null,
  description: d.description || null,
}));

export const pomodoroSettingsSchema = z.object({
  focus_duration_minutes: z.coerce.number().int().min(1).max(180),
  break_duration_minutes: z.coerce.number().int().min(0).max(60),
});

export const financeCategorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  type: z.enum(FINANCE_TYPES),
  color: optionalText(30).transform((v) => (v ? v : null)),
});

export const financeTransactionSchema = z
  .object({
    type: z.enum(FINANCE_TYPES),
    amount: z.coerce.number().positive("Enter a positive amount").max(1_000_000_000),
    transaction_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD)"),
    category_id: z.string().uuid().optional().or(z.literal("")),
    project_id: z.string().uuid().optional().or(z.literal("")),
    description: optionalText(300),
    payment_method: z.enum(PAYMENT_METHODS).optional().or(z.literal("")),
    tags: z.string().max(500).optional().or(z.literal("")),
    notes: optionalText(5000),
  })
  .transform((d) => ({
    ...d,
    category_id: d.category_id || null,
    project_id: d.project_id || null,
    description: d.description || null,
    payment_method: (d.payment_method || null) as (typeof PAYMENT_METHODS)[number] | null,
    tags: d.tags ? d.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
    notes: d.notes || null,
    node_id: null,
    occurred_at: null,
    reference: null,
  }));

// ---------------------------------------------------------------------------
// Migration 020 schemas
// ---------------------------------------------------------------------------

const amountField = z.coerce.number().positive("Enter an amount above zero").max(1_000_000_000);
const monthField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, "Enter a valid month");
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date (YYYY-MM-DD)");
const daysBeforeField = z.union([z.literal(""), z.coerce.number().int().min(0).max(365)]).catch(0);

export const financeBudgetSchema = z
  .object({
    month: monthField,
    amount: amountField,
    category_id: z.string().uuid().optional().or(z.literal("")),
    project_id: z.string().uuid().optional().or(z.literal("")),
    currency: z.enum(CURRENCIES).catch("INR"),
  })
  .transform((d) => ({
    month: d.month,
    amount: d.amount,
    // An empty scope means "everything" rather than "nothing".
    category_id: d.category_id || null,
    project_id: d.project_id || null,
    currency: d.currency,
  }));

export const financeRecurringSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    type: z.enum(FINANCE_TYPES),
    amount: amountField,
    next_due_on: dateField,
    repeat_rule: z.enum(RECURRENCE_RULES).catch("monthly"),
    repeat_interval: positiveIntOrEmpty,
    repeat_until: z.union([z.literal(""), dateField]).catch(""),
    repeat_days: z.array(z.coerce.number().int().min(0).max(6)).max(7).catch([]),
    category_id: z.string().uuid().optional().or(z.literal("")),
    project_id: z.string().uuid().optional().or(z.literal("")),
    payment_method: z.enum(PAYMENT_METHODS).optional().or(z.literal("")),
    description: optionalText(300),
    notes: optionalText(5000),
    is_active: checkboxToBoolean,
    remind_days_before: daysBeforeField,
  })
  .transform((d) => ({
    name: d.name,
    type: d.type,
    amount: d.amount,
    next_due_on: d.next_due_on,
    repeat_rule: d.repeat_rule,
    repeat_interval: d.repeat_interval === "" ? 1 : d.repeat_interval,
    repeat_until: d.repeat_until || null,
    repeat_days: d.repeat_days,
    category_id: d.category_id || null,
    project_id: d.project_id || null,
    payment_method: (d.payment_method || null) as (typeof PAYMENT_METHODS)[number] | null,
    description: d.description || null,
    notes: d.notes || null,
    is_active: d.is_active,
    remind_days_before: d.remind_days_before === "" ? null : d.remind_days_before,
  }))
  .superRefine((d, ctx) => {
    // A custom rule with no weekdays selected can never fire, and the schedule
    // would sit there looking active forever.
    if (d.repeat_rule === "custom" && d.repeat_days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick at least one day for a custom repeat",
        path: ["repeat_days"],
      });
    }
    if (d.repeat_until && d.repeat_until < d.next_due_on) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date is before the first due date",
        path: ["repeat_until"],
      });
    }
  });

export const financeBillSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(120),
    amount: amountField,
    due_day: z.coerce.number().int().min(1, "Day must be 1 or more").max(31, "Day must be 31 or less"),
    category_id: z.string().uuid().optional().or(z.literal("")),
    project_id: z.string().uuid().optional().or(z.literal("")),
    payment_method: z.enum(PAYMENT_METHODS).optional().or(z.literal("")),
    notes: optionalText(5000),
    is_active: checkboxToBoolean,
    remind_days_before: daysBeforeField,
  })
  .transform((d) => ({
    name: d.name,
    amount: d.amount,
    due_day: d.due_day,
    category_id: d.category_id || null,
    project_id: d.project_id || null,
    payment_method: (d.payment_method || null) as (typeof PAYMENT_METHODS)[number] | null,
    notes: d.notes || null,
    is_active: d.is_active,
    remind_days_before: d.remind_days_before === "" ? null : d.remind_days_before,
  }));

export const financeHoldingSchema = z
  .object({
    symbol: z.string().trim().min(1, "Symbol is required").max(20),
    name: optionalText(80),
    quantity: z.coerce.number().positive("Enter a quantity above zero").max(1_000_000_000),
    buy_price: amountField,
    // Optional: a holding with no current price is legitimate — it just has
    // not been valued yet.
    current_price: z.union([z.literal(""), z.coerce.number().min(0)]).catch(""),
    currency: z.enum(CURRENCIES).catch("INR"),
    acquired_on: z.union([z.literal(""), dateField]).catch(""),
    notes: optionalText(5000),
  })
  .transform((d) => ({
    symbol: d.symbol.toUpperCase(),
    name: d.name || null,
    quantity: d.quantity,
    buy_price: d.buy_price,
    current_price: d.current_price === "" ? null : d.current_price,
    currency: d.currency,
    acquired_on: d.acquired_on || null,
    notes: d.notes || null,
  }));

export function parseForm<T>(schema: z.ZodType<T>, formData: FormData): { data?: T; error?: string } {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return {
      error: first
        ? `${fieldLabel(first.path[0])}${first.message ? `: ${first.message}` : ""}`
        : "Please check the form and try again.",
    };
  }
  return { data: result.data };
}

function fieldLabel(path: string | number | symbol | undefined): string {
  if (typeof path === "undefined" || path === "") return "";
  if (typeof path === "symbol") return "";
  return String(path).replace(/_/g, " ");
}

// --- Project Node ---

const nodeStatuses = ["planned", "in_progress", "completed", "blocked", "on_hold"] as const;

export const projectNodeSchema = z
  .object({
    project_id: z.string().uuid("Select a project"),
    parent_id: z.string().uuid().optional().or(z.literal("")),
    node_type: z.enum(NODE_TYPES),
    title: nameRequired.max(200),
    description: optionalText(10000),
    status: z.enum(nodeStatuses),
    priority: z.enum(PRIORITIES),
    start_date: isoDate,
    due_date: isoDate,
    sort_order: z.coerce.number().int().min(0).max(9999).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (d) => !d.start_date || !d.due_date || d.due_date >= d.start_date,
    {
      message: "Due date must be on or after the start date",
      path: ["due_date"],
    }
  )
  .transform((d) => ({
    ...d,
    start_date: d.start_date || null,
    due_date: d.due_date || null,
    description: d.description || null,
    parent_id: d.parent_id || null,
    metadata: d.metadata ?? null,
  }));

// --- Project Resource ---

export const projectResourceSchema = z
  .object({
    project_id: z.string().uuid("Select a project"),
    node_id: z.string().uuid().optional().or(z.literal("")),
    resource_type: z.enum(RESOURCE_TYPES),
    name: nameRequired.max(300),
    description: optionalText(5000),
    url: z.string().url("Enter a valid URL").optional().or(z.literal("")),
    storage_path: optionalText(500),
    mime_type: optionalText(100),
    size_bytes: z.coerce.number().int().positive().optional(),
    gdrive_file_id: optionalText(200),
    gdrive_account: optionalText(200),
    tags: z.string().optional().transform((v) => (v ? v.split(",").map((t) => t.trim()).filter(Boolean) : null)),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .transform((d) => ({
    ...d,
    url: d.url || null,
    storage_path: d.storage_path || null,
    mime_type: d.mime_type || null,
    size_bytes: d.size_bytes ?? null,
    gdrive_file_id: d.gdrive_file_id || null,
    gdrive_account: d.gdrive_account || null,
    description: d.description || null,
    node_id: d.node_id || null,
    metadata: d.metadata ?? null,
  }));

// --- Project History (append-only, usually created server-side) ---

export const projectHistorySchema = z.object({
  project_id: z.string().uuid(),
  entity_type: z.string().max(50),
  entity_id: z.string().uuid().optional().or(z.literal("")),
  action: z.string().max(100),
  old_value: z.record(z.string(), z.unknown()).optional().nullable(),
  new_value: z.record(z.string(), z.unknown()).optional().nullable(),
  summary: z.string().max(500).optional().nullable(),
}).transform((d) => ({
  ...d,
  entity_id: d.entity_id || null,
  old_value: d.old_value ?? null,
  new_value: d.new_value ?? null,
  summary: d.summary ?? null,
}));