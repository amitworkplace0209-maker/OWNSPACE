import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { getProject } from "@/lib/dal/projects";
import type { Milestone, ProjectPhase, Task } from "@/types";

export const getPhases = cache(async (projectId: string): Promise<ProjectPhase[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_phases")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as ProjectPhase[];
});

export const getAllPhases = cache(async (): Promise<ProjectPhase[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_phases")
    .select("*")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as ProjectPhase[];
});

export type PhaseWithProgress = ProjectPhase & {
  taskTotal: number;
  taskDone: number;
  progress: number;
};

export const getPhasesWithProgress = cache(
  async (projectId: string): Promise<PhaseWithProgress[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const [phasesRes, tasksRes] = await Promise.all([
      supabase
        .from("project_phases")
        .select("*")
        .eq("user_id", user.id)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("tasks")
        .select("phase_id, status")
        .eq("user_id", user.id)
        .eq("project_id", projectId),
    ]);

    const tasks = (tasksRes.data ?? []) as { phase_id: string | null; status: string }[];
    const phases = (phasesRes.data ?? []) as ProjectPhase[];

    return phases.map((phase) => {
      const phaseTasks = tasks.filter((t) => t.phase_id === phase.id);
      const done = phaseTasks.filter((t) => t.status === "done").length;
      return {
        ...phase,
        taskTotal: phaseTasks.length,
        taskDone: done,
        progress: phaseTasks.length ? Math.round((done / phaseTasks.length) * 100) : 0,
      };
    });
  }
);

export const getMilestones = cache(
  async (projectId: string): Promise<Milestone[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error || !data) return [];
    return data as Milestone[];
  }
);

export const getAllMilestones = cache(async (): Promise<Milestone[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("milestones")
    .select("*, project(id, name)")
    .eq("user_id", user.id)
    .not("due_date", "is", null)
    .order("due_date", { ascending: true });

  if (error || !data) return [];
  return data as unknown as Milestone[];
});

export type ProjectOverview = {
  project: Awaited<ReturnType<typeof getProject>>;
  phases: PhaseWithProgress[];
  milestones: Milestone[];
  tasks: Task[];
  taskTotal: number;
  taskDone: number;
  notesCount: number;
  filesCount: number;
};

export const getProjectOverview = cache(async (projectId: string): Promise<ProjectOverview> => {
  const user = await requireUser();
  const supabase = await createClient();

  const [project, phases, milestones, tasksRes, notesRes, filesRes] = await Promise.all([
    getProject(projectId),
    getPhasesWithProgress(projectId),
    getMilestones(projectId),
    supabase
      .from("tasks")
      .select("id, title, status, priority, due_date, phase_id, updated_at")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("notes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", projectId),
    supabase
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("project_id", projectId),
  ]);

  const tasks = (tasksRes.data ?? []) as Task[];
  return {
    project,
    phases,
    milestones,
    tasks,
    taskTotal: tasks.length,
    taskDone: tasks.filter((t) => t.status === "done").length,
    notesCount: notesRes.count ?? 0,
    filesCount: filesRes.count ?? 0,
  };
});