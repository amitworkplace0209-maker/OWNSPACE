import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { computeTodayProgress, todayIsoDate, type TodayProgress } from "@/lib/dashboard-logic";
import { getAnalyticsSnapshot } from "@/lib/dal/analytics";
import type {
  Checklist,
  ChecklistItem,
  Priority,
  Task,
  TaskComment,
  TaskStatus,
} from "@/types";

export type TaskWithTagNames = Task & {
  tag_names: string[];
  project_name: string;
  /** Project accent, so list rows can show a colour dot without a second query. */
  project_color: string | null;
};

export type TaskListOptions = {
  status?: TaskStatus | "all";
  priority?: Priority | "all";
  projectId?: string;
  phaseId?: string;
  due?: "today" | "upcoming" | "overdue" | "none" | "all";
  query?: string;
  tagId?: string;
  completed?: boolean;
  sort?: "due" | "priority" | "created" | "updated";
  limit?: number;
};

export const getTasks = cache(
  async (options: TaskListOptions = {}): Promise<TaskWithTagNames[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("tasks")
      .select(
        `
        id, user_id, project_id, phase_id, node_id, parent_task_id, title, description,
        status, priority, progress, start_date, due_date, reminder_at,
        estimated_minutes, sort_order, created_at, updated_at,
        project:projects!inner(name, color),
        tags:task_tags(tags(name))
      `
      )
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options.priority && options.priority !== "all") {
      query = query.eq("priority", options.priority);
    }
    if (options.projectId) {
      query = query.eq("project_id", options.projectId);
    }
    if (options.phaseId) {
      query = query.eq("phase_id", options.phaseId);
    }
    if (options.completed !== undefined) {
      if (options.completed) {
        query = query.in("status", ["done", "cancelled"]);
      } else {
        query = query.in("status", ["backlog", "todo", "in_progress"]);
      }
    }
    if (options.query) {
      query = query.ilike("title", `%${options.query}%`);
    }

    switch (options.due) {
      case "today": {
        query = query.not("due_date", "is", null);
        break;
      }
      case "upcoming":
        query = query.not("due_date", "is", null);
        break;
      case "overdue":
        query = query.not("due_date", "is", null).in("status", ["todo", "in_progress", "backlog"]);
        break;
      case "none":
        query = query.is("due_date", null);
        break;
      default:
        break;
    }

    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];

    let tasks = (data as unknown as Array<Task & { tags: { name: string }[]; project: { name: string; color: string | null } }>).map(
      (t) => ({
        ...t,
        tag_names: (t.tags ?? []).map((x) => x.name),
        project_name: t.project?.name ?? "",
        project_color: t.project?.color ?? null,
      })
    ) as TaskWithTagNames[];

    // date-based filtering happens client-side where DB comparison is awkward
    if (options.due === "today") {
      const todayStr = new Date().toISOString().slice(0, 10);
      tasks = tasks.filter((t) => t.due_date === todayStr);
    }
    if (options.due === "upcoming") {
      const todayStr = new Date().toISOString().slice(0, 10);
      tasks = tasks.filter((t) => t.due_date && t.due_date >= todayStr);
    }
    if (options.due === "overdue") {
      const todayStr = new Date().toISOString().slice(0, 10);
      tasks = tasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < todayStr &&
          ["todo", "in_progress", "backlog"].includes(t.status)
      );
    }

    if (options.sort === "due") {
      tasks.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date < b.due_date ? -1 : 1;
      });
    } else if (options.sort === "priority") {
      const order: Record<Priority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
      tasks.sort((a, b) => order[b.priority] - order[a.priority]);
    } else if (options.sort === "updated") {
      tasks.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    }

    return tasks;
  }
);

export type TaskDetail = TaskWithTagNames & {
  project_name: string;
  project_color: string | null;
  comments: TaskComment[];
  checklists: (Checklist & { items: ChecklistItem[] })[];
  dependencies: TaskWithTagNames[];
  dependents: TaskWithTagNames[];
};

