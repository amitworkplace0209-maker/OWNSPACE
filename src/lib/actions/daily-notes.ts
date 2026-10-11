"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { dailyNoteSchema, planningEntrySchema, parseForm } from "@/lib/schemas";

export type DailyNoteFormState = { error?: string };

/** The structured blocks migration 017 added, in the order the form shows them. */
const SECTION_KEYS = [
  "todays_work",
  "completed_work",
  "problems",
  "ideas",
  "next_steps",
] as const;

export async function saveDailyNoteAction(
  _prevState: DailyNoteFormState,
  formData: FormData
): Promise<DailyNoteFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(dailyNoteSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  // daily_notes has a unique constraint on (user_id, project_id, note_date).
  // Verify ownership of the project first, then upsert on that key.
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", parsed.data.project_id)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  // Only the fields the form actually posted are written. A blank optional
  // field is sent as "" by an input, which is not the same as "leave it alone"
  // — and clearing a section the wizard filled in should be possible, while
  // clearing one because a field was never rendered should not be.
  const row: Record<string, unknown> = {
    ...parsed.data,
    user_id: user.id,
  };
  for (const key of SECTION_KEYS) {
    if (!formData.has(key)) delete row[key];
  }

  const { error } = await supabase
    .from("daily_notes")
    .upsert(row, { onConflict: "user_id,project_id,note_date" });
  if (error) return { error: friendlyError(error, "Could not save the daily note.") };

  revalidatePath("/daily");
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return {};
}

export async function deleteDailyNoteAction(projectId: string, date: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("daily_notes")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .eq("note_date", date)
    .maybeSingle();
  if (!existing) return { error: "Daily note not found." };

  const { error } = await supabase
    .from("daily_notes")
    .delete()
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .eq("note_date", date);
  if (error) return { error: friendlyError(error, "Could not delete the daily note.") };

  revalidatePath("/daily");
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  return {};
}

export type PlanningEntryFormState = { error?: string; data?: { id: string } };

export async function createPlanningEntryAction(
  _prevState: PlanningEntryFormState,
  formData: FormData
): Promise<PlanningEntryFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(planningEntrySchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("planning_entries")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not add the planning entry.") };

  revalidatePath("/daily");
  revalidatePath("/notes");
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data: { id: data.id } };
}

export async function updatePlanningEntryAction(
  entryId: string,
  _prevState: PlanningEntryFormState,
  formData: FormData
): Promise<PlanningEntryFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(planningEntrySchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("planning_entries")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Planning entry not found." };

  const { error } = await supabase
    .from("planning_entries")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", entryId);
  if (error) return { error: friendlyError(error, "Could not update the planning entry.") };

  revalidatePath("/notes");
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data: { id: entryId } };
}

export async function deletePlanningEntryAction(entryId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("planning_entries")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", entryId)
    .maybeSingle();
  if (!existing) return { error: "Planning entry not found." };

  const { error } = await supabase
    .from("planning_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("id", entryId);
  if (error) return { error: friendlyError(error, "Could not delete the planning entry.") };

  revalidatePath("/daily");
  revalidatePath("/notes");
  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}