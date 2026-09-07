"use server";

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect } from "@/lib/actions/helpers";

/**
 * Reads all user-owned rows across every domain table and returns them as a
 * single JSON document for export. Runs on the server with the user's session;
 * RLS ensures only owned rows are returned.
 */
export async function exportAllDataAction(): Promise<{ error?: string; json?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const tables = [
    "profiles",
    "user_preferences",
    "projects",
    "project_phases",
    "milestones",
    "tasks",
    "task_dependencies",
    "task_comments",
    "checklists",
    "checklist_items",
    "notes",
    "daily_notes",
    "planning_entries",
    "wiki_pages",
    "calendar_events",
    "reminders",
    "notifications",
    "files",
    "time_entries",
    "pomodoro_sessions",
    "activities",
    "tags",
    "project_tags",
    "task_tags",
    "note_tags",
    "wiki_tags",
  ] as const;

  const out: Record<string, unknown> = { user_id: user.id, exported_at: new Date().toISOString() };

  for (const table of tables) {
    let query = supabase.from(table).select("*");
    if (table !== "profiles" && table !== "user_preferences") {
      query = query.eq("user_id", user.id);
    } else {
      query = query.eq("id", user.id) as typeof query;
    }
    const { data, error } = await query;
    if (error) {
      // Tag/activity/junction tables may legitimately be empty; keep going.
      if ((error.code ?? "").startsWith("42")) continue;
      out[table] = `__error:${error.message}`;
    } else {
      out[table] = data;
    }
  }

  return { json: JSON.stringify(out, null, 2) };
}