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

  const ownerTables = [
    "projects",
    "project_phases",
    "milestones",
    "tasks",
    "task_dependencies",
    "task_comments",
    "checklists",
    "checklist_items",
    "notes",
    "note_versions",
    "note_tags",
    "daily_notes",
    "planning_entries",
    "wiki_pages",
    "wiki_versions",
    "wiki_tags",
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
    "finance_categories",
    "finance_transactions",
    "gdrive_file_refs",
  ] as const;

  const out: Record<string, unknown> = { user_id: user.id, exported_at: new Date().toISOString() };

  for (const table of ownerTables) {
    const { data, error } = await supabase.from(table).select("*").eq("user_id", user.id);
    if (error) {
      // Tag/activity/junction tables may legitimately be empty; keep going.
      if ((error.code ?? "").startsWith("42")) continue;
      out[table] = `__error:${error.message}`;
    } else {
      out[table] = data;
    }
  }

  // profiles is keyed by id (not user_id).
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (profile) out.profiles = profile;

  // user_preferences is keyed by user_id, not id.
  const { data: prefs } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
  if (prefs) out.user_preferences = prefs;

  // gdrive_connections is keyed by user_id, but redact OAuth tokens (secrets).
  const { data: conn } = await supabase
    .from("gdrive_connections")
    .select("user_id, email, scope, connected_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (conn) out.gdrive_connections = conn;

  return { json: JSON.stringify(out, null, 2) };
}
