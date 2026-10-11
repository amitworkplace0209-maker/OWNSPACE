import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";

export type WorkspaceStats = {
  projects: { total: number; active: number; onHold: number; completed: number; archived: number };
  tasks: { total: number; pending: number; done: number };
  notes: number;
  dailyNotes: number;
  files: number;
  storageUsedBytes: number;
};

/**
 * Aggregate counts across the whole workspace, used by the dashboard and the
 * storage / lab pages. All values come from real data.
 */
export const getWorkspaceStats = cache(async (): Promise<WorkspaceStats> => {
  const user = await requireUser();
  const supabase = await createClient();

  const empty: WorkspaceStats = {
    projects: { total: 0, active: 0, onHold: 0, completed: 0, archived: 0 },
    tasks: { total: 0, pending: 0, done: 0 },
    notes: 0,
    dailyNotes: 0,
    files: 0,
    storageUsedBytes: 0,
  };

  const [projectsRes, tasksRes, notesRes, dailyRes, filesRes] = await Promise.all([
    supabase.from("projects").select("status").eq("user_id", user.id),
    supabase.from("tasks").select("status").eq("user_id", user.id),
    supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("daily_notes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase
      .from("files")
      .select("size_bytes", { count: "exact", head: false })
      .eq("user_id", user.id),
  ]);

  const stats: WorkspaceStats = { ...empty };

  for (const p of projectsRes.data ?? []) {
    stats.projects.total += 1;
    if (p.status === "active" || p.status === "on_hold") stats.projects.active += 1;
    if (p.status === "on_hold") stats.projects.onHold += 1;
    if (p.status === "completed") stats.projects.completed += 1;
    if (p.status === "archived") stats.projects.archived += 1;
  }

  for (const t of tasksRes.data ?? []) {
    stats.tasks.total += 1;
    if (t.status === "done" || t.status === "cancelled") stats.tasks.done += 1;
    else stats.tasks.pending += 1;
  }

  stats.notes = notesRes.count ?? 0;
  stats.dailyNotes = dailyRes.count ?? 0;
  stats.files = filesRes.count ?? 0;
  stats.storageUsedBytes = (filesRes.data ?? []).reduce(
    (sum, f) => sum + (f.size_bytes ?? 0),
    0
  );

  return stats;
});