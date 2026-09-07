import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
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
        id, user_id, project_id, phase_id, parent_task_id, title, description,
        status, priority, progress, due_date, reminder_at, sort_order, created_at, updated_at,
        project!inner(name, color),
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

    let tasks = (data as unknown as Array<Task & { tags: { name: string }[]; project: { name: string } }>).map(
      (t) => ({
        ...t,
        tag_names: (t.tags ?? []).map((x) => x.name),
        project_name: t.project?.name ?? "",
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
          `*, project!inner(name, color), tags:task_tags(tags(name))`
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

  const todayStr = new Date().toISOString().slice(0, 10);

  const [statusRes, todayRes, upcomingRes] = await Promise.all([
    supabase.from("tasks").select("status, due_date").eq("user_id", user.id),
    supabase
      .from("tasks")
      .select("due_date, status")
      .eq("user_id", user.id)
      .eq("due_date", todayStr),
    supabase
      .from("tasks")
      .select("due_date", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("due_date", todayStr)
      .in("status", ["backlog", "todo", "in_progress"]),
  ]);

  const summary: TaskSummary = {
    total: statusRes.data?.length ?? 0,
    byStatus: { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 },
    today: todayRes.data?.length ?? 0,
    overdue: 0,
    upcoming: upcomingRes.count ?? 0,
  };

  for (const t of statusRes.data ?? []) {
    summary.byStatus[t.status as TaskStatus] += 1;
    if (
      t.due_date &&
      t.due_date < todayStr &&
      ["backlog", "todo", "in_progress"].includes(t.status)
    ) {
      summary.overdue += 1;
    }
  }

  return summary;
});

export interface DueTask {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  project_name: string;
}

export const getTasksDueToday = cache(async (): Promise<DueTask[]> => {
  const user = await requireUser();
  const todayStr = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, status, priority, project!inner(name)")
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
    .select("id, title, due_date, status, priority, project!inner(name)")
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
      .select("id, title, due_date, status, priority, project!inner(name)")
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