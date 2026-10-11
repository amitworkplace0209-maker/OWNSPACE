"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { logActivity } from "@/lib/activity";
import { attachDriveFileAction, removeDriveFileRefAction } from "@/lib/actions/gdrive";
import type { DriveItem } from "@/lib/gdrive";
import { RESOURCE_TYPES, type ResourceType } from "@/types";
import {
  kindNeedsUrl,
  KINDS_BY_SOURCE,
  kindLabel,
  MAX_UPLOAD_BYTES,
  sourceLabel,
  type ResourceSource,
} from "@/lib/resources-logic";

/**
 * Matches the bucket's own `file_size_limit` from migration 010.
 *
 * Not exported: a `"use server"` module may only export async functions, so
 * anything shared lives in `@/lib/dal/storage` instead.
 */
const FILES_BUCKET = "ownspece-files";

export type ResourceFormState = {
  error?: string;
  data?: { key: string; source: ResourceSource };
};

/** Normalises an arbitrary name into something safe to put in a storage path. */
function safeSegment(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return cleaned.length > 0 ? cleaned : "file";
}

function parseTags(value: string | null): string[] | null {
  if (!value) return null;
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
  return tags.length > 0 ? tags : null;
}

/** Empty string → null, so a blank optional field is stored as NULL not "". */
function orNull(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

/**
 * Creates a resource from one of three destinations.
 *
 * The destination decides which other inputs are meaningful, so the branch is
 * taken server-side rather than trusted from the form:
 *
 *  - `supabase` uploads the blob to Storage and writes a `files` row. A
 *    `project_resources` row is added too when a kind/tags/description were
 *    chosen, so the per-project Resources tab shows the same attachment.
 *  - `drive` links an existing Drive file through `gdrive_file_refs`. Nothing
 *    is copied — Drive keeps the bytes.
 *  - `link` writes only a `project_resources` row with a URL.
 *
 * Every path verifies ownership of the project and task before writing, because
 * the ids arrive from a form.
 */
export async function createResourceAction(
  _prevState: ResourceFormState,
  formData: FormData
): Promise<ResourceFormState> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const source = orNull(formData.get("source")) as ResourceSource | null;
  const kindRaw = orNull(formData.get("kind"));
  const name = orNull(formData.get("name"));
  const description = orNull(formData.get("description"));
  const projectId = orNull(formData.get("project_id"));
  const taskId = orNull(formData.get("task_id"));
  const url = orNull(formData.get("url"));
  const tags = parseTags(orNull(formData.get("tags")));

  if (source !== "supabase" && source !== "drive" && source !== "link") {
    return { error: "Choose where this resource should live." };
  }
  if (!kindRaw || !RESOURCE_TYPES.includes(kindRaw as ResourceType)) {
    return { error: "Choose a resource type." };
  }
  const kind = kindRaw as ResourceType;

  // The destination decides the type list, so the server re-derives exactly
  // what the form offered rather than trusting a hand-edited `kind`. Checking
  // membership in the same constant the UI renders from means the two can
  // never drift into offering a combination the write path refuses.
  if (!KINDS_BY_SOURCE[source].includes(kind)) {
    return {
      error:
        source === "drive"
          ? "Google Drive files are linked, not chosen from a type list."
          : `A ${kindLabel(kind)} cannot be added as a ${sourceLabel(source).toLowerCase()} resource.`,
    };
  }

  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", projectId)
      .maybeSingle();
    if (!data) return { error: "Project not found." };
  }

  if (taskId) {
    const { data } = await supabase
      .from("tasks")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", taskId)
      .maybeSingle();
    if (!data) return { error: "Task not found." };
  }

  // --- Google Drive ---------------------------------------------------------
  if (source === "drive") {
    const connectionId = orNull(formData.get("connection_id"));
    const driveFileId = orNull(formData.get("drive_file_id"));
    const driveName = orNull(formData.get("drive_name"));
    const driveWebLink = orNull(formData.get("drive_web_link"));
    const driveMime = orNull(formData.get("drive_mime_type"));
    const driveSize = Number(orNull(formData.get("drive_size")));

    if (!connectionId || !driveFileId || !driveName) {
      return { error: "Pick a file from Google Drive." };
    }

    const item: DriveItem = {
      id: driveFileId,
      name: driveName,
      mimeType: driveMime ?? "application/octet-stream",
      size: Number.isFinite(driveSize) && driveSize > 0 ? String(driveSize) : null,
      modifiedTime: null,
      webViewLink: driveWebLink,
      webContentLink: null,
      isFolder: false,
      isGoogleDoc: (driveMime ?? "").startsWith("application/vnd.google-apps."),
      owners: [],
      shared: false,
      driveId: null,
    };

    const result = await attachDriveFileAction({
      connectionId,
      item,
      projectId,
      taskId,
      noteId: orNull(formData.get("note_id")),
    });
    if (!result.ok) return { error: result.error };

    await logActivity({
      userId: user.id,
      projectId,
      activityType: "resource",
      entityType: "resource",
      entityId: result.data.id,
      summary: "Linked a Google Drive file",
      metadata: { name: driveName },
    });

    revalidateResources(projectId, taskId);
    return { data: { key: `drive:${result.data.id}`, source: "drive" } };
  }

  // --- Link -----------------------------------------------------------------
  if (source === "link") {
    if (kindNeedsUrl(kind) && !url) {
      return { error: "Enter the link for this resource." };
    }
    if (url) {
      try {
        // Rejects "javascript:" and friends before they reach a rendered href.
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return { error: "Only http and https links are supported." };
        }
      } catch {
        return { error: "Enter a valid URL." };
      }
    }
    if (!name && !url) return { error: "Give the resource a name or a link." };

    const { data, error } = await supabase
      .from("project_resources")
      .insert({
        user_id: user.id,
        project_id: projectId,
        resource_type: kind,
        name: name ?? new URL(url as string).hostname,
        description,
        url,
        tags,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { error: friendlyError(error, "Could not save the resource.") };
    }

    await logActivity({
      userId: user.id,
      projectId,
      activityType: "resource",
      entityType: "resource",
      entityId: data.id,
      summary: "Added a resource",
      metadata: { name: name ?? url, resource_type: kind },
    });

    revalidateResources(projectId, taskId);
    return { data: { key: `link:${data.id}`, source: "link" } };
  }

  // --- Supabase Storage -----------------------------------------------------
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: `That file is larger than the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
    };
  }

  const displayName = name ?? file.name;
  const storagePath = `${user.id}/${Date.now()}_${safeSegment(file.name)}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      // Without this a retry after a partial failure collides on the same key.
      upsert: false,
    });
  if (uploadErr) {
    return { error: friendlyError(uploadErr, "Could not upload the file.") };
  }

  // One blob, two rows. `files` is what /storage, /files and the task pages
  // read; `project_resources` is what the project's Resources tab reads. Both
  // point at the same storage path, so nothing is duplicated on disk.
  const { data: fileRow, error: fileErr } = await supabase
    .from("files")
    .insert({
      user_id: user.id,
      project_id: projectId,
      task_id: taskId,
      name: displayName,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("id")
    .single();

  if (fileErr || !fileRow) {
    // Best-effort cleanup: a blob with no row is invisible to the UI and just
    // occupies space forever.
    await supabase.storage.from(FILES_BUCKET).remove([storagePath]);
    return { error: friendlyError(fileErr, "Could not save the file metadata.") };
  }

  if (kind !== "supabase_file" || description || tags || projectId) {
    const { error: resourceErr } = await supabase.from("project_resources").insert({
      user_id: user.id,
      project_id: projectId,
      resource_type: kind,
      name: displayName,
      description,
      storage_path: storagePath,
      mime_type: file.type || null,
      size_bytes: file.size,
      tags,
    });
    if (resourceErr) {
      // The upload itself worked, so this is a partial success, not a failure.
      // Reported so the user knows the project tab may not list it.
      await logActivity({
        userId: user.id,
        projectId,
        activityType: "file",
        entityType: "file",
        entityId: fileRow.id,
        summary: "Uploaded file (project listing could not be updated)",
        metadata: { name: displayName },
      });
    }
  }

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "file",
    entityType: "file",
    entityId: fileRow.id,
    summary: "Uploaded file",
    metadata: { name: displayName, size: file.size },
  });

  revalidateResources(projectId, taskId);
  return { data: { key: `supabase:${fileRow.id}`, source: "supabase" } };
}

