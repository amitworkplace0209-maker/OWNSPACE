import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { AppNotification, NotificationType } from "@/types";

export type NotificationFilter = "all" | "unread" | "read";

export type NotificationCenterData = {
  notifications: AppNotification[];
  unreadCount: number;
  readCount: number;
  totalCount: number;
};

/**
 * Backs the notification center page. Returns the requested slice plus the
 * counts needed to render the All / Unread / Read tabs.
 */
export const getNotificationCenterData = cache(
  async (
    options: { filter?: NotificationFilter; type?: NotificationType | "all"; limit?: number } = {}
  ): Promise<NotificationCenterData> => {
    const user = await requireUser();
    const supabase = await createClient();

    const filter = options.filter ?? "all";
    const type = options.type ?? "all";
    const limit = options.limit ?? 60;

    const base = supabase.from("notifications").select("*").eq("user_id", user.id);

    let query = base;
    if (filter === "unread") query = query.is("read_at", null);
    if (filter === "read") query = query.not("read_at", "is", null);
    if (type !== "all") query = query.eq("type", type);

    const [{ data: notifications }, { count: unread }, { count: read }, { count: total }] =
      await Promise.all([
        query.order("created_at", { ascending: false }).limit(limit),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .is("read_at", null),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .not("read_at", "is", null),
        supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);

    return {
      notifications: (notifications ?? []) as AppNotification[],
      unreadCount: unread ?? 0,
      readCount: read ?? 0,
      totalCount: total ?? 0,
    };
  }
);