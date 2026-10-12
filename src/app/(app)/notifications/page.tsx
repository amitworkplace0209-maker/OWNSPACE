import { requireUser } from "@/lib/dal";
import { getNotificationCenterData } from "@/lib/dal/notifications";
import { createClient } from "@/lib/supabase/server";
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace";
import { isPushConfigured } from "@/lib/push/vapid";
import type { NotificationType } from "@/types";

export const metadata = {
  title: "Notifications",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const filter = params.filter === "unread" || params.filter === "read" ? params.filter : "all";
  const type = ["reminder", "task", "project", "system"].includes(params.type ?? "")
    ? (params.type as "reminder" | "task" | "project" | "system")
    : "all";

  const [{ notifications, unreadCount, totalCount }, devices] = await Promise.all([
    getNotificationCenterData({ filter, type, limit: 100 }),
    listDevices(user.id),
  ]);

  return (
    <NotificationsWorkspace
      notifications={notifications}
      filter={filter}
      type={type as NotificationType | "all"}
      unreadCount={unreadCount}
      totalCount={totalCount}
      devices={devices}
      pushConfigured={isPushConfigured()}
    />
  );
}

/**
 * Push devices for this account.
 *
 * Read here rather than through the client action because the panel needs them
 * on first paint — a device list that only appears after a client round trip
 * makes the page look like it has no devices at all.
 *
 * Renders as an empty list if the table is not there yet, so a deploy that
 * outruns `db:migrate` degrades to "no push configured" rather than a 500.
 */
async function listDevices(userId: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, label, user_agent, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    return (data ?? []).map((row) => ({
      id: row.id as string,
      endpoint: row.endpoint as string,
      // Only the host is shown: the full endpoint is an opaque delivery address
      // and putting it on screen helps nobody.
      host: hostOf(row.endpoint as string),
      label: (row.label as string | null) ?? null,
      userAgent: (row.user_agent as string | null) ?? null,
      createdAt: row.created_at as string,
      lastUsedAt: (row.last_used_at as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "Unknown device";
  }
}