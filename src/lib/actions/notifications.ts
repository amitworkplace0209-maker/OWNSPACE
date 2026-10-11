"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { createNotification } from "@/lib/activity";
import { fireTime, nextOccurrence } from "@/lib/reminder-logic";

export async function markNotificationReadAction(
  notificationId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("id", notificationId);
  if (error) return { error: friendlyError(error, "Could not update notification.") };
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return {};
}

export async function markNotificationUnreadAction(
  notificationId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: null })
    .eq("user_id", user.id)
    .eq("id", notificationId);
  if (error) return { error: friendlyError(error, "Could not update notification.") };
  revalidatePath("/notifications");
  return {};
}

export async function markNotificationsReadAction(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) return { error: friendlyError(error, "Could not update notifications.") };
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return {};
}

export async function deleteNotificationsAction(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) return { error: friendlyError(error, "Could not delete notifications.") };
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return {};
}

export async function clearReadNotificationsAction(): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id)
    .not("read_at", "is", null);
  if (error) return { error: friendlyError(error, "Could not clear notifications.") };
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteNotificationAction(
  notificationId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id)
    .eq("id", notificationId);
  if (error) return { error: friendlyError(error, "Could not delete notification.") };
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
  return {};
}

export async function markAllNotificationsReadAction(): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
  if (error) return { error: friendlyError(error, "Could not update notifications.") };
  revalidatePath("/activity");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return {};
}

/**
 * Fires reminders whose time has come and turns them into notifications.
 *
 * Called from the dashboard on page load as a best-effort sweep.
 *
 * The scheduling columns migration 017 added are honoured here rather than in
 * the UI only:
 *   - `is_enabled`     muted reminders never fire;
 *   - `advance_minutes` a reminder with a 1-hour heads-up fires an hour early;
 *   - `repeat_rule`    a repeating reminder is pushed to its next occurrence
 *                      instead of being marked done;
 *   - `notification_channels` a reminder set to email/push only does not spam
 *                      the in-app feed.
 *
 * Idempotent per occurrence: a reminder only fires again once its status goes
 * back to `pending`, which only happens on the next scheduled occurrence.
 */
export async function processDueRemindersAction(): Promise<{ error?: string; count: number }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const now = new Date();

  // Pull a window wide enough for the longest possible advance notice rather
  // than only what is already due, so advance_minutes has something to match.
  // 30 days matches the wizard's own upper bound on advance_minutes.
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString();

  const { data: candidates, error: fetchErr } = await supabase
    .from("reminders")
    .select(
      "id, title, description, remind_at, status, priority, is_enabled, advance_minutes, repeat_rule, repeat_interval, repeat_until, repeat_days, notification_channels"
    )
    .eq("user_id", user.id)
    .eq("status", "pending")
    .eq("is_enabled", true)
    .lte("remind_at", horizon)
    .order("remind_at", { ascending: true })
    .limit(200);
  if (fetchErr) {
    return { error: friendlyError(fetchErr, "Could not fetch reminders."), count: 0 };
  }

  let fired = 0;

  for (const reminder of candidates ?? []) {
    const firesAt = fireTime({
      remind_at: reminder.remind_at,
      advance_minutes: reminder.advance_minutes ?? 0,
    });
    if (firesAt.getTime() > now.getTime()) continue;

    // `in_app` is the only channel the app can actually deliver; a reminder
    // that opted out of it should not land in the notification feed.
    const channels = reminder.notification_channels ?? ["in_app"];
    const wantsInApp = channels.length === 0 || channels.includes("in_app");

    if (wantsInApp) {
      await createNotification({
        userId: user.id,
        type: "reminder",
        title: reminder.title ?? "Reminder",
        body: reminder.description ?? null,
      });
    }

    // Roll forward to the next occurrence instead of finishing, so a daily
    // reminder keeps reminding. `repeat_until` (or an unset rule) ends it.
    const next = nextOccurrence(reminder.remind_at, {
      repeat_rule: reminder.repeat_rule,
      repeat_interval: reminder.repeat_interval,
      repeat_until: reminder.repeat_until,
      repeat_days: reminder.repeat_days,
    });

    if (next) {
      await supabase
        .from("reminders")
        .update({ status: "pending", remind_at: next, snoozed_until: null })
        .eq("user_id", user.id)
        .eq("id", reminder.id);
    } else {
      await supabase
        .from("reminders")
        .update({ status: "triggered", snoozed_until: null })
        .eq("user_id", user.id)
        .eq("id", reminder.id);
    }

    fired += 1;
  }

  revalidatePath("/reminders");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/activity");
  return { count: fired };
}