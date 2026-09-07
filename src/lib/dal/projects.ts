import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
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
};

export const getProjectSummary = cache(
  async (): Promise<DashboardProjectSummary> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("projects")
      .select("status")
      .eq("user_id", user.id);

    const summary: DashboardProjectSummary = {
      total: 0,
      active: 0,
      completed: 0,
      archived: 0,
    };

    if (error || !data) return summary;

    summary.total = data.length;
    for (const p of data) {
      if (p.status === "active" || p.status === "on_hold") summary.active += 1;
      else if (p.status === "completed") summary.completed += 1;
      else if (p.status === "archived") summary.archived += 1;
    }

    return summary;
  }
);