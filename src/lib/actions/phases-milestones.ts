"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { phaseSchema, milestoneSchema, parseForm } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type PhaseFormState = { error?: string; data?: { id: string } };

export async function createPhaseAction(
  projectId: string,
  _prevState: PhaseFormState,
  formData: FormData
): Promise<PhaseFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(phaseSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  // Verify project ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  const { count } = await supabase
    .from("project_phases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("project_id", projectId);
  const sort_order = parsed.data.sort_order ?? (count ?? 0);

  const { data, error } = await supabase
    .from("project_phases")
    .insert({ ...parsed.data, user_id: user.id, project_id: projectId, sort_order })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the phase.") };

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "phase",
    entityType: "project_phase",
    entityId: data.id,
    summary: "Created phase",
    metadata: { name: parsed.data.name },
  });

  revalidatePath(`/projects/${projectId}`);
  return { data: { id: data.id } };
}

export async function updatePhaseAction(
  phaseId: string,
  _prevState: PhaseFormState,
  formData: FormData
): Promise<PhaseFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(phaseSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_phases")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", phaseId)
    .maybeSingle();
  if (!existing) return { error: "Phase not found." };

  const { error } = await supabase
    .from("project_phases")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", phaseId);
  if (error) return { error: friendlyError(error, "Could not update the phase.") };

  revalidatePath(`/projects/${existing.project_id}`);
  return { data: { id: phaseId } };
}

export async function deletePhaseAction(phaseId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_phases")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", phaseId)
    .maybeSingle();
  if (!existing) return { error: "Phase not found." };

  const { error } = await supabase
    .from("project_phases")
    .delete()
    .eq("user_id", user.id)
    .eq("id", phaseId);
  if (error) return { error: friendlyError(error, "Could not delete the phase.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "phase",
    entityType: "project_phase",
    entityId: phaseId,
    summary: "Deleted phase",
  });

  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function setPhaseStatusAction(
  phaseId: string,
  status: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const valid = ["planned", "in_progress", "completed", "blocked"] as const;
  if (!valid.includes(status as (typeof valid)[number])) {
    return { error: "Invalid phase status." };
  }
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_phases")
    .select("project_id, name")
    .eq("user_id", user.id)
    .eq("id", phaseId)
    .maybeSingle();
  if (!existing) return { error: "Phase not found." };

  const { error } = await supabase
    .from("project_phases")
    .update({ status })
    .eq("user_id", user.id)
    .eq("id", phaseId);
  if (error) return { error: friendlyError(error, "Could not update phase status.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "phase",
    entityType: "project_phase",
    entityId: phaseId,
    summary: `Marked phase ${status.replace("_", " ")}`,
    metadata: { name: existing.name },
  });

  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export type MilestoneFormState = { error?: string; data?: { id: string } };

function milestonePath(projectId: string | null): string {
  return projectId ? `/projects/${projectId}` : "/tasks";
}

export async function createMilestoneAction(
  _prevState: MilestoneFormState,
  formData: FormData
): Promise<MilestoneFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(milestoneSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  // Resolve the owning project: explicit form field, or the phase's project.
  const projectId = formData.get("project_id") ? String(formData.get("project_id")) : null;
  if (!projectId) return { error: "A project is required." };

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  const { data, error } = await supabase
    .from("milestones")
    .insert({ ...parsed.data, user_id: user.id, project_id: projectId })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the milestone.") };

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "milestone",
    entityType: "milestone",
    entityId: data.id,
    summary: "Created milestone",
    metadata: { title: parsed.data.title },
  });

  revalidatePath(milestonePath(projectId));
  return { data: { id: data.id } };
}

export async function updateMilestoneAction(
  milestoneId: string,
  _prevState: MilestoneFormState,
  formData: FormData
): Promise<MilestoneFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(milestoneSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("milestones")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", milestoneId)
    .maybeSingle();
  if (!existing) return { error: "Milestone not found." };

  if (parsed.data.phase_id) {
    const { data: phase } = await supabase
      .from("project_phases")
      .select("project_id")
      .eq("user_id", user.id)
      .eq("id", parsed.data.phase_id)
      .maybeSingle();
    if (!phase) return { error: "Phase not found." };
  }

  const { error } = await supabase
    .from("milestones")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", milestoneId);
  if (error) return { error: friendlyError(error, "Could not update the milestone.") };

  revalidatePath(milestonePath(existing.project_id));
  return { data: { id: milestoneId } };
}

export async function deleteMilestoneAction(milestoneId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("milestones")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", milestoneId)
    .maybeSingle();
  if (!existing) return { error: "Milestone not found." };

  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("user_id", user.id)
    .eq("id", milestoneId);
  if (error) return { error: friendlyError(error, "Could not delete the milestone.") };

  revalidatePath(milestonePath(existing.project_id));
  return {};
}

export async function setMilestoneStatusAction(
  milestoneId: string,
  status: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const valid = ["not_started", "in_progress", "completed"] as const;
  if (!valid.includes(status as (typeof valid)[number])) {
    return { error: "Invalid milestone status." };
  }
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("milestones")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", milestoneId)
    .maybeSingle();
  if (!existing) return { error: "Milestone not found." };

  const { error } = await supabase
    .from("milestones")
    .update({ status })
    .eq("user_id", user.id)
    .eq("id", milestoneId);
  if (error) return { error: friendlyError(error, "Could not update milestone status.") };

  revalidatePath(milestonePath(existing.project_id));
  return {};
}