import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import {
  deriveDeadlineState,
  deriveEventState,
  deriveReminderState,
  daysUntil,
  type AgendaState,
} from "@/lib/dashboard-logic";
import type {
  Activity,
  AppNotification,
  CalendarEvent,
  Reminder,
} from "@/types";

export const getCalendarEvents = cache(
  async (fromIso: string, toIso: string, projectId?: string): Promise<CalendarEvent[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("calendar_events")
      .select("*, project:projects(id, name, color)")
      .eq("user_id", user.id)
      .lte("starts_at", toIso)
      .gte("ends_at", fromIso)
      .order("starts_at", { ascending: true });

    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
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
      .select("*, project:projects(id, name, color)")
      .eq("user_id", user.id)
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(limit);

    if (error || !data) return [];
    return data as CalendarEvent[];
  }
);

export const getReminders = cache(
  async (
    options: { status?: "pending" | "all"; projectId?: string } = {}
  ): Promise<Reminder[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("reminders")
      .select("*, project:projects(id, name, color)")
      .eq("user_id", user.id)
      .order("remind_at", { ascending: true });

    if (options.status === "pending") {
      query = query.in("status", ["pending", "snoozed"]);
    }

    if (options.projectId) query = query.eq("project_id", options.projectId);

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

// ---------------------------------------------------------------------------
// Dashboard: merged agenda
// ---------------------------------------------------------------------------

export type AgendaKind = "reminder" | "event" | "deadline" | "milestone";

export type AgendaItem = {
  id: string;
  kind: AgendaKind;
  title: string;
  /** ISO instant used for ordering and relative-time labels. */
  at: string;
  /** True when the source row is a plain date with no time of day. */
  allDay: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  priority: string | null;
  state: AgendaState;
};

type JoinedProject = { id: string; name: string; color: string | null } | null;

/** End of the UTC day for a YYYY-MM-DD value — how a deadline actually lands. */
function endOfDayIso(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString();
}

/**
 * Reminders, calendar events, task deadlines and milestones merged into one
 * chronologically ordered list for the dashboard's Upcoming panel.
 *
 * Four parallel queries, all bounded by an index and a LIMIT — no N+1, and no
 * rows the panel could not possibly show:
 *   • reminders  — still pending or snoozed (overdue ones deliberately kept,
 *                  since nothing else in the dashboard surfaces them)
 *   • events     — starting from now
 *   • deadlines  — open tasks dated today or later (past-due tasks already
 *                  have their own Overdue section, so they are not repeated)
 *   • milestones — incomplete with a due date
 *
 * Date-only rows sort at the end of their day, so "due today" lands after a
 * 10:00 reminder rather than at midnight.
 */
export const getUpcomingAgenda = cache(
  async (limit = 8): Promise<AgendaItem[]> => {
    const user = await requireUser();
    const supabase = await createClient();
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const [remindersRes, eventsRes, deadlinesRes, milestonesRes] =
      await Promise.all([
        supabase
          .from("reminders")
          .select(
            "id, title, remind_at, status, project_id, project:projects(id, name, color)"
          )
          .eq("user_id", user.id)
          .in("status", ["pending", "snoozed"])
          .order("remind_at", { ascending: true })
          .limit(limit),
        supabase
          .from("calendar_events")
          .select(
            "id, title, starts_at, all_day, project_id, project:projects(id, name, color)"
          )
          .eq("user_id", user.id)
          .gte("starts_at", now.toISOString())
          .order("starts_at", { ascending: true })
          .limit(limit),
        supabase
          .from("tasks")
          .select(
            "id, title, due_date, priority, project_id, project:projects(id, name, color)"
          )
          .eq("user_id", user.id)
          .not("due_date", "is", null)
          .gte("due_date", todayStr)
          .in("status", ["backlog", "todo", "in_progress"])
          .order("due_date", { ascending: true })
          .limit(limit),
        supabase
          .from("milestones")
          .select("id, title, due_date, project_id, project:projects(id, name, color)")
          .eq("user_id", user.id)
          .not("due_date", "is", null)
          .neq("status", "completed")
          .order("due_date", { ascending: true })
          .limit(limit),
      ]);

    const items: AgendaItem[] = [];

    for (const r of (remindersRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      remind_at: string;
      status: string;
      project_id: string | null;
      project: JoinedProject;
    }>) {
      const derived = deriveReminderState(
        { remind_at: r.remind_at, status: r.status },
        now
      );
      items.push({
        id: r.id,
        kind: "reminder",
        title: r.title,
        at: r.remind_at,
        allDay: false,
        projectId: r.project_id,
        projectName: r.project?.name ?? null,
        projectColor: r.project?.color ?? null,
        priority: null,
        state: derived === "done" ? "upcoming" : derived,
      });
    }

    for (const e of (eventsRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      starts_at: string;
      all_day: boolean;
      project_id: string | null;
      project: JoinedProject;
    }>) {
      items.push({
        id: e.id,
        kind: "event",
        title: e.title,
        at: e.starts_at,
        allDay: e.all_day,
        projectId: e.project_id,
        projectName: e.project?.name ?? null,
        projectColor: e.project?.color ?? null,
        priority: null,
        state: deriveEventState({ starts_at: e.starts_at }, now),
      });
    }

    for (const t of (deadlinesRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      due_date: string;
      priority: string;
      project_id: string | null;
      project: JoinedProject;
    }>) {
      items.push({
        id: t.id,
        kind: "deadline",
        title: t.title,
        at: endOfDayIso(t.due_date),
        allDay: true,
        projectId: t.project_id,
        projectName: t.project?.name ?? null,
        projectColor: t.project?.color ?? null,
        priority: t.priority,
        state: deriveDeadlineState(daysUntil(t.due_date, now)),
      });
    }

    for (const m of (milestonesRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      due_date: string;
      project_id: string | null;
      project: JoinedProject;
    }>) {
      items.push({
        id: m.id,
        kind: "milestone",
        title: m.title,
        at: endOfDayIso(m.due_date),
        allDay: true,
        projectId: m.project_id,
        projectName: m.project?.name ?? null,
        projectColor: m.project?.color ?? null,
        priority: null,
        state: deriveDeadlineState(daysUntil(m.due_date, now)),
      });
    }

    return items
      .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
      .slice(0, limit);
  }
);