export const getTask = cache(async (taskId: string): Promise<TaskDetail> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: task }, { data: comments }, { data: checklistsRaw }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          `*, project:projects!inner(name, color), tags:task_tags(tags(name))`
        )
        .eq("user_id", user.id)
        .eq("id", taskId)
        .maybeSingle(),
      supabase
        .from("task_comments")
        .select("*")
        .eq("user_id", user.id)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
      supabase
        .from("checklists")
        .select("*, checklist_items(*)")
        .eq("user_id", user.id)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true }),
    ]);

  if (!task) {
    notFound();
  }

  const tagNames = ((task as Record<string, unknown>).tags as { name: string }[] | undefined) ?? [];
  const project = (task as unknown as { project: { name: string; color: string | null } }).project;
  const base = { ...(task as Task), tag_names: tagNames.map((t) => t.name) };
  const checklists = ((checklistsRaw ?? []) as unknown as (Checklist & {
    checklist_items: ChecklistItem[];
  })[]).map((c) => ({
    ...c,
    items: [...(c.checklist_items ?? [])].sort((a, b) => a.sort_order - b.sort_order),
  }));

  const { data: deps } = await supabase
    .from("task_dependencies")
    .select("tasks!task_dependencies_depends_on_task_id_fkey(*)")
    .eq("user_id", user.id)
    .eq("task_id", taskId);
  const { data: dependents } = await supabase
    .from("task_dependencies")
    .select("tasks!task_dependencies_task_id_fkey(*)")
    .eq("user_id", user.id)
    .eq("depends_on_task_id", taskId);

  const depsClean = ((deps ?? []) as unknown as { tasks: Task }[]).map((d) => d.tasks);
  const dependentsClean = ((dependents ?? []) as unknown as { tasks: Task }[]).map((d) => d.tasks);

  return {
    ...base,
    project_name: project.name,
    project_color: project.color ?? null,
    comments: (comments ?? []) as TaskComment[],
    checklists,
    dependencies: depsClean as TaskWithTagNames[],
    dependents: dependentsClean as TaskWithTagNames[],
  };
});

export type TaskSummary = {
  total: number;
  byStatus: Record<TaskStatus, number>;
  today: number;
  overdue: number;
  upcoming: number;
};

export const getTaskSummary = cache(async (): Promise<TaskSummary> => {
  const user = await requireUser();
  const supabase = await createClient();
  const snapshot = await getAnalyticsSnapshot();

  const todayStr = todayIsoDate();
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("due_date", todayStr)
    .in("status", ["backlog", "todo", "in_progress"]);

  // Task totals and the overdue rollup already come from getAnalyticsSnapshot()
  // (which the dashboard renders alongside this), so re-deriving them here
  // avoids scanning the tasks table twice in the same request.
  return {
    total: snapshot.tasks.total,
    byStatus: snapshot.tasks.byStatus,
    today: snapshot.tasks.today,
    overdue: snapshot.tasks.overdue,
    upcoming: count ?? 0,
  };
});

export interface DueTask {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  project_id: string | null;
  project_name: string | null;
}

export const getTasksDueToday = cache(async (): Promise<DueTask[]> => {
  const user = await requireUser();
  const todayStr = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority, project_id, project:projects!inner(name)")
    .eq("user_id", user.id)
    .eq("due_date", todayStr)
    .order("priority", { ascending: false });

  if (error || !data) return [];
  return (data as unknown as Array<Omit<DueTask, "project_name"> & { project: { name: string } }>).map(
    (t) => ({ ...t, project_name: t.project.name })
  );
});

export const getTasksOverdue = cache(async (): Promise<DueTask[]> => {
  const user = await requireUser();
  const todayStr = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority, project_id, project:projects!inner(name)")
    .eq("user_id", user.id)
    .lt("due_date", todayStr)
    .in("status", ["backlog", "todo", "in_progress"])
    .order("due_date", { ascending: true });

  if (error || !data) return [];
  return (data as unknown as Array<Omit<DueTask, "project_name"> & { project: { name: string } }>).map(
    (t) => ({ ...t, project_name: t.project.name })
  );
});

export const getTasksDueInRange = cache(
  async (fromIso: string, toIso: string): Promise<Array<DueTask & { due_date: string }>> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, due_date, status, priority, project_id, project:projects!inner(name)")
      .eq("user_id", user.id)
      .not("due_date", "is", null)
      .gte("due_date", fromIso)
      .lte("due_date", toIso)
      .order("due_date", { ascending: true });

    if (error || !data) return [];
    return (data as unknown as Array<Omit<DueTask, "project_name"> & { project: { name: string } }>).map(
      (t) => ({ ...t, project_name: t.project.name, due_date: t.due_date! })
    );
  }
);

// ---------------------------------------------------------------------------
// Dashboard: today's work
// ---------------------------------------------------------------------------

export type TodayWork = {
  /** Every task due today, completed ones included — drives the progress bar. */
  dueToday: DueTask[];
  /** Open tasks whose due date is before today. */
  overdue: DueTask[];
  /** Open tasks currently in progress. */
  inProgress: DueTask[];
  /** Open tasks marked high or urgent priority. */
  highPriority: DueTask[];
  /** Real completion figures for the tasks due today. */
  progress: TodayProgress;
};

