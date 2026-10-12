"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import {
  calendarEventSchema,
  quickReminderSchema,
  reminderSchema,
  parseForm,
} from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type CalendarEventFormState = { error?: string; data?: { id: string } };

export async function createEventAction(
  _prevState: CalendarEventFormState,
  formData: FormData
): Promise<CalendarEventFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(calendarEventSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      ...parsed.data,
      user_id: user.id,
      all_day: parsed.data.all_day ?? false,
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the event.") };

  await logActivity({
    userId: user.id,
    activityType: "calendar",
    entityType: "calendar_event",
    entityId: data.id,
    summary: "Created event",
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function updateEventAction(
  eventId: string,
  _prevState: CalendarEventFormState,
  formData: FormData
): Promise<CalendarEventFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(calendarEventSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("calendar_events")
    .update({ ...parsed.data, all_day: parsed.data.all_day ?? false })
    .eq("user_id", user.id)
    .eq("id", eventId);
  if (error) return { error: friendlyError(error, "Could not update the event.") };

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { data: { id: eventId } };
}

export async function deleteEventAction(eventId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("user_id", user.id)
    .eq("id", eventId);
  if (error) return { error: friendlyError(error, "Could not delete the event.") };
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return {};
}

export type ReminderFormState = { error?: string; data?: { id: string } };

export type QuickReminderInput = {
  title: string;
  remindAt: string;
  priority?: string;
  projectId?: string;
};

/**
 * Creates a reminder from plain values rather than FormData.
 *
 * Two callers need this and neither can use the form action: the quick-add bar
 * (which parses "tomorrow 9am standup" into fields) and the offline replay
 * queue (which holds a queued row, not a form). Both are still server writes,
 * so they go through the same schema and the same column defaults the form
 * uses rather than a narrower path that could drift.
 */
export async function createQuickReminderAction(
  input: QuickReminderInput
): Promise<{ error?: string; id?: string }> {
  const parsed = quickReminderSchema.safeParse({
    title: input.title,
    remind_at: input.remindAt,
    priority: input.priority ?? "none",
    project_id: input.projectId ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Could not create the reminder." };
  }

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      title: parsed.data.title,
      remind_at: parsed.data.remind_at,
      priority: parsed.data.priority,
      project_id: parsed.data.project_id || null,
      user_id: user.id,
      status: "pending",
      snoozed_until: null,
      is_enabled: true,
      repeat_rule: "none",
      repeat_interval: null,
      repeat_until: null,
      repeat_days: [],
      advance_minutes: 0,
      snooze_minutes: null,
      sound: null,
      description: null,
      // Matches the full form action's defaults so a reminder created either
      // way is indistinguishable to everything downstream.
      notification_channels: ["in_app"],
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not create the reminder.") };
  }

  await logActivity({
    userId: user.id,
    activityType: "calendar",
    entityType: "reminder",
    entityId: data.id,
    summary: "Created reminder",
    metadata: { title: parsed.data.title },
  });

  revalidateReminderPaths();
  return { id: data.id };
}

export async function createReminderAction(
  _prevState: ReminderFormState,
  formData: FormData
): Promise<ReminderFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(reminderSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .insert({ ...parsed.data, user_id: user.id, status: "pending", snoozed_until: null })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the reminder.") };

  await logActivity({
    userId: user.id,
    activityType: "calendar",
    entityType: "reminder",
    entityId: data.id,
    summary: "Created reminder",
    metadata: { title: parsed.data.title },
  });

  revalidateReminderPaths();
  return { data: { id: data.id } };
}

export async function updateReminderAction(
  reminderId: string,
  _prevState: ReminderFormState,
  formData: FormData
): Promise<ReminderFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(reminderSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("reminders")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", reminderId)
    .maybeSingle();
  if (!existing) return { error: "Reminder not found." };

  const { error } = await supabase
    .from("reminders")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return { error: friendlyError(error, "Could not update the reminder.") };

  await logActivity({
    userId: user.id,
    activityType: "calendar",
    entityType: "reminder",
    entityId: reminderId,
    summary: "Updated reminder",
    metadata: { title: parsed.data.title },
  });

  revalidateReminderPaths();
  return { data: { id: reminderId } };
}

export async function deleteReminderAction(reminderId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return { error: friendlyError(error, "Could not delete the reminder.") };

  await logActivity({
    userId: user.id,
    activityType: "calendar",
    entityType: "reminder",
    entityId: reminderId,
    summary: "Deleted reminder",
  });

  revalidateReminderPaths();
  return {};
}

const validStatuses = ["pending", "triggered", "dismissed", "snoozed"] as const;

/**
 * Snooze pushes the fire time out without touching `remind_at`.
 *
 * It used to overwrite `remind_at` in place, which destroyed the time the user
 * originally set: un-snoozing was impossible, and a repeating reminder lost
 * its schedule every time it was snoozed. `snoozed_until` now holds the
 * pushed-out time so both "unsnooze" and "reschedule" still know the
 * original.
 */
export async function snoozeReminderAction(
  reminderId: string,
  minutes?: number,
  until?: Date
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const target =
    until ?? new Date(Date.now() + Math.max(1, Math.round(minutes ?? 10)) * 60_000);

  const { error } = await supabase
    .from("reminders")
    .update({ status: "snoozed", snoozed_until: target.toISOString() })
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return { error: friendlyError(error, "Could not snooze the reminder.") };

  revalidateReminderPaths();
  return {};
}

/**
 * Puts a snoozed reminder back to its original time.
 *
 * Only possible because snooze stopped overwriting `remind_at`.
 */
export async function unsnoozeReminderAction(reminderId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ status: "pending", snoozed_until: null })
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return { error: friendlyError(error, "Could not restore the reminder.") };

  revalidateReminderPaths();
  return {};
}

/**
 * Turns a reminder on or off.
 *
 * `is_enabled` existed since migration 017 but nothing could write it, which
 * meant the sweep fired muted reminders anyway.
 */
export async function toggleReminderEnabledAction(
  reminderId: string
): Promise<{ error?: string; enabled?: boolean }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("reminders")
    .select("is_enabled")
    .eq("user_id", user.id)
    .eq("id", reminderId)
    .maybeSingle();
  if (error || !data) return { error: "Reminder not found." };

  const enabled = !data.is_enabled;
  const { error: updateError } = await supabase
    .from("reminders")
    .update({ is_enabled: enabled })
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (updateError) return { error: friendlyError(updateError, "Could not update the reminder.") };

  revalidateReminderPaths();
  return { enabled };
}

