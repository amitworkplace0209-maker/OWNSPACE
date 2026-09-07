"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { projectSchema } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type ProjectFormState = { error?: string; data?: { id: string } };

function parseProject(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const result = projectSchema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    return { error: first?.message ?? "Please check the form." };
  }
  return { data: result.data };
}

export async function createProjectAction(
  _prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseProject(formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not create the project.") };
  }

  await logActivity({
    userId: user.id,
    projectId: data.id,
    activityType: "project",
    entityType: "project",
    entityId: data.id,
    summary: "Created project",
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { data: { id: data.id } };
}

export async function updateProjectAction(
  projectId: string,
  _prevState: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseProject(formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", projectId)
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not update the project.") };
  }

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "project",
    entityType: "project",
    entityId: projectId,
    summary: "Updated project",
    metadata: { name: parsed.data.name },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return { data: { id: projectId } };
}

export async function deleteProjectAction(projectId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  // Project deletion is final (cascades to child rows). Files' metadata rows
  // cascade; Storage objects are removed here to avoid orphaned blobs.
  const { data: fileRows } = await supabase
    .from("files")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("project_id", projectId);
  if (fileRows && fileRows.length > 0) {
    const storage = supabase.storage;
    const { data: buckets } = await storage.listBuckets();
    const bucket = buckets?.find((b) => b.name.startsWith("ownspece"));
    if (bucket) {
      await storage
        .from(bucket.name)
        .remove(fileRows.map((f) => f.storage_path))
        .catch(() => {});
    }
  }

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("user_id", user.id)
    .eq("id", projectId);

  if (error) return { error: friendlyError(error, "Could not delete the project.") };

  revalidatePath("/projects");
  revalidatePath("/dashboard");
  return {};
}

export async function setProjectStatusAction(projectId: string, status: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const validStatuses = ["active", "on_hold", "completed", "archived"] as const;
  if (!validStatuses.includes(status as (typeof validStatuses)[number])) {
    return { error: "Invalid project status." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status })
    .eq("user_id", user.id)
    .eq("id", projectId);
  if (error) return { error: friendlyError(error, "Could not update status.") };

  const label = status === "archived" ? "Archived project" : `Marked project ${status.replace("_", " ")}`;
  await logActivity({
    userId: user.id,
    projectId,
    activityType: "project",
    entityType: "project",
    entityId: projectId,
    summary: label,
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/archive");
  revalidatePath("/dashboard");
  return {};
}

type ProjectTagInput = {
  projectId: string;
  tagIds: string[];
};

export async function setProjectTagsAction(input: ProjectTagInput): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  // Verify ownership of each tag and the project; then replace the junction rows.
  const { data: ownedTags } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", user.id)
    .in("id", input.tagIds);
  const ownedIds = new Set((ownedTags ?? []).map((t) => t.id));

  const { data: existing } = await supabase
    .from("project_tags")
    .select("id, tag_id")
    .eq("user_id", user.id)
    .eq("project_id", input.projectId);

  const toRemove = (existing ?? []).filter((e) => !ownedIds.has(e.tag_id)).map((e) => e.id);
  const toAdd = [...ownedIds].filter((id) => !(existing ?? []).some((e) => e.tag_id === id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("project_tags")
      .delete()
      .eq("user_id", user.id)
      .in("id", toRemove);
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("project_tags")
      .insert(toAdd.map((tagId) => ({ user_id: user.id, project_id: input.projectId, tag_id: tagId })));
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }

  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath("/projects");
  return {};
}