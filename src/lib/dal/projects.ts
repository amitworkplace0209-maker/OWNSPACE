import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { getAnalyticsSnapshot } from "@/lib/dal/analytics";
import {
  computeProjectHealth,
  daysUntil,
  todayIsoDate,
  type HealthState,
} from "@/lib/dashboard-logic";
import type { Project, ProjectStatus, Tag } from "@/types";

export type ProjectWithTags = Project & { tag_names: string[]; tag_ids: string[] };

export type ProjectListOptions = {
  status?: ProjectStatus | "all";
  query?: string;
  sort?: "recent" | "due" | "created" | "name" | "priority";
  tagId?: string;
  limit?: number;
};

export const getProjects = cache(
  async (options: ProjectListOptions = {}): Promise<ProjectWithTags[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    // Resolve tag filter to a set of project ids first (junction query).
    let projectIds: string[] | null = null;
    if (options.tagId) {
      const { data: tagged } = await supabase
        .from("project_tags")
        .select("project_id")
        .eq("user_id", user.id)
        .eq("tag_id", options.tagId);
      projectIds = (tagged ?? []).map((t) => t.project_id);
    }

    let query = supabase
      .from("projects")
      .select(
        `
        id, user_id, name, description, icon, color, status, priority,
        progress, start_date, due_date, sort_order, created_at, updated_at,
        project_tags(tags!inner(id, name))
      `
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (projectIds) {
      query = query.in("id", projectIds);
    }
    if (options.query) {
      query = query.ilike("name", `%${options.query}%`);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [];
    }

    const projects = (data as unknown as Array<Project & { project_tags: { tags: { id: string; name: string } }[] }>).map(
      (p) => ({
        ...p,
        tag_names: (p.project_tags ?? []).map((t) => t.tags.name),
        tag_ids: (p.project_tags ?? []).map((t) => t.tags.id),
      })
    );

    if (options.sort === "name") {
      projects.sort((a, b) => a.name.localeCompare(b.name));
    } else if (options.sort === "due") {
      projects.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date < b.due_date ? -1 : 1;
      });
    } else if (options.sort === "priority") {
      const order = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };
      projects.sort((a, b) => order[b.priority] - order[a.priority]);
    }

    return projects;
  }
);

export const getProject = cache(
  async (projectId: string): Promise<Project> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", projectId)
      .maybeSingle();

    if (error || !data) {
      notFound();
    }

    return data as Project;
  }
);

export const getProjectTags = cache(
  async (projectId: string): Promise<Tag[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("project_tags")
      .select("tags!inner(id, name, color)")
      .eq("user_id", user.id)
      .eq("project_id", projectId);

    if (error || !data) {
      return [];
    }

    return (data as unknown as { tags: Tag }[]).map((d) => d.tags);
  }
);

/** Projects that are not archived — used for selectors across the app. */
export const getActiveProjects = cache(async (): Promise<Project[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id, name, color, status, priority, progress, start_date, due_date, updated_at")
    .eq("user_id", user.id)
    .neq("status", "archived")
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as Project[];
});

export type DashboardProjectSummary = {
  total: number;
  active: number;
  completed: number;
  archived: number;
  /** Projects created during the current calendar month — a real trend, not a guess. */
  createdThisMonth: number;
};

export const getProjectSummary = cache(
  async (): Promise<DashboardProjectSummary> => {
    const user = await requireUser();
    const supabase = await createClient();

    // Status totals already come from getAnalyticsSnapshot(), which the
    // dashboard renders alongside this — re-scanning the projects table here
    // would duplicate that work. Only the month-to-date creation count is not
    // in the snapshot, so that is the single query this performs.
    const snapshot = await getAnalyticsSnapshot();
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();

    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart);

    return {
      total: snapshot.projects.total,
      active: snapshot.projects.active + snapshot.projects.onHold,
      completed: snapshot.projects.completed,
      archived: snapshot.projects.archived,
      createdThisMonth: count ?? 0,
    };
  }
);