/** Completes or reopens a reminder without deleting it. */
export async function completeReminderAction(
  reminderId: string,
  done: boolean
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ status: done ? "dismissed" : "pending", snoozed_until: null })
    .eq("user_id", user.id)
    .eq("id", reminderId);
  if (error) return { error: friendlyError(error, "Could not update the reminder.") };

  revalidateReminderPaths();
  return {};
}

export type ReminderBulkResult = { error?: string; affected?: number };

/**
 * Bulk actions for the reminders list.
 *
 * Mutes and completions only touch reminders that are still live, so clearing
 * "done" never resurrects something already dismissed weeks ago.
 */
export async function bulkSetRemindersEnabledAction(
  reminderIds: string[],
  enabled: boolean
): Promise<ReminderBulkResult> {
  const user = await getUserOrRedirect();
  if (reminderIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ is_enabled: enabled })
    .eq("user_id", user.id)
    .in("id", reminderIds);
  if (error) return { error: friendlyError(error, "Could not update the reminders.") };

  revalidateReminderPaths();
  return { affected: reminderIds.length };
}

export async function bulkCompleteRemindersAction(
  reminderIds: string[]
): Promise<ReminderBulkResult> {
  const user = await getUserOrRedirect();
  if (reminderIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ status: "dismissed", snoozed_until: null })
    .eq("user_id", user.id)
    .in("id", reminderIds);
  if (error) return { error: friendlyError(error, "Could not update the reminders.") };

  revalidateReminderPaths();
  return { affected: reminderIds.length };
}

