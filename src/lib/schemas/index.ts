import { z } from "zod";
import {
  EVENT_TYPES,
  MILESTONE_STATUSES,
  PHASE_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
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

export const noteSchema = z.object({
  title: nameRequired.max(240),
  content: z.string().max(200_000),
  project_id: z.string().uuid().optional().or(z.literal("")),
  is_pinned: z.coerce.boolean().optional(),
  is_favorited: z.coerce.boolean().optional(),
  color: optionalText(30).transform((v) => (v ? v : null)),
}).transform((d) => ({
  ...d,
  project_id: d.project_id || null,
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

export const reminderSchema = z.object({
  title: nameRequired.max(200),
  note: optionalText(5000),
  remind_at: z.string().datetime({ message: "Enter a valid date and time" }),
  project_id: z.string().uuid().optional().or(z.literal("")),
  task_id: z.string().uuid().optional().or(z.literal("")),
}).transform((d) => ({
  ...d,
  project_id: d.project_id || null,
  task_id: d.task_id || null,
  note: d.note || null,
}));

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

export const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]),
  default_view: z.enum(["dashboard", "projects", "tasks", "calendar", "wiki"]),
  daily_note_time: z
    .string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a valid time (HH:MM)")
    .optional()
    .or(z.literal("")),
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