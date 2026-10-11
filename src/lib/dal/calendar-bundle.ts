import "server-only";

import { cache } from "react";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent, Reminder } from "@/types";

/**
 * Everything that can appear on a calendar, in one shape.
 *
 * The calendar used to read only `calendar_events`, so a task with a due date or
 * a reminder never showed up on it — the two halves of the app disagreed about
 * what "this week" means. Every source is now projected onto the same shape
 * client-side, which also means the month, week, day and agenda views all read
 * from one list instead of each re-querying.
 */

export type CalendarSource = "event" | "task" | "reminder" | "milestone";

export type CalendarItem = {
  id: string;
  /** Stable key across sources: `${source}:${id}`. */
  key: string;
  source: CalendarSource;
  title: string;
  /** `YYYY-MM-DD` in the viewer's local timezone. */
  date: string;
  /** Minutes from midnight, or null for all-day. */
  startMinutes: number | null;
  endMinutes: number | null;
  allDay: boolean;
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  color: string | null;
  /** Only meaningful for tasks and milestones. */
  status: string | null;
  href: string | null;
  location?: string | null;
};

/** Local `YYYY-MM-DD` — the same basis the date inputs and `date` columns use. */
function localDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function minutesOfDay(value: Date): number {
  return value.getHours() * 60 + value.getMinutes();
}

export type CalendarBundle = {
  items: CalendarItem[];
  stats: {
    total: number;
    today: number;
    thisWeek: number;
    overdue: number;
    allDay: number;
    bySource: Record<CalendarSource, number>;
  };
};

export const getCalendarBundle = cache(
  async (fromIso: string, toIso: string, todayIso: string): Promise<CalendarBundle> => {
    const user = await requireUser();
    const supabase = await createClient();

    const [eventsRes, tasksRes, remindersRes, milestonesRes] = await Promise.all([
      supabase
        .from("calendar_events")
        .select(
          "id, title, starts_at, ends_at, all_day, color, location, project_id, event_type, project:projects(id, name, color)"
        )
        .eq("user_id", user.id)
        .lte("starts_at", toIso)
        .gte("ends_at", fromIso)
        .order("starts_at", { ascending: true }),

      supabase
        .from("tasks")
        .select("id, title, due_date, status, priority, project_id, project:projects(id, name, color)")
        .eq("user_id", user.id)
        .not("due_date", "is", null)
        .gte("due_date", fromIso.slice(0, 10))
        .lte("due_date", toIso.slice(0, 10)),

      supabase
        .from("reminders")
        .select(
          "id, title, remind_at, status, priority, is_enabled, project_id, task_id, project:projects(id, name, color)"
        )
        .eq("user_id", user.id)
        .gte("remind_at", fromIso)
        .lte("remind_at", toIso)
        .order("remind_at", { ascending: true }),

      supabase
        .from("milestones")
        .select("id, title, due_date, status, project_id, project:projects(id, name, color)")
        .eq("user_id", user.id)
        .not("due_date", "is", null)
        .gte("due_date", fromIso.slice(0, 10))
        .lte("due_date", toIso.slice(0, 10)),
    ]);

    const items: CalendarItem[] = [];

    // --- Events -----------------------------------------------------------
    for (const row of (eventsRes.data ?? []) as unknown as Array<
      CalendarEvent & { project: { id: string; name: string; color: string | null } | null }
    >) {
      const start = new Date(row.starts_at);
      const end = row.ends_at ? new Date(row.ends_at) : null;
      const project = Array.isArray(row.project) ? row.project[0] : row.project;

      items.push({
        id: row.id,
        key: `event:${row.id}`,
        source: "event",
        title: row.title,
        date: localDate(start),
        startMinutes: row.all_day ? null : minutesOfDay(start),
        endMinutes: row.all_day || !end ? null : minutesOfDay(end),
        allDay: Boolean(row.all_day),
        projectId: row.project_id ?? null,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
        color: row.color ?? null,
        status: null,
        href: null,
        location: row.location,
      });
    }

    // --- Task deadlines ---------------------------------------------------
    for (const row of (tasksRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      due_date: string;
      status: string;
      project_id: string;
      project: { id: string; name: string; color: string | null } | null;
    }>) {
      const project = Array.isArray(row.project) ? row.project[0] : row.project;
      items.push({
        id: row.id,
        key: `task:${row.id}`,
        source: "task",
        title: row.title,
        date: row.due_date,
        startMinutes: null,
        endMinutes: null,
        // An open task with a date behaves like an all-day marker, not a
        // timed slot — there is no honest time to invent for a deadline.
        allDay: true,
        projectId: row.project_id ?? null,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
        color: null,
        status: row.status,
        href: `/tasks/${row.id}`,
      });
    }

    // --- Reminders --------------------------------------------------------
    for (const row of (remindersRes.data ?? []) as unknown as Array<
      Reminder & { project: { id: string; name: string; color: string | null } | null }
    >) {
      const at = new Date(row.remind_at);
      const project = Array.isArray(row.project) ? row.project[0] : row.project;

      items.push({
        id: row.id,
        key: `reminder:${row.id}`,
        source: "reminder",
        title: row.title,
        date: localDate(at),
        startMinutes: minutesOfDay(at),
        endMinutes: null,
        allDay: false,
        projectId: row.project_id ?? null,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
        color: null,
        // A disabled or already-dismissed reminder is history, not a plan.
        status: row.is_enabled === false ? "disabled" : row.status,
        href: row.task_id ? `/tasks/${row.task_id}` : null,
      });
    }

    // --- Milestones -------------------------------------------------------
    for (const row of (milestonesRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      due_date: string;
      status: string;
      project_id: string;
      project: { id: string; name: string; color: string | null } | null;
    }>) {
      const project = Array.isArray(row.project) ? row.project[0] : row.project;
      items.push({
        id: row.id,
        key: `milestone:${row.id}`,
        source: "milestone",
        title: row.title,
        date: row.due_date,
        startMinutes: null,
        endMinutes: null,
        allDay: true,
        projectId: row.project_id ?? null,
        projectName: project?.name ?? null,
        projectColor: project?.color ?? null,
        color: null,
        status: row.status,
        href: null,
      });
    }

    // --- Headline counts --------------------------------------------------
    const weekStart = (() => {
      const date = new Date(`${todayIso}T00:00:00`);
      const start = new Date(date);
      start.setDate(date.getDate() - date.getDay());
      return localDate(start);
    })();
    const weekEndDate = new Date(`${weekStart}T00:00:00`);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = localDate(weekEndDate);

    const bySource: Record<CalendarSource, number> = {
      event: 0,
      task: 0,
      reminder: 0,
      milestone: 0,
    };

    let today = 0;
    let thisWeek = 0;
    let overdue = 0;
    let allDay = 0;

    for (const item of items) {
      bySource[item.source] += 1;
      if (item.date === todayIso) today += 1;
      if (item.date >= weekStart && item.date <= weekEnd) thisWeek += 1;
      if (item.date < todayIso && item.status !== "done" && item.status !== "completed") {
        overdue += 1;
      }
      if (item.allDay) allDay += 1;
    }

    return {
      items,
      stats: {
        total: items.length,
        today,
        thisWeek,
        overdue,
        allDay,
        bySource,
      },
    };
  }
);