/**
 * Deletes a resource, routing to whichever table owns it.
 *
 * Drive is the exception: unlinking only drops the reference, because the file
 * itself belongs to the user's Google account and deleting it here would be a
 * destructive surprise.
 */
export async function deleteResourceAction(input: {
  source: ResourceSource;
  id: string;
}): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  if (input.source === "drive") {
    const result = await removeDriveFileRefAction(input.id);
    if (!result.ok) return { error: result.error };
    revalidateResources(null, null);
    return {};
  }

  if (input.source === "link") {
    const { data: existing } = await supabase
      .from("project_resources")
      .select("project_id, storage_path, name")
      .eq("user_id", user.id)
      .eq("id", input.id)
      .maybeSingle();
    if (!existing) return { error: "Resource not found." };

    const { error } = await supabase
      .from("project_resources")
      .delete()
      .eq("user_id", user.id)
      .eq("id", input.id);
    if (error) return { error: friendlyError(error, "Could not delete the resource.") };

    // A stored resource shares its blob with a `files` row; removing that row
    // removes the bytes, and the resource row goes with it.
    if (existing.storage_path) {
      const { data: fileRow } = await supabase
        .from("files")
        .select("id")
        .eq("user_id", user.id)
        .eq("storage_path", existing.storage_path)
        .maybeSingle();
      if (fileRow) {
        await deleteFileById(supabase, user.id, fileRow.id);
      } else {
        await supabase.storage.from(FILES_BUCKET).remove([existing.storage_path]);
      }
    }

    await logActivity({
      userId: user.id,
      projectId: existing.project_id,
      activityType: "resource",
      entityType: "resource",
      entityId: input.id,
      summary: "Deleted a resource",
      metadata: { name: existing.name },
    });

    revalidateResources(existing.project_id, null);
    return {};
  }

  const result = await deleteFileById(supabase, user.id, input.id);
  if (result.error) return result;
  revalidateResources(null, null);
  return {};
}

