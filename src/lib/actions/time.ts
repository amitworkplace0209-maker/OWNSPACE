"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { timeEntrySchema, pomodoroSettingsSchema, parseForm } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type TimeEntryFormState = { error?: string; data?: { id: string } };

export async function createTimeEntryAction(
  _prevState: TimeEntryFormState,
  formData: FormData
): Promise<TimeEntryFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(timeEntrySchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      ...parsed.data,
      user_id: user.id,
      ended_at: new Date(
        new Date(parsed.data.started_at).getTime() + parsed.data.duration_minutes * 60_000
      ).toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create time entry.") };

  await logActivity({
    userId: user.id,
    projectId: parsed.data.project_id,
    activityType: "time",
    entityType: "time_entry",
    entityId: data.id,
    summary: `Logged ${parsed.data.duration_minutes}m`,
    metadata: { task_id: parsed.data.task_id, duration: parsed.data.duration_minutes },
  });

  revalidatePath("/time");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data: { id: data.id } };
}

export async function deleteTimeEntryAction(entryId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("time_entries")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Time entry not found." };

  const { error } = await supabase.from("time_entries").delete().eq("user_id", user.id).eq("id", entryId);
  if (error) return { error: friendlyError(error, "Could not delete time entry.") };

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return {};
}

export type TimerStartState = { error?: string; data?: { id: string } };

export async function startTimerAction(
  projectId: string,
  taskId: string | null
): Promise<TimerStartState> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  // Stop any currently running timer first, computing its elapsed duration
  const { data: running } = await supabase
    .from("time_entries")
    .select("id, started_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .limit(1);
  if (running && running.length > 0) {
    const now = Date.now();
    const duration = Math.max(1, Math.round((now - new Date(running[0].started_at).getTime()) / 60_000));
    await supabase
      .from("time_entries")
      .update({ ended_at: new Date(now).toISOString(), duration_minutes: duration })
      .eq("user_id", user.id)
      .eq("id", running[0].id);
  }

  const { data, error } = await supabase
    .from("time_entries")
    .insert({
      user_id: user.id,
      project_id: projectId,
      task_id: taskId,
      started_at: new Date().toISOString(),
      duration_minutes: 0,
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not start the timer.") };

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function stopTimerAction(entryId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("time_entries")
    .select("project_id, started_at")
    .eq("user_id", user.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Timer not found." };

  const now = new Date();
  const started = new Date(existing.started_at);
  const durationMinutes = Math.max(1, Math.round((now.getTime() - started.getTime()) / 60_000));

  const { error } = await supabase
    .from("time_entries")
    .update({ ended_at: now.toISOString(), duration_minutes: durationMinutes })
    .eq("user_id", user.id)
    .eq("id", entryId);
  if (error) return { error: friendlyError(error, "Could not stop the timer.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "time",
    entityType: "time_entry",
    entityId: entryId,
    summary: `Timed ${durationMinutes}m`,
  });

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return {};
}

export type PomodoroState = { error?: string; data?: { id: string } };

export async function startPomodoroAction(
  taskId: string,
  focusMinutes: number,
  breakMinutes: number
): Promise<PomodoroState> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  // Cancel any currently running session
  await supabase
    .from("pomodoro_sessions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "running");

  const { data, error } = await supabase
    .from("pomodoro_sessions")
    .insert({
      user_id: user.id,
      task_id: taskId,
      focus_duration_minutes: focusMinutes,
      break_duration_minutes: breakMinutes,
      started_at: new Date().toISOString(),
      status: "running",
    })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not start pomodoro.") };

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function completePomodoroAction(sessionId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("pomodoro_sessions")
    .select("task_id, tasks(project_id)")
    .eq("user_id", user.id)
    .eq("id", sessionId)
    .maybeSingle();
  if (!existing) return { error: "Pomodoro not found." };

  const { error } = await supabase
    .from("pomodoro_sessions")
    .update({ status: "completed", ended_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", sessionId);
  if (error) return { error: friendlyError(error, "Could not complete pomodoro.") };

  await logActivity({
    userId: user.id,
    projectId: (existing.tasks as unknown as { project_id: string } | null)?.project_id ?? null,
    activityType: "pomodoro",
    entityType: "pomodoro_session",
    entityId: sessionId,
    summary: "Completed a focus session",
  });

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return {};
}

export async function cancelPomodoroAction(sessionId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("pomodoro_sessions")
    .update({ status: "cancelled", ended_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", sessionId);
  if (error) return { error: friendlyError(error, "Could not cancel pomodoro.") };

  revalidatePath("/time");
  revalidatePath("/dashboard");
  return {};
}

export type PomodoroSettingsFormState = { error?: string; data?: { id: string } };

export async function updatePomodoroSettingsAction(
  _prevState: PomodoroSettingsFormState,
  formData: FormData
): Promise<PomodoroSettingsFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(pomodoroSettingsSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_preferences")
    .update(parsed.data)
    .eq("user_id", user.id);
  if (error) return { error: friendlyError(error, "Could not update settings.") };

  revalidatePath("/settings");
  revalidatePath("/time");
  return { data: { id: user.id } };
}