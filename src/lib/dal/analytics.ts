import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { todayIsoDate } from "@/lib/dashboard-logic";
import type { Priority, TaskStatus } from "@/types";

export type AnalyticsSnapshot = {
  projects: {
    total: number;
    active: number;
    completed: number;
    onHold: number;
    archived: number;
    avgProgress: number;
  };
  tasks: {
    total: number;
    byStatus: Record<TaskStatus, number>;
    byPriority: Record<Priority, number>;
    completed: number;
    overdue: number;
    today: number;
    completionRate: number;
  };
  time: { totalMinutes: number; todayMinutes: number; onRunningTask: boolean };
  pomodoro: { running: boolean; totalSessions: number; todaySessions: number; totalFocusMinutes: number };
  notes: { total: number; updatedThisWeek: number };
};

export const getAnalyticsSnapshot = cache(async (): Promise<AnalyticsSnapshot> => {
  const user = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  // UTC date string, matching every other due_date filter in the app so the
  // dashboard's counts and the /tasks list it links to agree.
  const todayStr = todayIsoDate(now);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [projectsRes, tasksRes, timeRes, pomoRes, notesRes, notesWeek] =
    await Promise.all([
      supabase.from("projects").select("status, progress").eq("user_id", user.id),
      supabase.from("tasks").select("status, priority, due_date").eq("user_id", user.id),
      supabase
        .from("time_entries")
        .select("duration_minutes, started_at, ended_at")
        .eq("user_id", user.id),
      supabase.from("pomodoro_sessions").select("status, focus_duration_minutes, started_at").eq("user_id", user.id),
      supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      supabase
        .from("notes")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("updated_at", weekAgo.toISOString()),
    ]);

  const snapshot: AnalyticsSnapshot = {
    projects: { total: 0, active: 0, completed: 0, onHold: 0, archived: 0, avgProgress: 0 },
    tasks: {
      total: 0,
      byStatus: { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 },
      byPriority: { none: 0, low: 0, medium: 0, high: 0, urgent: 0 },
      completed: 0,
      overdue: 0,
      today: 0,
      completionRate: 0,
    },
    time: { totalMinutes: 0, todayMinutes: 0, onRunningTask: false },
    pomodoro: { running: false, totalSessions: 0, todaySessions: 0, totalFocusMinutes: 0 },
    notes: { total: 0, updatedThisWeek: 0 },
  };

  // Projects
  const projects = projectsRes.data ?? [];
  snapshot.projects.total = projects.length;
  for (const p of projects) {
    if (p.status === "active") snapshot.projects.active += 1;
    if (p.status === "on_hold") snapshot.projects.onHold += 1;
    if (p.status === "completed") snapshot.projects.completed += 1;
    if (p.status === "archived") snapshot.projects.archived += 1;
    snapshot.projects.avgProgress += p.progress ?? 0;
  }
  snapshot.projects.avgProgress = projects.length ? Math.round(snapshot.projects.avgProgress / projects.length) : 0;

  // Tasks
  const tasks = tasksRes.data ?? [];
  snapshot.tasks.total = tasks.length;
  for (const t of tasks) {
    snapshot.tasks.byStatus[t.status as TaskStatus] += 1;
    snapshot.tasks.byPriority[t.priority as Priority] += 1;
    if (t.status === "done") snapshot.tasks.completed += 1;
    if (t.due_date && t.due_date < todayStr && ["backlog", "todo", "in_progress"].includes(t.status)) {
      snapshot.tasks.overdue += 1;
    }
    if (t.due_date === todayStr && ["backlog", "todo", "in_progress"].includes(t.status)) {
      snapshot.tasks.today += 1;
    }
  }
  snapshot.tasks.completionRate = tasks.length ? Math.round((snapshot.tasks.completed / tasks.length) * 100) : 0;

  // Time
  const timeEntries = timeRes.data ?? [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  for (const e of timeEntries) {
    snapshot.time.totalMinutes += e.duration_minutes ?? 0;
    if (new Date(e.started_at) >= todayStart) snapshot.time.todayMinutes += e.duration_minutes ?? 0;
    if (!e.ended_at) snapshot.time.onRunningTask = true;
  }

  // Pomodoro
  const pomo = pomoRes.data ?? [];
  for (const s of pomo) {
    if (s.status === "running") snapshot.pomodoro.running = true;
    if (s.status === "completed") {
      snapshot.pomodoro.totalSessions += 1;
      snapshot.pomodoro.totalFocusMinutes += s.focus_duration_minutes;
      if (new Date(s.started_at) >= todayStart) snapshot.pomodoro.todaySessions += 1;
    }
  }

  snapshot.notes.total = notesRes.count ?? 0;
  snapshot.notes.updatedThisWeek = notesWeek.count ?? 0;

  return snapshot;
});

export type ActivityDay = {
  day: string;
  tasksCompleted: number;
  minutesTracked: number;
  pomodoros: number;
  notesCreated: number;
};

export const getActivityTrend = cache(async (days = 30): Promise<ActivityDay[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);

  const [tasksRes, timeRes, pomoRes, notesRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("updated_at")
      .eq("user_id", user.id)
      .eq("status", "done")
      .gte("updated_at", cutoff.toISOString()),
    supabase
      .from("time_entries")
      .select("duration_minutes, started_at")
      .eq("user_id", user.id)
      .gte("started_at", cutoff.toISOString()),
    supabase
      .from("pomodoro_sessions")
      .select("started_at")
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("started_at", cutoff.toISOString()),
    supabase
      .from("notes")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", cutoff.toISOString()),
  ]);

  const localDay = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const buckets = new Map<string, ActivityDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    d.setHours(0, 0, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    buckets.set(key, { day: key, tasksCompleted: 0, minutesTracked: 0, pomodoros: 0, notesCreated: 0 });
  }

  for (const t of tasksRes.data ?? []) {
    const bucket = buckets.get(localDay(t.updated_at));
    if (bucket) bucket.tasksCompleted += 1;
  }
  for (const e of timeRes.data ?? []) {
    const bucket = buckets.get(localDay(e.started_at));
    if (bucket) bucket.minutesTracked += e.duration_minutes ?? 0;
  }
  for (const s of pomoRes.data ?? []) {
    const bucket = buckets.get(localDay(s.started_at));
    if (bucket) bucket.pomodoros += 1;
  }
  for (const n of notesRes.data ?? []) {
    const bucket = buckets.get(localDay(n.created_at));
    if (bucket) bucket.notesCreated += 1;
  }

  return Array.from(buckets.values());
});