async function deleteFileById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  fileId: string
): Promise<{ error?: string }> {
  const { data: existing } = await supabase
    .from("files")
    .select("storage_path, project_id, task_id, name")
    .eq("user_id", userId)
    .eq("id", fileId)
    .maybeSingle();
  if (!existing) return { error: "File not found." };

  // Any project_resources row pointing at the same blob goes too, or the file
  // would vanish from the grid while still listed on the project page.
  await supabase
    .from("project_resources")
    .delete()
    .eq("user_id", userId)
    .eq("storage_path", existing.storage_path);

  await supabase.storage.from(FILES_BUCKET).remove([existing.storage_path]);

  const { error } = await supabase
    .from("files")
    .delete()
    .eq("user_id", userId)
    .eq("id", fileId);
  if (error) return { error: friendlyError(error, "Could not delete the file.") };

  await logActivity({
    userId: userId,
    projectId: existing.project_id,
    activityType: "file",
    entityType: "file",
    entityId: fileId,
    summary: "Deleted file",
    metadata: { name: existing.name },
  });

  revalidateResources(existing.project_id, existing.task_id);
  return {};
}

/**
 * A short-lived URL for opening a resource.
 *
 * Supabase objects are private, so the browser cannot address them directly —
 * a signed URL is minted server-side per request and expires in ten minutes.
 * Drive rows and links already have a public web link.
 */
export async function getResourceUrlAction(input: {
  source: ResourceSource;
  id: string;
  kind?: ResourceType;
}): Promise<{ url?: string; error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  if (input.source === "drive") {
    const { data } = await supabase
      .from("gdrive_file_refs")
      .select("web_link")
      .eq("user_id", user.id)
      .eq("id", input.id)
      .maybeSingle();
    if (!data?.web_link) return { error: "This Drive file has no link." };
    return { url: data.web_link };
  }

  if (input.source === "link") {
    const { data } = await supabase
      .from("project_resources")
      .select("url, storage_path")
      .eq("user_id", user.id)
      .eq("id", input.id)
      .maybeSingle();
    if (!data) return { error: "Resource not found." };
    if (data.url) return { url: data.url };
    if (data.storage_path) {
      return signPath(user.id, data.storage_path);
    }
    return { error: "This resource has nothing to open." };
  }

  const { data } = await supabase
    .from("files")
    .select("storage_path")
    .eq("user_id", user.id)
    .eq("id", input.id)
    .maybeSingle();
  if (!data) return { error: "File not found." };
  return signPath(user.id, data.storage_path);
}

async function signPath(userId: string, storagePath: string) {
  // Defence in depth: the RLS policy already restricts this folder to the
  // owner, but a path that somehow escaped that would be signed here.
  if (!storagePath.startsWith(`${userId}/`)) {
    return { error: "That file is not in your storage." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(storagePath, 600);
  if (error || !data) {
    return { error: friendlyError(error, "Could not open the file.") };
  }
  return { url: data.signedUrl };
}

function revalidateResources(projectId: string | null, taskId: string | null) {
  revalidatePath("/resources");
  revalidatePath("/files");
  revalidatePath("/storage");
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath("/tasks");
}