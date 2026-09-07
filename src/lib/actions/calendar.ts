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
    .insert({ ...parsed.data, user_id: user.id, status: "pending" })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the reminder.") };

  revalidatePath("/reminders");
  revalidatePath("/dashboard");
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
    .select("project_id")
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

  revalidatePath("/reminders");
  revalidatePath("/dashboard");
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
  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  return {};
}

const validStatuses = ["pending", "triggered", "dismissed", "snoozed"] as const;

export async function setReminderStatusAction(
  reminderId: string,
  status: string,
  snoozeMinutes?: number
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
    return { error: "Invalid reminder status." };
  }
  const supabase = await createClient();

  if (status === "snoozed" && snoozeMinutes && snoozeMinutes > 0) {
    const newTime = new Date(Date.now() + snoozeMinutes * 60_000).toISOString();
    const { error } = await supabase
      .from("reminders")
      .update({ status, remind_at: newTime })
      .eq("user_id", user.id)
      .eq("id", reminderId);
    if (error) return { error: friendlyError(error, "Could not snooze the reminder.") };
  } else {
    const { error } = await supabase
      .from("reminders")
      .update({ status })
      .eq("user_id", user.id)
      .eq("id", reminderId);
    if (error) return { error: friendlyError(error, "Could not update the reminder.") };
  }

  revalidatePath("/reminders");
  revalidatePath("/dashboard");
  return {};
}