const DUE_TASK_SELECT =
  "id, title, due_date, status, priority, project_id, project:projects!inner(name)";

type RawDueTask = Omit<DueTask, "project_name"> & { project: { name: string } };

function toDueTasks(rows: RawDueTask[] | null): DueTask[] {
  if (!rows) return [];
  return rows.map((t) => ({ ...t, project_name: t.project.name }));
}

/**
 * Everything the "Today's work" section needs, fetched once per request.
 *
 * The due-today and overdue lists reuse the existing cached getters so a
 * dashboard render still costs one query each; only the two extra slices
 * (in progress, high priority) are new. Each query is served by an existing
 * index on `tasks_user_status_idx` / `tasks_user_due_idx`.
 */
export const getTodayWork = cache(async (): Promise<TodayWork> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [dueToday, overdue, inProgressRes, highPriorityRes] = await Promise.all([
    getTasksDueToday(),
    getTasksOverdue(),
    supabase
      .from("tasks")
      .select(DUE_TASK_SELECT)
      .eq("user_id", user.id)
      .eq("status", "in_progress")
      .order("updated_at", { ascending: false })
      .limit(6),
    supabase
      .from("tasks")
      .select(DUE_TASK_SELECT)
      .eq("user_id", user.id)
      .in("status", ["backlog", "todo", "in_progress"])
      .in("priority", ["high", "urgent"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),
  ]);

  return {
    dueToday,
    overdue,
    inProgress: toDueTasks(inProgressRes.data as RawDueTask[] | null),
    highPriority: toDueTasks(highPriorityRes.data as RawDueTask[] | null),
    progress: computeTodayProgress(dueToday),
  };
});
export type TaskStats = {
  total: number;
  dueToday: number;
  overdue: number;
  inProgress: number;
  completedToday: number;
  unassignedDue: number;
  /** Completion rate across everything not cancelled. */
  completionRate: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
};

/**
 * Headline counts for the tasks page.
 *
 * Computed in one pass in SQL-free JS over the same rows the list already
 * fetched, rather than a second aggregate query, so the numbers can never
 * disagree with what is rendered underneath them.
 */
export const getTaskStats = cache(
  async (options: { projectId?: string; query?: string } = {}): Promise<TaskStats> => {
    const tasks = await getTasks({
      projectId: options.projectId,
      query: options.query,
      due: "all",
    });

    const today = new Date().toISOString().slice(0, 10);
    const live = ["todo", "in_progress", "backlog"];

    const byStatus: Record<string, number> = {};
    const byPriority: Record<string, number> = {};

    let dueToday = 0;
    let overdue = 0;
    let inProgress = 0;
    let completedToday = 0;
    let unassignedDue = 0;
    let done = 0;
    let countable = 0;

    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
      byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;

      const isLive = live.includes(task.status);

      if (isLive) {
        countable += 1;
        if (task.status === "done") done += 1;
      }
      if (task.status === "in_progress") inProgress += 1;
      if (isLive && task.due_date === today) dueToday += 1;
      if (isLive && task.due_date && task.due_date < today) overdue += 1;
      if (isLive && task.due_date && !task.project_id) unassignedDue += 1;
      if (
        task.status === "done" &&
        task.updated_at.slice(0, 10) === today
      ) {
        completedToday += 1;
      }
    }

    return {
      total: tasks.length,
      dueToday,
      overdue,
      inProgress,
      completedToday,
      unassignedDue,
      completionRate: countable === 0 ? 0 : Math.round((done / countable) * 100),
      byStatus,
      byPriority,
    };
  }
);

/**
 * Subtask rollup keyed by parent task id.
 *
 * One query for the whole page rather than a count per row, and only for ids
 * that are actually parents - otherwise this costs nothing on a flat list.
 */
export const getSubtaskProgress = cache(
  async (parentIds: string[]): Promise<Record<string, { total: number; done: number }>> => {
    if (parentIds.length === 0) return {};

    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("tasks")
      .select("parent_task_id, status")
      .eq("user_id", user.id)
      .in("parent_task_id", parentIds);

    if (error || !data) return {};

    const result: Record<string, { total: number; done: number }> = {};
    for (const row of data as Array<{ parent_task_id: string; status: string }>) {
      const bucket = result[row.parent_task_id] ?? { total: 0, done: 0 };
      bucket.total += 1;
      if (row.status === "done") bucket.done += 1;
      result[row.parent_task_id] = bucket;
    }
    return result;
  }
);
