import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError } from "@/lib/actions/helpers";
import { createNotification } from "@/lib/activity";
import { fireTime, nextOccurrence } from "@/lib/reminder-logic";
import { sendPushToUser } from "@/lib/push/send";
import type { ReminderRepeat } from "@/types";

/**
 * The due-reminder sweep, shared by the signed-in server action and the cron
 * route. Both need exactly the same rules: a reminder fires once per occurrence,
 * honours its channels, and moves forward only after it has fired.
 */
export const DUE_REMINDER_HORIZON_MS = 30 * 24 * 60 * 60_000;

type DueReminder = {
  id: string;
  title: string | null;
  description: string | null;
  project_id: string | null;
  remind_at: string;
  priority: string | null;
  is_enabled: boolean;
  advance_minutes: number | null;
  repeat_rule: string | null;
  repeat_interval: number | null;
  repeat_until: string | null;
  repeat_days: number[] | string[] | null;
  notification_channels: string[] | null;
};

export type DueSweepResult = { error?: string; count: number };

export async function processDueRemindersForUser({
  supabase,
  userId,
  now = new Date(),
}: {
  supabase: SupabaseClient;
  userId: string;
  now?: Date;
}): Promise<DueSweepResult> {
  const horizon = new Date(now.getTime() + DUE_REMINDER_HORIZON_MS).toISOString();

  const { data: candidates, error: fetchErr } = await supabase
    .from("reminders")
    .select(
      "id, title, description, project_id, remind_at, status, priority, is_enabled, advance_minutes, repeat_rule, repeat_interval, repeat_until, repeat_days, notification_channels"
    )
    .eq("user_id", userId)
    .eq("status", "pending")
    .eq("is_enabled", true)
    .lte("remind_at", horizon)
    .order("remind_at", { ascending: true })
    .limit(200);

  if (fetchErr) {
    return { error: friendlyError(fetchErr, "Could not fetch reminders."), count: 0 };
  }

  let fired = 0;

  for (const row of candidates ?? []) {
    const reminder = row as DueReminder;
    if (fireTime({ remind_at: reminder.remind_at, advance_minutes: reminder.advance_minutes ?? 0 }).getTime() > now.getTime()) {
      continue;
    }

    const channels = reminder.notification_channels ?? [];
    const wantsInApp = channels.length === 0 || channels.includes("in_app");
    const wantsPush =
      channels.length === 0 ||
      channels.includes("browser") ||
      channels.includes("push");

    if (wantsInApp) {
      await createNotification(
        {
          userId,
          type: "reminder",
          title: reminder.title ?? "Reminder",
          body: reminder.description ?? null,
        },
        supabase
      );
    }

    if (wantsPush) {
      await pushDueReminder({
        supabase,
        userId,
        payload: {
          title: reminder.title ?? "Reminder",
          body: reminder.description ?? null,
          tag: `reminder-${reminder.id}`,
          url: reminder.project_id
            ? `/projects/${reminder.project_id}/reminders`
            : "/reminders",
          type: "reminder",
          entityId: reminder.id,
          renotify: true,
          actions: [
            { action: "complete", title: "Done" },
            { action: "snooze", title: "Snooze 10m" },
          ],
        },
      });
    }

    const next = nextOccurrence(reminder.remind_at, {
      repeat_rule: (reminder.repeat_rule ?? "none") as ReminderRepeat,
      repeat_interval: reminder.repeat_interval,
      repeat_until: reminder.repeat_until,
      repeat_days: Array.isArray(reminder.repeat_days)
        ? reminder.repeat_days.map(Number).filter(Number.isInteger)
        : undefined,
    });

    if (next) {
      await supabase
        .from("reminders")
        .update({ status: "pending", remind_at: next, snoozed_until: null })
        .eq("user_id", userId)
        .eq("id", reminder.id);
    } else {
      await supabase
        .from("reminders")
        .update({ status: "triggered", snoozed_until: null })
        .eq("user_id", userId)
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

async function pushDueReminder({
  supabase,
  userId,
  payload,
}: {
  supabase: SupabaseClient;
  userId: string;
  payload: {
    title: string;
    body?: string | null;
    tag?: string;
    url?: string;
    type?: string;
    entityId?: string;
    renotify?: boolean;
    actions?: Array<{ action: string; title: string }>;
  };
}): Promise<void> {
  try {
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    const subscriptions = (data ?? []) as Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
    if (subscriptions.length === 0) return;

    const { dead } = await sendPushToUser(subscriptions, payload);
    if (dead.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .in("id", dead);
    }
  } catch {
    // Push is an enhancement: one bad device must never stop the sweep.
  }
}
