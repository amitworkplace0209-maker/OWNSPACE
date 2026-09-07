"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { logActivity } from "@/lib/activity";

export type FileFormState = { error?: string; data?: { id: string; url: string } };

const BUCKET = "ownspece-files";
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export async function uploadFileAction(
  projectId: string | null | undefined,
  taskId: string | null | undefined,
  _prevState: FileFormState,
  formData: FormData
): Promise<FileFormState> {
  const user = await getUserOrRedirect();
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "No file provided." };
  if (file.size > MAX_FILE_SIZE) return { error: "File is too large (max 100 MB)." };

  const supabase = await createClient();

  // Verify ownership of target project/task
  if (projectId) {
    const { data: proj } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", projectId)
      .maybeSingle();
    if (!proj) return { error: "Project not found." };
  }
  if (taskId) {
    const { data: task } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", taskId)
      .maybeSingle();
    if (!task) return { error: "Task not found." };
  }

  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${timestamp}_${safeName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, { contentType: file.type || "application/octet-stream" });
  if (uploadErr) return { error: friendlyError(uploadErr, "Could not upload the file.") };

  const { data: meta, error: insertErr } = await supabase
    .from("files")
    .insert({
      user_id: user.id,
      project_id: projectId ?? null,
      task_id: taskId ?? null,
      name: file.name,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id")
    .single();
  if (insertErr || !meta) {
    // Best-effort cleanup: remove the uploaded blob if metadata insert fails.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    return { error: friendlyError(insertErr, "Could not save the file metadata.") };
  }

  // Get a signed URL for the client to display/preview immediately.
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 600);
  const url = !signErr && signed?.signedUrl ? signed.signedUrl : "";

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "file",
    entityType: "file",
    entityId: meta.id,
    summary: "Uploaded file",
    metadata: { name: file.name, size: file.size },
  });

  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath("/tasks");
  revalidatePath("/files");
  return { data: { id: meta.id, url } };
}

export async function deleteFileAction(fileId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("files")
    .select("storage_path, project_id, task_id, name")
    .eq("user_id", user.id)
    .eq("id", fileId)
    .maybeSingle();
  if (!existing) return { error: "File not found." };

  // Remove storage object first, then metadata row (cascade takes care of nothing here).
  await supabase.storage.from(BUCKET).remove([existing.storage_path]).catch(() => {});

  const { error } = await supabase.from("files").delete().eq("user_id", user.id).eq("id", fileId);
  if (error) return { error: friendlyError(error, "Could not delete the file.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "file",
    entityType: "file",
    entityId: fileId,
    summary: "Deleted file",
    metadata: { name: existing.name },
  });

  if (existing.project_id) revalidatePath(`/projects/${existing.project_id}`);
  if (existing.task_id) revalidatePath("/tasks");
  revalidatePath("/files");
  return {};
}

export async function getSignedUrlAction(fileId: string): Promise<{ url?: string; error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("files")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("id", fileId)
    .maybeSingle();
  if (!existing) return { error: "File not found." };

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(existing.storage_path, 600);
  if (error || !data) return { error: friendlyError(error, "Could not generate download link.") };
  return { url: data.signedUrl };
}