export type ProjectAnalytics = {
  projectId: string;
  taskTotal: number;
  taskDone: number;
  taskCompletionRate: number;
  tasksByStatus: Record<TaskStatus, number>;
  phases: { total: number; completed: number };
  milestones: { total: number; completed: number };
  timeMinutes: number;
  pomodoroSessions: number;
  notes: number;
  wikiPages: number;
};

export const getProjectAnalytics = cache(async (projectId: string): Promise<ProjectAnalytics> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [tasksRes, phasesRes, milestonesRes, timeRes, notesRes, wikiRes] =
    await Promise.all([
      supabase.from("tasks").select("id, status").eq("user_id", user.id).eq("project_id", projectId),
      supabase.from("project_phases").select("status").eq("user_id", user.id).eq("project_id", projectId),
      supabase.from("milestones").select("status").eq("user_id", user.id).eq("project_id", projectId),
      supabase.from("time_entries").select("duration_minutes").eq("user_id", user.id).eq("project_id", projectId),
      supabase.from("notes").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("project_id", projectId),
      supabase.from("wiki_pages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("project_id", projectId),
    ]);

  const result: ProjectAnalytics = {
    projectId,
    taskTotal: 0,
    taskDone: 0,
    taskCompletionRate: 0,
    tasksByStatus: { backlog: 0, todo: 0, in_progress: 0, done: 0, cancelled: 0 },
    phases: { total: 0, completed: 0 },
    milestones: { total: 0, completed: 0 },
    timeMinutes: 0,
    pomodoroSessions: 0,
    notes: notesRes.count ?? 0,
    wikiPages: wikiRes.count ?? 0,
  };

  const tasks = tasksRes.data ?? [];
  result.taskTotal = tasks.length;
  for (const t of tasks) {
    result.tasksByStatus[t.status as TaskStatus] += 1;
    if (t.status === "done") result.taskDone += 1;
  }
  result.taskCompletionRate = tasks.length ? Math.round((result.taskDone / tasks.length) * 100) : 0;

  const phases = phasesRes.data ?? [];
  result.phases.total = phases.length;
  result.phases.completed = phases.filter((p) => p.status === "completed").length;

  const milestones = milestonesRes.data ?? [];
  result.milestones.total = milestones.length;
  result.milestones.completed = milestones.filter((m) => m.status === "completed").length;

  for (const e of timeRes.data ?? []) result.timeMinutes += e.duration_minutes ?? 0;

  // Pomodoro sessions are not project-scoped; count completed sessions linked to this project's tasks.
  const projectTaskIds = (tasksRes.data ?? []).map((t) => t.id);
  if (projectTaskIds.length > 0) {
    const { count: pomoCount } = await supabase
      .from("pomodoro_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .in("task_id", projectTaskIds);
    result.pomodoroSessions = pomoCount ?? 0;
  }

  return result;
});