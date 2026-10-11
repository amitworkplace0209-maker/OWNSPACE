"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";

const BUCKET = "ownspece-files";
const MAX_FILE_SIZE = 100 * 1024 * 1024;

export type WizardUpload = {
  /** Storage object path, `<user_id>/<timestamp>_<name>`. */
  path: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number;
};

export type WizardUploadResult =
  | { ok: true; file: WizardUpload }
  | { ok: false; error: string };

/**
 * Uploads a file for the project wizard.
 *
 * Deliberately does **not** create a `files` row. That table has a
 * `files_scope` CHECK requiring a `project_id` or `task_id`, and at wizard time
 * neither exists yet — so the row is created by `createProjectWizardAction`
 * once the project has an id.
 *
 * The object itself goes to the same private bucket under the same
 * `<user_id>/…` prefix as every other upload, so the existing Storage RLS
 * policies apply unchanged.
 */
export async function uploadWizardFileAction(formData: FormData): Promise<WizardUploadResult> {
  const user = await getUserOrRedirect();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { ok: false, error: "Choose a file to upload." };
  }
  if (file.size === 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, error: "File is too large (max 100 MB)." };
  }

  const supabase = await createClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${Date.now()}_${safeName}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      // The path already contains a timestamp, so a retried upload of the same
      // name cannot collide with the previous attempt.
      upsert: true,
    });

  if (uploadError) {
    return { ok: false, error: friendlyError(uploadError, "Could not upload the file.") };
  }

  return {
    ok: true,
    file: {
      path: storagePath,
      name: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
    },
  };
}

/** Removes an object uploaded during the wizard that never got saved. */
export async function discardWizardFileAction(path: string): Promise<void> {
  const user = await getUserOrRedirect();

  // Never let one user delete another user's object through this action.
  if (!path.startsWith(`${user.id}/`)) return;

  const supabase = await createClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
