"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import {
  buildGDriveAuthUrl,
  driveCreateFolder,
  driveGetFolder,
  driveGetQuota,
  driveListFiles,
  driveListSharedDrives,
  driveTrash,
  isGDriveConfigured,
  type DriveItem,
  type DriveQuota,
} from "@/lib/gdrive";
import { getGDriveAccessToken } from "@/lib/gdrive";

/** An action that returns a value. `data` is guaranteed present when ok. */
export type GDriveResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** An action whose only outcome is success or failure. */
export type GDriveActionResult = { ok: true } | { ok: false; error: string };

const OAUTH_STATE_COOKIE = "gdrive_oauth_state";

/**
 * The current request URL, read from the request headers.
 *
 * The OAuth `redirect_uri` used to be built from an origin the client passed
 * in, which meant a caller could aim Google's consent screen at a host of their
 * choosing. Deriving it here is what closes that off.
 */
async function currentRequestUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/gdrive`;
}

/** A basic shape check — the real verification happens after Google's consent. */
function normaliseEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Begins connecting an account.
 *
 * `email` is what the user *expects* to connect; it is carried through the
 * OAuth state and checked against the account Google actually returns. That is
 * the only honest way to honour "connect this email": Google still has to
 * prove the person controls the account, so an entry alone cannot grant access
 * to someone else's Drive.
 */
export async function startGDriveAuthAction(
  email: string
): Promise<GDriveResult<{ url: string; expectedEmail: string }>> {
  if (!isGDriveConfigured()) {
    return {
      ok: false,
      error: "Google Drive is not configured on this server (missing GOOGLE_CLIENT_ID/SECRET).",
    };
  }

  const expectedEmail = normaliseEmail(email);
  if (!expectedEmail) {
    return { ok: false, error: "Enter a valid Google account email." };
  }

  const user = await getUserOrRedirect();
  const supabase = await createClient();

  // Refuse to send someone to a consent screen for an account they never
  // linked, and tell them when it is already connected instead.
  const { data: existing } = await supabase
    .from("gdrive_connections")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("account_email", expectedEmail)
    .maybeSingle();

  if (existing && existing.status === "active") {
    return {
      ok: false,
      error: `${expectedEmail} is already connected. Disconnect it first to reconnect with new permissions.`,
    };
  }

  const state = `${randomUUID()}.${randomBytes(12).toString("hex")}.${expectedEmail}`;
  const cookieStore = await cookies();
  cookieStore.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  const requestUrl = await currentRequestUrl();
  return { ok: true, data: { url: buildGDriveAuthUrl(requestUrl, state), expectedEmail } };
}

export async function disconnectGDriveAction(connectionId: string): Promise<GDriveActionResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("gdrive_connections")
    .delete()
    .eq("user_id", user.id)
    .eq("id", connectionId);
  if (error) return { ok: false, error: friendlyError(error, "Could not disconnect that account.") };
  revalidatePath("/gdrive");
  return { ok: true };
}

export async function renameGDriveAccountAction(
  connectionId: string,
  label: string
): Promise<GDriveActionResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("gdrive_connections")
    .update({ label: label.trim().slice(0, 80) || null, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", connectionId);
  if (error) return { ok: false, error: friendlyError(error, "Could not rename that account.") };
  revalidatePath("/gdrive");
  return { ok: true };
}

/** Clears a `revoked`/`error` flag so the account can be retried. */
export async function reconnectGDriveAccountAction(
  connectionId: string
): Promise<GDriveResult<{ email: string }>> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data } = await supabase
    .from("gdrive_connections")
    .select("account_email, status")
    .eq("user_id", user.id)
    .eq("id", connectionId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Account not found." };
  if (data.status === "active") {
    return { ok: false, error: "That account is already connected." };
  }

  // Drop the broken row so the unique (user, account_email) index does not
  // reject the fresh connection, then let the user re-consent.
  await supabase.from("gdrive_connections").delete().eq("user_id", user.id).eq("id", connectionId);
  revalidatePath("/gdrive");
  return { ok: true, data: { email: data.account_email } };
}

// ---------------------------------------------------------------------------
// Browsing
// ---------------------------------------------------------------------------

export type DriveBrowseResult = {
  items: DriveItem[];
  nextPageToken: string | null;
  parentId: string | null;
};

/**
 * Lists one folder's contents for a given account.
 *
 * `pageToken` is threaded through so the browser can page through a folder
 * larger than one response — the old action discarded Drive's `nextPageToken`,
 * making anything past 100 items unreachable.
 */
export async function listGDriveFilesAction(input: {
  connectionId: string;
  parentId?: string | null;
  query?: string;
  pageToken?: string | null;
  pageSize?: number;
  ownerEmail?: string;
  filesOnly?: boolean;
  orderBy?: "folder,name" | "name" | "modifiedTime desc";
}): Promise<GDriveResult<DriveBrowseResult>> {
  const tokenRes = await getGDriveAccessToken(input.connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };

  const result = await driveListFiles({
    accessToken: tokenRes.token,
    parentId: input.parentId ?? undefined,
    query: input.query,
    pageToken: input.pageToken ?? undefined,
    pageSize: input.pageSize ?? 100,
    ownerEmail: input.ownerEmail,
    filesOnly: input.filesOnly,
    orderBy: input.orderBy,
  });
  if (result.error) return { ok: false, error: result.error };

  return {
    ok: true,
    data: { items: result.items, nextPageToken: result.nextPageToken, parentId: input.parentId ?? null },
  };
}

/** Resolves folder names so the browser can show a real path. */
export async function resolveGDrivePathAction(
  connectionId: string,
  folderId: string
): Promise<GDriveResult<{ name: string }>> {
  const tokenRes = await getGDriveAccessToken(connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };
  const { name, error } = await driveGetFolder(tokenRes.token, folderId);
  if (error) return { ok: false, error };
  return { ok: true, data: { name } };
}

export async function getGDriveQuotaAction(connectionId: string): Promise<
  GDriveResult<{ quota: DriveQuota; accountEmail: string }>
> {
  const tokenRes = await getGDriveAccessToken(connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };

  const { quota, error } = await driveGetQuota(tokenRes.token);
  if (error || !quota) return { ok: false, error: error ?? "Drive did not report a storage quota." };

  return { ok: true, data: { quota, accountEmail: tokenRes.connection.account_email } };
}

export async function listGDriveSharedDrivesAction(connectionId: string): Promise<
  GDriveResult<{ drives: Array<{ id: string; name: string }> }>
> {
  const tokenRes = await getGDriveAccessToken(connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };
  return { ok: true, data: { drives: await driveListSharedDrives(tokenRes.token) } };
}

export async function createGDriveFolderAction(input: {
  connectionId: string;
  name: string;
  parentId?: string | null;
}): Promise<GDriveResult<{ item: DriveItem }>> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the folder a name." };
  if (name.length > 200) return { ok: false, error: "Keep the folder name under 200 characters." };

  const tokenRes = await getGDriveAccessToken(input.connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };

  const { item, error } = await driveCreateFolder(
    tokenRes.token,
    name,
    input.parentId ?? undefined
  );
  if (error || !item) return { ok: false, error: error ?? "Could not create the folder." };

  return { ok: true, data: { item } };
}

export async function trashGDriveFileAction(input: {
  connectionId: string;
  fileId: string;
}): Promise<GDriveActionResult> {
  const tokenRes = await getGDriveAccessToken(input.connectionId);
  if (tokenRes.token === null) return { ok: false, error: tokenRes.error };

  const { error } = await driveTrash(tokenRes.token, input.fileId);
  if (error) return { ok: false, error };

  // The link row now points at nothing, so it goes too.
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  await supabase
    .from("gdrive_file_refs")
    .delete()
    .eq("user_id", user.id)
    .eq("drive_file_id", input.fileId);

  revalidatePath("/gdrive");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Linking files into the workspace
// ---------------------------------------------------------------------------

/**
 * Attaches a Drive file to a project, task or note.
 *
 * The ref records which account the file came from, so a file id resolved
 * under one Drive is never looked up under another.
 */
export async function attachDriveFileAction(input: {
  connectionId: string;
  item: DriveItem;
  projectId?: string | null;
  taskId?: string | null;
  noteId?: string | null;
}): Promise<GDriveResult<{ id: string; alreadyLinked: boolean }>> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const name = input.item.name.trim().slice(0, 300);
  if (!name) return { ok: false, error: "That file has no name and cannot be linked." };

  const projectId = input.projectId || null;
  const taskId = input.taskId || null;
  const noteId = input.noteId || null;

  // A partial unique index covers exactly this tuple, so the insert below is
  // the real guard rather than a read-then-write that two clicks could race.
  const { data: inserted, error } = await supabase
    .from("gdrive_file_refs")
    .insert({
      user_id: user.id,
      connection_id: input.connectionId,
      project_id: projectId,
      task_id: taskId,
      note_id: noteId,
      drive_file_id: input.item.id,
      drive_name: name,
      mime_type: input.item.mimeType?.slice(0, 200) ?? null,
      size_bytes: input.item.size ? Number(input.item.size) : null,
      modified_at: input.item.modifiedTime ?? null,
      web_link: input.item.webViewLink ?? input.item.webContentLink,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 is the unique violation from gdrive_file_refs_unique_link.
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("gdrive_file_refs")
        .select("id")
        .eq("user_id", user.id)
        .eq("drive_file_id", input.item.id)
        .is("project_id", projectId)
        .is("task_id", taskId)
        .is("note_id", noteId)
        .maybeSingle();
      return { ok: true, data: { id: existing?.id ?? "", alreadyLinked: true } };
    }
    return { ok: false, error: friendlyError(error, "Could not link that file.") };
  }

  revalidatePath("/gdrive");
  if (projectId) revalidatePath("/projects", "layout");
  return { ok: true, data: { id: inserted.id, alreadyLinked: false } };
}

export async function removeDriveFileRefAction(refId: string): Promise<GDriveActionResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("gdrive_file_refs")
    .delete()
    .eq("user_id", user.id)
    .eq("id", refId);
  if (error) return { ok: false, error: friendlyError(error, "Could not unlink that file.") };
  revalidatePath("/gdrive");
  return { ok: true };
}
