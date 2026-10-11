import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { ResourceItem, ResourceKind } from "@/lib/resources-logic";

type FileRow = {
  id: string;
  project_id: string | null;
  task_id: string | null;
  name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
  project: { id: string; name: string; color: string | null } | null;
  task: { id: string; title: string } | null;
};

type DriveRow = {
  id: string;
  connection_id: string | null;
  project_id: string | null;
  task_id: string | null;
  note_id: string | null;
  drive_file_id: string;
  drive_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  web_link: string | null;
  created_at: string;
  connection: { account_email: string | null } | null;
  project: { id: string; name: string; color: string | null } | null;
  task: { id: string; title: string } | null;
  note: { id: string; title: string } | null;
};

type LinkRow = {
  id: string;
  project_id: string | null;
  node_id: string | null;
  resource_type: string;
  name: string;
  description: string | null;
  url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  tags: string[] | null;
  created_at: string;
  project: { id: string; name: string; color: string | null } | null;
};

/**
 * Every attachment in the workspace, as one list.
 *
 * Three tables describe three different things and they are kept separate on
 * purpose — a Supabase blob, a Drive reference and a bare URL have different
 * lifecycles and different delete semantics. This read model flattens them into
 * one shape for the Resources page; it does not merge them, and each item keeps
 * the `source` it came from so a delete knows which table to talk to.
 *
 * A resource whose `storage_path` points at a real Supabase object is reported
 * as a stored file even though the row lives in `project_resources`; the wizard
 * writes it that way, and a user should not have to care which table it landed
 * in.
 */
export const getAllResources = cache(
  async (options: { limit?: number } = {}): Promise<ResourceItem[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const [filesRes, driveRes, linksRes] = await Promise.all([
      supabase
        .from("files")
        .select(
          "id, project_id, task_id, name, storage_path, mime_type, size_bytes, created_at, project:projects(id, name, color), task:tasks(id, title)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("gdrive_file_refs")
        .select(
          "id, connection_id, project_id, task_id, note_id, drive_file_id, drive_name, mime_type, size_bytes, web_link, created_at, connection:gdrive_connections(account_email), project:projects(id, name, color), task:tasks(id, title), note:notes(id, title)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_resources")
        .select(
          "id, project_id, node_id, resource_type, name, description, url, storage_path, mime_type, size_bytes, tags, created_at, project:projects(id, name, color)"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    const items: ResourceItem[] = [];

    for (const row of (filesRes.data ?? []) as unknown as FileRow[]) {
      items.push({
        key: `supabase:${row.id}`,
        source: "supabase",
        id: row.id,
        kind: "supabase_file",
        name: row.name,
        description: null,
        url: null,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        projectId: row.project_id,
        projectName: row.project?.name ?? null,
        projectColor: row.project?.color ?? null,
        taskId: row.task_id,
        taskTitle: row.task?.title ?? null,
        noteId: null,
        noteTitle: null,
        accountEmail: null,
        tags: [],
        createdAt: row.created_at,
      });
    }

    for (const row of (driveRes.data ?? []) as unknown as DriveRow[]) {
      items.push({
        key: `drive:${row.id}`,
        source: "drive",
        id: row.id,
        kind: "google_drive",
        name: row.drive_name,
        description: null,
        url: row.web_link,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        projectId: row.project_id,
        projectName: row.project?.name ?? null,
        projectColor: row.project?.color ?? null,
        taskId: row.task_id,
        taskTitle: row.task?.title ?? null,
        noteId: row.note_id,
        noteTitle: row.note?.title ?? null,
        accountEmail: row.connection?.account_email ?? null,
        tags: [],
        createdAt: row.created_at,
      });
    }

    for (const row of (linksRes.data ?? []) as unknown as LinkRow[]) {
      // A project_resources row with a storage_path is a real stored object the
      // wizard uploaded, not a link, so it is classified by what it points at.
      const kind = classifyLinkKind(
        row.resource_type as ResourceKind,
        Boolean(row.storage_path)
      );
      items.push({
        key: `link:${row.id}`,
        source: kind === "google_drive" ? "drive" : kindNeedsStorage(row.resource_type as ResourceKind) ? "supabase" : "link",
        id: row.id,
        kind,
        name: row.name,
        description: row.description,
        url: row.url,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        projectId: row.project_id,
        projectName: row.project?.name ?? null,
        projectColor: row.project?.color ?? null,
        taskId: null,
        taskTitle: null,
        noteId: null,
        noteTitle: null,
        accountEmail: null,
        tags: row.tags ?? [],
        createdAt: row.created_at,
      });
    }

    // Newest first is the order every one of those three queries already used,
    // so one stable sort keeps the merged list honest.
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return options.limit ? items.slice(0, options.limit) : items;
  }
);

function classifyLinkKind(type: ResourceKind, hasStorage: boolean): ResourceKind {
  if (type === "google_drive") return "google_drive";
  if (hasStorage) return "supabase_file";
  return type;
}

function kindNeedsStorage(type: ResourceKind): boolean {
  return type === "file" || type === "supabase_file";
}

/** Projects and tasks a resource can be attached to, for the form's selects. */
export const getResourceTargets = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();

  const [projectsRes, tasksRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, color")
      .eq("user_id", user.id)
      .neq("status", "archived")
      .order("name", { ascending: true }),
    supabase
      .from("tasks")
      .select("id, title, project_id")
      .eq("user_id", user.id)
      .in("status", ["backlog", "todo", "in_progress"])
      .order("updated_at", { ascending: false })
      .limit(300),
  ]);

  return {
    projects: (projectsRes.data ?? []) as Array<{
      id: string;
      name: string;
      color: string | null;
    }>,
    tasks: (tasksRes.data ?? []) as Array<{
      id: string;
      title: string;
      project_id: string | null;
    }>,
  };
});