export async function bulkDeleteRemindersAction(
  reminderIds: string[]
): Promise<ReminderBulkResult> {
  const user = await getUserOrRedirect();
  if (reminderIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .delete()
    .eq("user_id", user.id)
    .in("id", reminderIds);
  if (error) return { error: friendlyError(error, "Could not delete the reminders.") };

  revalidateReminderPaths();
  return { affected: reminderIds.length };
}

/**
 * Every page that reads reminders.
 *
 * Reminders appear on the calendar, the timeline, the dashboard and inside a
 * project, so mutating one without revalidating the others leaves those views
 * showing a reminder that no longer exists.
 */
function revalidateReminderPaths(): void {
  revalidatePath("/reminders");
  revalidatePath("/calendar");
  revalidatePath("/timeline");
  revalidatePath("/dashboard");
  revalidatePath("/projects", "layout");
}

export async function setReminderStatusAction(
  reminderId: string,
  status: string,
  snoozeMinutes?: number
): Promise<{ error?: string }> {
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
    return { error: "Invalid reminder status." };
  }
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "snoozed") {
    patch.snoozed_until = new Date(
      Date.now() + Math.max(1, Math.round(snoozeMinutes ?? 10)) * 60_000
    ).toISOString();
  } else {
    patch.snoozed_until = null;
  }

  const { error } = await supabase
    .from("reminders")
    .update(patch)
    .eq("user_id", user.id)
    .eq("id", reminderId);

  if (error) return { error: friendlyError(error, "Could not update the reminder.") };

  revalidateReminderPaths();
  return {};
}

// ---------------------------------------------------------------------------
// Bulk scheduling
// ---------------------------------------------------------------------------

/**
 * Snoozes several reminders at once.
 *
 * `reminderIds` is bounded here rather than trusted, because this action is
 * callable from the client and an unbounded `.in()` list is both a needless
 * round trip and a way to make the request exceed PostgREST's URL limits.
 */
const MAX_BULK_IDS = 200;

function boundedIds(ids: string[]): string[] {
  return [...new Set(ids)].slice(0, MAX_BULK_IDS);
}

export async function bulkSnoozeRemindersAction(
  reminderIds: string[],
  minutes: number,
  until?: string
): Promise<ReminderBulkResult> {
  const ids = boundedIds(reminderIds);
  if (ids.length === 0) return { affected: 0 };

  const target =
    until ??
    new Date(Date.now() + Math.max(1, Math.round(minutes || 10)) * 60_000).toISOString();

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    // `remind_at` is deliberately left alone so "restore" still knows when the
    // reminder was originally meant to fire.
    .update({ status: "snoozed", snoozed_until: target })
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return { error: friendlyError(error, "Could not snooze the reminders.") };

  revalidateReminderPaths();
  return { affected: ids.length };
}

/**
 * Moves several reminders to a new time.
 *
 * Rescheduling is a real edit of `remind_at` — unlike a snooze — so a snoozed
 * reminder being rescheduled returns to `pending` and drops the stale
 * `snoozed_until`, which would otherwise keep it stuck in the Snoozed bucket.
 */
export async function bulkRescheduleRemindersAction(
  reminderIds: string[],
  remindAt: string
): Promise<ReminderBulkResult> {
  const ids = boundedIds(reminderIds);
  if (ids.length === 0) return { affected: 0 };

  const at = new Date(remindAt);
  if (Number.isNaN(at.getTime())) return { error: "That date could not be read." };

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ remind_at: at.toISOString(), status: "pending", snoozed_until: null })
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return { error: friendlyError(error, "Could not reschedule the reminders.") };

  revalidateReminderPaths();
  return { affected: ids.length };
}

const BULK_PRIORITIES = ["none", "low", "medium", "high", "urgent"] as const;

export async function bulkSetReminderPriorityAction(
  reminderIds: string[],
  priority: string
): Promise<ReminderBulkResult> {
  const ids = boundedIds(reminderIds);
  if (ids.length === 0) return { affected: 0 };
  if (!BULK_PRIORITIES.includes(priority as (typeof BULK_PRIORITIES)[number])) {
    return { error: "Invalid priority." };
  }

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ priority })
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return { error: friendlyError(error, "Could not update the reminders.") };

  revalidateReminderPaths();
  return { affected: ids.length };
}

/**
 * Re-opens every finished reminder in one go.
 *
 * Kept separate from `bulkCompleteRemindersAction` because the two are not
 * symmetric in what they can touch: clearing "done" is only meaningful for rows
 * that are actually finished, and quietly resetting something dismissed weeks
 * ago would be surprising.
 */
export async function bulkReopenRemindersAction(
  reminderIds: string[]
): Promise<ReminderBulkResult> {
  const ids = boundedIds(reminderIds);
  if (ids.length === 0) return { affected: 0 };

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("reminders")
    .update({ status: "pending", snoozed_until: null })
    .eq("user_id", user.id)
    .in("status", validStatuses)
    .in("id", ids);

  if (error) return { error: friendlyError(error, "Could not reopen the reminders.") };

  revalidateReminderPaths();
  return { affected: ids.length };
}