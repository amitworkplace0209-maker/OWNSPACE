"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { processDueRemindersForUser } from "@/lib/notifications/due-reminders";

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

/**
 * Deletes every notification, read or not.
 *
 * Scoped by `user_id` from the session, never by anything the caller sends, so a
 * crafted request cannot reach another account's rows. RLS would stop it
 * regardless; the filter is here so the intent is readable.
 *
 * Unlike `clearReadNotificationsAction`, unread rows go too — so the caller has
 * to state the count it is about to destroy, and the UI has to ask first.
 */
export async function clearAllNotificationsAction(): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("user_id", user.id);
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
 * Signed-in entry point for the due-reminder sweep.
 *
 * The dashboard and reminder notifier call this while the app is open. The cron
 * route calls the same shared core with an admin client, so the two paths can
 * never drift apart on channels, repeats or idempotency.
 */
export async function processDueRemindersAction(): Promise<{ error?: string; count: number }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  return processDueRemindersForUser({ supabase, userId: user.id });
}