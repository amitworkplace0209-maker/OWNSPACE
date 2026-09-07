"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { createNotification } from "@/lib/activity";

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
  return {};
}

/**
 * Processes reminders whose remind_at has passed and turns them into
 * notifications. Called from the dashboard on page load as a best-effort
 * sweep; repeated calls are safe (idempotent per reminder via status change).
 */
export async function processDueRemindersAction(): Promise<{ error?: string; count: number }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: due, error: fetchErr } = await supabase
    .from("reminders")
    .select("id, title")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .lte("remind_at", now);
  if (fetchErr) return { error: friendlyError(fetchErr, "Could not fetch reminders."), count: 0 };

  for (const reminder of due ?? []) {
    await supabase
      .from("reminders")
      .update({ status: "triggered" })
      .eq("user_id", user.id)
      .eq("id", reminder.id);

    await createNotification({
      userId: user.id,
      type: "reminder",
      title: reminder.title ?? "Reminder",
    });
  }

  revalidatePath("/reminders");
  revalidatePath("/activity");
  return { count: due?.length ?? 0 };
}