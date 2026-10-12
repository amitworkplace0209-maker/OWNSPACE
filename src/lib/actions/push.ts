"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { isPushConfigured } from "@/lib/push/vapid";

/**
 * Web push device management.
 *
 * A "device" here is one browser profile's push subscription. Signing in on a
 * phone and a laptop produces two rows, and each is pushed to independently —
 * which is what makes the per-device notification settings on the reminders page
 * mean something rather than being account-wide decoration.
 */

export type PushDevice = {
  id: string;
  endpoint: string;
  /** Short, human-recognisable host, so a user can tell their devices apart. */
  host: string;
  label: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

export type PushSupport = {
  configured: boolean;
  supported: boolean;
  devices: PushDevice[];
};

/**
 * Everything the notifications page needs to describe the device honestly.
 *
 * `configured` and `supported` are separate on purpose: an unconfigured server
 * and an unsupported browser need different words in the UI, and telling them
 * apart is what stops the page offering a button that cannot work.
 */
export async function getPushSupportAction(): Promise<PushSupport> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, label, user_agent, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return {
    configured: isPushConfigured(),
    supported: true,
    devices: (data ?? []).map((row) => ({
      id: row.id as string,
      endpoint: row.endpoint as string,
      host: hostOf(row.endpoint as string),
      label: (row.label as string | null) ?? null,
      userAgent: (row.user_agent as string | null) ?? null,
      createdAt: row.created_at as string,
      lastUsedAt: (row.last_used_at as string | null) ?? null,
    })),
  };
}

/** Strips the opaque path so the list shows a recognisable host, not a token. */
function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "Unknown device";
  }
}

export async function registerPushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string | null;
  userAgent?: string | null;
}): Promise<{ error?: string; id?: string }> {
  const user = await getUserOrRedirect();

  if (!isPushConfigured()) {
    return { error: "Push is not configured on this server." };
  }
  if (!input.endpoint || !input.p256dh || !input.auth) {
    return { error: "That subscription was incomplete." };
  }

  const supabase = await createClient();

  // Upsert on `endpoint`: re-subscribing the same browser (after a permission
  // change, or the worker being replaced) must update the existing row rather
  // than accumulate dead ones that each cost a push attempt.
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        label: input.label ?? null,
        user_agent: input.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    )
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not register this device.") };
  }

  revalidatePath("/notifications");
  return { id: data.id as string };
}

/** Removes one device. Used when a permission is revoked or a device is lost. */
export async function removePushSubscriptionAction(endpoint: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", endpoint);

  if (error) return { error: friendlyError(error, "Could not remove this device.") };

  revalidatePath("/notifications");
  return {};
}

/** Removes every device for the account — used on sign-out from another tab. */
export async function removeAllPushSubscriptionsAction(): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (error) return { error: friendlyError(error, "Could not remove your devices.") };

  revalidatePath("/notifications");
  return {};
}

/**
 * Deletes subscriptions the push service has declared dead.
 *
 * Called after a fan-out returns 404/410. A revoked permission or an uninstalled
 * app never recovers, so retrying would waste a request on every send forever.
 */
export async function pruneDeadSubscriptionsAction(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .in("id", ids);

  if (error) return { error: friendlyError(error, "Could not clean up dead devices.") };
  return {};
}