// ---------------------------------------------------------------------------
// Dashboard: project health
// ---------------------------------------------------------------------------

export type ProjectHealthSummary = Project & {
  health: HealthState;
  /** Open tasks whose due date is before today. */
  overdueTasks: number;
  /** backlog + todo + in_progress tasks. */
  openTasks: number;
  /** Tasks with status "done". */
  completedTasks: number;
  /** Calendar days until the project due date, or null when unset. */
  daysLeft: number | null;
  /** Name of the phase currently in progress, if any. */
  currentPhase: string | null;
};

const HEALTH_RANK: Record<HealthState, number> = {
  at_risk: 0,
  attention: 1,
  healthy: 2,
};

/**
 * Active projects (status "active" or "on_hold" — the same set the KPI counts)
 * enriched with a health state derived purely from their own data.
 *
 * Three queries total, no per-project fetches:
 *   1. the projects themselves
 *   2. every task for those project ids (project_id/status/due_date only)
 *   3. all phases (shared, cached)
 *
 * Ordering puts whatever needs attention first, then most recently touched.
 * Health rules live in `computeProjectHealth` and are documented there.
 */
export const getProjectHealthSummaries = cache(
  async (limit = 4): Promise<ProjectHealthSummary[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const [projectsRes, phasesRes] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, user_id, name, description, icon, color, status, priority, progress, start_date, due_date, sort_order, created_at, updated_at"
        )
        .eq("user_id", user.id)
        .in("status", ["active", "on_hold"])
        .order("updated_at", { ascending: false })
        .limit(limit),
      // Queried directly (rather than via getAllPhases) so this module does
      // not import phases-milestones, which already imports this module.
      supabase
        .from("project_phases")
        .select("project_id, name, status, sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),
    ]);

    const projects = (projectsRes.data ?? []) as Project[];
    if (projects.length === 0) return [];

    const ids = projects.map((p) => p.id);
    const tasksRes = await supabase
      .from("tasks")
      .select("project_id, status, due_date")
      .eq("user_id", user.id)
      .in("project_id", ids);

    const rollup = new Map<
      string,
      { open: number; overdue: number; done: number }
    >();
    const todayStr = todayIsoDate();
    for (const t of tasksRes.data ?? []) {
      const entry =
        rollup.get(t.project_id) ?? { open: 0, overdue: 0, done: 0 };
      if (t.status === "done") {
        entry.done += 1;
      } else if (t.status !== "cancelled") {
        entry.open += 1;
        if (t.due_date && t.due_date < todayStr) entry.overdue += 1;
      }
      rollup.set(t.project_id, entry);
    }

    const phasesByProject = new Map<
      string,
      Array<{ name: string; status: string; sort_order: number }>
    >();
    for (const phase of phasesRes.data ?? []) {
      const list = phasesByProject.get(phase.project_id) ?? [];
      list.push(phase);
      phasesByProject.set(phase.project_id, list);
    }

    const summaries = projects.map((project): ProjectHealthSummary => {
      const stats = rollup.get(project.id) ?? { open: 0, overdue: 0, done: 0 };
      const daysLeft = daysUntil(project.due_date);
      const projectPhases = phasesByProject.get(project.id) ?? [];
      const currentPhase =
        projectPhases.find((p) => p.status === "in_progress")?.name ??
        projectPhases.find((p) => p.status !== "completed")?.name ??
        null;

      return {
        ...project,
        health: computeProjectHealth({
          overdueTasks: stats.overdue,
          daysLeft,
          progress: project.progress ?? 0,
        }),
        overdueTasks: stats.overdue,
        openTasks: stats.open,
        completedTasks: stats.done,
        daysLeft,
        currentPhase,
      };
    });

    return summaries.sort(
      (a, b) =>
        HEALTH_RANK[a.health] - HEALTH_RANK[b.health] ||
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  }
);