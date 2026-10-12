"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";

/**
 * Deletes activity history.
 *
 * `keepRecentDays` keeps the most recent slice and removes everything older.
 * That is the option people actually want: the feed is a log, not a workspace,
 * so wiping it entirely throws away the recent trail along with the old clutter
 * — and there is no undo.
 *
 * Scoped by `user_id` from the session rather than anything the caller sends, so
 * this can never reach another account's rows even with a crafted request. RLS
 * would stop it anyway; the filter is there so the intent is readable.
 */
export async function clearActivityHistoryAction(
  options: { keepRecentDays?: number } = {}
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  let query = supabase.from("activities").delete().eq("user_id", user.id);

  const keep = options.keepRecentDays;
  if (typeof keep === "number" && Number.isFinite(keep) && keep > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - Math.trunc(keep));
    // ISO, not a local YYYY-MM-DD: created_at is a timestamptz and a date-only
    // string would be read in UTC, cutting the boundary day in half depending on
    // the user's timezone.
    query = query.lt("created_at", cutoff.toISOString());
  }

  // No `.select()`, so this deletes in one statement rather than fetching the
  // feed back just to count it.
  const { error } = await query;
  if (error) return { error: friendlyError(error, "Could not clear the history.") };

  // The feed is read by the dashboard, the activity page and each project's
  // activity tab, so all of them have to be told.
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/analytics");
  revalidatePath("/projects", "layout");

  return {};
}
