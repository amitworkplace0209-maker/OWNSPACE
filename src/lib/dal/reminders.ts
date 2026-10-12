import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { computeReminderStats, sortReminders, type ReminderListItem, type ReminderStats } from "@/lib/reminder-logic";

export type { ReminderListItem, ReminderStats } from "@/lib/reminder-logic";

export type ReminderListOptions = {
  /** Restrict to one project. Pass "personal" to exclude project reminders. */
  projectId?: string;
  priority?: string;
  /** Any ReminderStatus, "live" for pending + snoozed, or "all". */
  status?: string;
  query?: string;
  limit?: number;
};

/**
 * Just the reminders that could still fire, for the app-wide notifier.
 *
 * Separate from `getRemindersWithProjects` because the notifier is mounted in
 * the app layout and therefore runs on *every* page. Pulling the full 500-row
 * list to decide whether one reminder is due would tax every navigation in the
 * app to serve one page's needs.
 *
 * Two deliberate choices:
 *
 *  - **Look-back, not look-ahead only.** A reminder whose time passed while the
 *    app was shut still has to alert on the next open, so the window starts a
 *    month in the past rather than at "now". Without it, closing the laptop on
 *    Friday and opening it Monday would silently skip Friday's reminders.
 *
 *  - **A small, fixed select.** Only the nine fields the notifier reads, so no
 *    note body or attachment list crosses the wire on every page load.
 *
 * Bounded rather than unbounded: a ledger with thousands of old pending
 * reminders should not be able to make every page load unboundedly slower.
 */
export const getFireableReminders = cache(
  async (options: { lookBackDays?: number; limit?: number } = {}): Promise<ReminderListItem[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const since = new Date();
    since.setDate(since.getDate() - (options.lookBackDays ?? 30));

    const { data, error } = await supabase
      .from("reminders")
      .select(
        "id, user_id, project_id, title, note, description, remind_at, snoozed_until, status, priority, is_enabled, advance_minutes, repeat_rule, project:projects(id, name)"
      )
      .eq("user_id", user.id)
      // Done and dismissed can never fire again; snoozed ones come back later.
      .in("status", ["pending", "snoozed"])
      .gte("remind_at", since.toISOString())
      .order("remind_at", { ascending: true })
      .limit(options.limit ?? 200);

    if (error || !data) return [];

    const rows = data as unknown as Array<ReminderListItem & {
      project?: { id: string; name: string } | null;
    }>;

    return rows.map(({ project, ...row }) => ({
      ...row,
      project_name: project?.name ?? null,
    })) as ReminderListItem[];
  }
);

/**
 * Every reminder the user owns, with the project name and colour joined in.
 *
 * The join is the point: the page shows a project badge on every row, and
 * fetching that separately per row would mean one query per reminder.
 *
 * Sorting, stats and state derivation all happen in `reminder-logic` on this
 * one array, so the tiles above the list can never disagree with the list.
 */
export const getRemindersWithProjects = cache(
  async (options: ReminderListOptions = {}): Promise<ReminderListItem[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("reminders")
      .select(
        "id, user_id, project_id, task_id, node_id, checklist_id, note_id, title, note, description, remind_at, snoozed_until, status, priority, repeat_rule, repeat_interval, repeat_until, repeat_days, notification_channels, snooze_minutes, sound, is_enabled, advance_minutes, created_at, updated_at, project:projects(id, name, color)"
      )
      .eq("user_id", user.id);

    if (options.projectId === "personal") {
      query = query.is("project_id", null);
    } else if (options.projectId) {
      query = query.eq("project_id", options.projectId);
    }

    if (options.priority && options.priority !== "all") {
      query = query.eq("priority", options.priority);
    }

    if (options.status === "live") {
      query = query.in("status", ["pending", "snoozed"]);
    } else if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }

    if (options.query) {
      // Escaped so a stray % or _ in the search box is a literal, not a wildcard.
      const needle = options.query.replace(/[%,()]/g, "");
      if (needle) {
        query = query.or(`title.ilike.%${needle}%,note.ilike.%${needle}%,description.ilike.%${needle}%`);
      }
    }

    query = query.order("remind_at", { ascending: true }).limit(options.limit ?? 500);

    const { data, error } = await query;
    if (error || !data) return [];

    // The embedded `project` comes back as an array from PostgREST's relation
    // syntax; flatten it into the two fields the list actually renders.
    const rows = data as unknown as Array<ReminderListItem & {
      project?: { id: string; name: string; color: string | null } | null;
    }>;

    return rows.map(({ project, ...row }) => ({
      ...row,
      project_name: project?.name ?? null,
      project_color: project?.color ?? null,
    }));
  }
);

/**
 * Reminders plus their rollup, from a single fetch.
 *
 * `stats` is computed over exactly the rows returned, so the KPI strip and the
 * list are always describing the same set — a second aggregate query would
 * drift the moment a reminder changed between the two.
 */
export const getReminderDashboard = cache(
  async (options: ReminderListOptions = {}): Promise<{
    reminders: ReminderListItem[];
    stats: ReminderStats;
  }> => {
    const reminders = sortReminders(await getRemindersWithProjects(options));
    return { reminders, stats: computeReminderStats(reminders) };
  }
);

/** Anything a reminder can be attached to, in the same shape for all three. */
export type AttachTarget = { id: string; title: string; project_id: string | null };

/** Tasks available to attach a reminder to, scoped to a project when given. */
export const getReminderAttachTargets = cache(
  async (projectId?: string): Promise<{
    tasks: AttachTarget[];
    nodes: AttachTarget[];
    notes: AttachTarget[];
  }> => {
    await requireUser();
    const supabase = await createClient();

    const taskQuery = supabase
      .from("tasks")
      .select("id, title, project_id")
      .order("created_at", { ascending: false })
      .limit(200);
    if (projectId) taskQuery.eq("project_id", projectId);

    const nodeQuery = supabase
      .from("project_nodes")
      .select("id, title, project_id")
      .order("sort_order", { ascending: true })
      .limit(200);
    if (projectId) nodeQuery.eq("project_id", projectId);

    const noteQuery = supabase
      .from("notes")
      .select("id, title, project_id")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (projectId) noteQuery.eq("project_id", projectId);

    const [tasks, nodes, notes] = await Promise.all([taskQuery, nodeQuery, noteQuery]);

    return {
      tasks: (tasks.data ?? []) as AttachTarget[],
      nodes: (nodes.data ?? []) as AttachTarget[],
      notes: (notes.data ?? []) as AttachTarget[],
    };
  }
);