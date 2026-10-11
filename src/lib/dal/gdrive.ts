import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { driveGetQuota, getGDriveAccessToken, isGDriveConfigured } from "@/lib/gdrive";
import type { GDriveConnection, GDriveFileRef } from "@/types";

export type GDriveStatus = {
  configured: boolean;
  /** Every account linked, newest first. */
  accounts: GDriveConnection[];
  connected: boolean;
  /** The account the dashboard's one-line status refers to. */
  email: string | null;
  error: string | null;
};

export type GDriveLinkedFile = GDriveFileRef & {
  account_email: string | null;
  connection_id: string | null;
  project_name: string | null;
  task_title: string | null;
  note_title: string | null;
};

/**
 * Every Drive account linked to this user.
 *
 * The old primary key was `user_id`, so there could only ever be one row and
 * connecting a second account overwrote the first. Migration 019 keys on `id`,
 * with one row per (user, Google account).
 */
export const getGDriveConnections = cache(async (): Promise<GDriveConnection[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("gdrive_connections")
    .select("*")
    .eq("user_id", user.id)
    .order("last_connected_at", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data as GDriveConnection[];
});

export const getGDriveStatus = cache(async (): Promise<GDriveStatus> => {
  const accounts = await getGDriveConnections();
  const primary = accounts[0] ?? null;

  if (!isGDriveConfigured()) {
    return {
      configured: false,
      accounts,
      connected: false,
      email: primary?.account_email ?? null,
      error:
        "Google Drive integration is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the environment to enable it.",
    };
  }

  return {
    configured: true,
    accounts,
    connected: accounts.length > 0,
    email: primary?.account_email ?? null,
    error: null,
  };
});

/**
 * Files the user has linked into their workspace.
 *
 * The project/task/note joins used to be selected and then discarded by a
 * blanket cast, so the list could only ever say "Linked to a project" without
 * naming which one. They are flattened into real fields here.
 */
export const getGDriveFileRefs = cache(async (): Promise<GDriveLinkedFile[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("gdrive_file_refs")
    .select(
      "id, user_id, connection_id, project_id, task_id, note_id, drive_file_id, drive_name, mime_type, size_bytes, modified_at, web_link, created_at, updated_at, project:projects(name), task:tasks(title), note:notes(title), connection:gdrive_connections(account_email)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];

  type Row = GDriveFileRef & {
    connection?: { account_email: string | null } | null;
    project?: { name: string | null } | null;
    task?: { title: string | null } | null;
    note?: { title: string | null } | null;
  };

  return (data as unknown as Row[]).map(({ project, task, note, connection, ...ref }) => ({
    ...ref,
    account_email: connection?.account_email ?? null,
    project_name: project?.name ?? null,
    task_title: task?.title ?? null,
    note_title: note?.title ?? null,
  }));
});

export type GDriveLinkSummary = {
  total: number;
  /** Bytes of files linked into the workspace, from Drive's own reported sizes. */
  linkedBytes: number;
  byAccount: Record<string, number>;
  byTarget: { projects: number; tasks: number; notes: number; unlinked: number };
};

/**
 * Linked-file totals, derived from the same rows the list renders rather than
 * a separate aggregate, so the numbers cannot drift from the list.
 */
export function summarizeLinks(files: GDriveLinkedFile[]): GDriveLinkSummary {
  const summary: GDriveLinkSummary = {
    total: files.length,
    linkedBytes: 0,
    byAccount: {},
    byTarget: { projects: 0, tasks: 0, notes: 0, unlinked: 0 },
  };

  for (const file of files) {
    summary.linkedBytes += Number(file.size_bytes ?? 0);

    const account = file.account_email ?? "unknown";
    summary.byAccount[account] = (summary.byAccount[account] ?? 0) + 1;

    if (file.project_id) summary.byTarget.projects += 1;
    else if (file.task_id) summary.byTarget.tasks += 1;
    else if (file.note_id) summary.byTarget.notes += 1;
    else summary.byTarget.unlinked += 1;
  }

  return summary;
}
// ---------------------------------------------------------------------------
// Per-account usage, for the /storage dashboard
// ---------------------------------------------------------------------------

export type DriveAccountUsageRow = {
  connectionId: string;
  email: string;
  label: string | null;
  status: GDriveConnection["status"];
  quotaUsed: number | null;
  quotaLimit: number | null;
  sharedDriveUsed: number | null;
  sharedDriveLimit: number | null;
  linkedBytes: number;
  linkedCount: number;
  error: string | null;
};

/**
 * One row per linked Drive account: what Drive says it is using, and what this
 * workspace has linked out of it.
 *
 * The quota is read here rather than in the browser because the access token
 * must never reach the client. A failure on one account is recorded against
 * that account only — one revoked grant must not blank the whole panel.
 */
export const getDriveAccountUsage = cache(async (): Promise<DriveAccountUsageRow[]> => {
  const accounts = await getGDriveConnections();
  if (accounts.length === 0) return [];

  const links = await getGDriveFileRefs();
  const linkedByAccount = new Map<string, { bytes: number; count: number }>();
  for (const link of links) {
    if (!link.connection_id) continue;
    const entry = linkedByAccount.get(link.connection_id) ?? { bytes: 0, count: 0 };
    entry.bytes += Number(link.size_bytes ?? 0);
    entry.count += 1;
    linkedByAccount.set(link.connection_id, entry);
  }

  return Promise.all(
    accounts.map(async (account): Promise<DriveAccountUsageRow> => {
      const linked = linkedByAccount.get(account.id) ?? { bytes: 0, count: 0 };
      const base: DriveAccountUsageRow = {
        connectionId: account.id,
        email: account.account_email,
        label: account.label,
        status: account.status,
        quotaUsed: null,
        quotaLimit: null,
        sharedDriveUsed: null,
        sharedDriveLimit: null,
        linkedBytes: linked.bytes,
        linkedCount: linked.count,
        error: null,
      };

      if (account.status !== "active") {
        return { ...base, error: account.last_error ?? "Reconnect this account to read its quota." };
      }

      // Called directly rather than through the server action: the data layer
      // should not depend on the action layer, and the token stays server-side
      // either way.
      const tokenResult = await getGDriveAccessToken(account.id);
      if (tokenResult.token === null) return { ...base, error: tokenResult.error };

      const { quota, error } = await driveGetQuota(tokenResult.token);
      if (error || !quota) return { ...base, error: error ?? "Drive did not report a quota." };

      return {
        ...base,
        quotaUsed: quota.used,
        quotaLimit: quota.limit,
        sharedDriveUsed: quota.sharedUsed,
        sharedDriveLimit: quota.sharedLimit,
      };
    })
  );
});
