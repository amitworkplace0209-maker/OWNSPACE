"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { calendarEventSchema, reminderSchema, parseForm } from "@/lib/schemas";
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