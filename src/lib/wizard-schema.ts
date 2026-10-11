import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Columns migration 017 adds that the project wizard writes to.
 *
 * Used as a preflight so an un-migrated database produces
 * "run npm run db:migrate" instead of a raw
 * `column "title" of relation "projects" does not exist` from the middle of a
 * ten-step insert.
 */
const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: "projects", column: "title" },
  { table: "projects", column: "category" },
  { table: "projects", column: "project_type" },
  { table: "projects", column: "is_favorite" },
  { table: "projects", column: "is_pinned" },
  { table: "projects", column: "timezone" },
  { table: "projects", column: "currency" },
  { table: "projects", column: "budget" },
  { table: "projects", column: "card_style" },
  { table: "projects", column: "details" },
  { table: "projects", column: "options" },
  { table: "project_nodes", column: "notes" },
  { table: "tasks", column: "node_id" },
  { table: "tasks", column: "start_date" },
  { table: "tasks", column: "estimated_minutes" },
  { table: "milestones", column: "node_id" },
  { table: "checklists", column: "parent_checklist_id" },
  { table: "checklists", column: "due_date" },
  { table: "checklists", column: "priority" },
  { table: "checklist_items", column: "parent_item_id" },
  { table: "reminders", column: "repeat_rule" },
  { table: "reminders", column: "notification_channels" },
  { table: "reminders", column: "snooze_minutes" },
  { table: "reminders", column: "advance_minutes" },
  { table: "reminders", column: "is_enabled" },
  { table: "daily_notes", column: "title" },
  { table: "daily_notes", column: "todays_work" },
  { table: "daily_notes", column: "next_steps" },
  { table: "calendar_events", column: "node_id" },
  { table: "finance_transactions", column: "occurred_at" },
  { table: "finance_transactions", column: "reference" },
];

/**
 * Returns a user-facing message when the wizard's schema is not in place, or
 * null when everything the wizard needs exists.
 *
 * Probes with a zero-row select rather than querying `information_schema`,
 * because PostgREST does not expose the catalogue — a "column does not exist"
 * response here is the same signal, from the API the app actually uses.
 *
 * Wrapped in `cache` so the thirty-odd probes run at most once per request,
 * even though the action calls this once and any caller retries do too.
 */
export const wizardSchemaProblem = cache(async (): Promise<string | null> => {
  const supabase = await createClient();

  for (const { table, column } of REQUIRED_COLUMNS) {
    const { error } = await supabase.from(table).select(column).limit(0);
    if (!error) continue;

    if (
      /column .* does not exist/i.test(error.message) ||
      /relation .* does not exist/i.test(error.message)
    ) {
      return `The database is missing \`${table}.${column}\`. Run \`npm run db:migrate\` to apply the project wizard schema, then try again.`;
    }
  }

  return null;
});