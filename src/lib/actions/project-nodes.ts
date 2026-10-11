"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { projectNodeSchema, projectResourceSchema, projectHistorySchema, parseForm } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";
import type { NodeType, Priority } from "@/types";

export type ProjectNodeFormState = { error?: string; data?: { id: string } };

export async function createProjectNodeAction(
  _prevState: ProjectNodeFormState,
  formData: FormData
): Promise<ProjectNodeFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(projectNodeSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_nodes")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not create the project node.") };
  }

  await logActivity({
    userId: user.id,
    projectId: parsed.data.project_id,
    activityType: "project_node",
    entityType: "project_node",
    entityId: data.id,
    summary: `Created ${parsed.data.node_type}`,
    metadata: { title: parsed.data.title, node_type: parsed.data.node_type },
  });

  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data: { id: data.id } };
}

export async function updateProjectNodeAction(
  nodeId: string,
  _prevState: ProjectNodeFormState,
  formData: FormData
): Promise<ProjectNodeFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(projectNodeSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("project_nodes")
    .select("project_id, title, node_type")
    .eq("user_id", user.id)
    .eq("id", nodeId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Project node not found." };

  const { error } = await supabase
    .from("project_nodes")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", nodeId);

  if (error) return { error: friendlyError(error, "Could not update the project node.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "project_node",
    entityType: "project_node",
    entityId: nodeId,
    summary: `Updated ${existing.node_type}`,
    metadata: { title: parsed.data.title },
  });

  revalidatePath(`/projects/${existing.project_id}`);
  return { data: { id: nodeId } };
}

export async function deleteProjectNodeAction(nodeId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("project_nodes")
    .select("project_id, title, node_type")
    .eq("user_id", user.id)
    .eq("id", nodeId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Project node not found." };

  const { error } = await supabase
    .from("project_nodes")
    .delete()
    .eq("user_id", user.id)
    .eq("id", nodeId);
  if (error) return { error: friendlyError(error, "Could not delete the project node.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "project_node",
    entityType: "project_node",
    entityId: nodeId,
    summary: `Deleted ${existing.node_type}`,
    metadata: { title: existing.title },
  });

  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function reorderProjectNodesAction(items: { id: string; sort_order: number }[]): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: owned } = await supabase
    .from("project_nodes")
    .select("id")
    .eq("user_id", user.id)
    .in("id", items.map((i) => i.id));
  if ((owned?.length ?? 0) !== items.length) return { error: "Access denied." };

  const patch = items.map((item) => ({ ...item }));
  const { error } = await supabase.from("project_nodes").upsert(patch);
  if (error) return { error: friendlyError(error, "Could not reorder nodes.") };
  return {};
}

export async function getProjectNodes(projectId: string) {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_nodes")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data;
}

export async function getProjectNode(nodeId: string) {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_nodes")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", nodeId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

export type ProjectResourceFormState = { error?: string; data?: { id: string } };

export async function createProjectResourceAction(
  _prevState: ProjectResourceFormState,
  formData: FormData
): Promise<ProjectResourceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(projectResourceSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_resources")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not create the resource.") };
  }

  await logActivity({
    userId: user.id,
    projectId: parsed.data.project_id,
    activityType: "resource",
    entityType: "resource",
    entityId: data.id,
    summary: "Added resource",
    metadata: { name: parsed.data.name, resource_type: parsed.data.resource_type },
  });

  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { data: { id: data.id } };
}

export async function updateProjectResourceAction(
  resourceId: string,
  _prevState: ProjectResourceFormState,
  formData: FormData
): Promise<ProjectResourceFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(projectResourceSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_resources")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", resourceId)
    .maybeSingle();
  if (!existing) return { error: "Resource not found." };

  const { error } = await supabase
    .from("project_resources")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", resourceId);
  if (error) return { error: friendlyError(error, "Could not update the resource.") };

  revalidatePath(`/projects/${existing.project_id}`);
  return { data: { id: resourceId } };
}

export async function deleteProjectResourceAction(resourceId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("project_resources")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", resourceId)
    .maybeSingle();
  if (!existing) return { error: "Resource not found." };

  const { error } = await supabase
    .from("project_resources")
    .delete()
    .eq("user_id", user.id)
    .eq("id", resourceId);
  if (error) return { error: friendlyError(error, "Could not delete the resource.") };

  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function getProjectResources(projectId: string) {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_resources")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data;
}

export async function getProjectHistory(projectId: string, limit = 100) {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_history")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data;
}

export async function logProjectHistory(input: {
  projectId: string;
  entityType: string;
  entityId?: string | null;
  action: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  summary?: string | null;
}): Promise<void> {
  try {
    const user = await getUserOrRedirect();
    const supabase = await createClient();
    await supabase.from("project_history").insert({
      user_id: user.id,
      project_id: input.projectId,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      action: input.action,
      old_value: input.oldValue ?? null,
      new_value: input.newValue ?? null,
      summary: input.summary ?? null,
    });
  } catch {
    // Best-effort history logging
  }
}