import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type {
  Activity,
  AppNotification,
  CalendarEvent,
  Reminder,
} from "@/types";

export const getCalendarEvents = cache(
  async (fromIso: string, toIso: string): Promise<CalendarEvent[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*, project(id, name, color)")
      .eq("user_id", user.id)
      .lte("starts_at", toIso)
      .gte("ends_at", fromIso)
      .order("starts_at", { ascending: true });

    if (error || !data) return [];
    return data as CalendarEvent[];
  }
);

export const getUpcomingEvents = cache(
  async (limit = 6): Promise<CalendarEvent[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("calendar_events")
      .select("*, project(id, name, color)")
      .eq("user_id", user.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as CalendarEvent[];
  }
);

export const getReminders = cache(
  async (options: { status?: "pending" | "all" } = {}): Promise<Reminder[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("reminders")
      .select("*, project(id, name, color)")
      .eq("user_id", user.id)
      .order("remind_at", { ascending: true });

    if (options.status === "pending") {
      query = query.in("status", ["pending", "snoozed"]);
    }

    const { data, error } = await query;
    if (error || !data) return [];
    return data as Reminder[];
  }
);

export const getUpcomingReminders = cache(
  async (limit = 5): Promise<Reminder[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["pending", "snoozed"])
      .gte("remind_at", new Date().toISOString())
      .order("remind_at", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as Reminder[];
  }
);

export const getNotifications = cache(
  async (options: { unreadOnly?: boolean; limit?: number } = {}): Promise<AppNotification[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (options.unreadOnly) query = query.is("read_at", null);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as AppNotification[];
  }
);

export const getUnreadNotificationCount = cache(async (): Promise<number> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
});

export const getRecentActivity = cache(
  async (options: { projectId?: string; limit?: number } = {}): Promise<Activity[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("activities")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as Activity[];
  }
);