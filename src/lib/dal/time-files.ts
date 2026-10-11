import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { PomodoroSession, StoredFile, TimeEntry, WikiPage, WikiVersion } from "@/types";

export const getTimeEntries = cache(
  async (options: { projectId?: string; from?: string; to?: string; limit?: number } = {}) => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("time_entries")
      .select("*, project:projects(id, name, color), task:tasks(id, title)")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false });

    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.from) query = query.gte("started_at", options.from);
    if (options.to) query = query.lte("started_at", options.to);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as TimeEntry[];
  }
);

export const getRunningTimer = cache(
  async (): Promise<{ hasRunning: boolean; entry: TimeEntry | null; projectName: string | null; taskName: string | null }> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("time_entries")
      .select("*, project:projects(id, name), task:tasks(id, title)")
      .eq("user_id", user.id)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return { hasRunning: false, entry: null, projectName: null, taskName: null };
    }
    const t = data as unknown as TimeEntry & { project: { name: string } | null; task: { title: string } | null };
    return {
      hasRunning: true,
      entry: { ...t, project_id: t.project_id },
      projectName: t.project?.name ?? null,
      taskName: t.task?.title ?? null,
    };
  }
);

export type PomodoroStatusResult = {
  running: PomodoroSession | null;
  todayCount: number;
  recent: PomodoroSession[];
};

export const getPomodoroStatus = cache(async (): Promise<PomodoroStatusResult> => {
  const user = await requireUser();
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [runningRes, todayRes, recentRes] = await Promise.all([
    supabase
      .from("pomodoro_sessions")
      .select("*, task:tasks(id, title)")
      .eq("user_id", user.id)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pomodoro_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gte("started_at", todayStart.toISOString()),
    supabase
      .from("pomodoro_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  return {
    running: (runningRes.data as PomodoroSession | null) ?? null,
    todayCount: todayRes.count ?? 0,
    recent: (recentRes.data as PomodoroSession[]) ?? [],
  };
});

export type TimeSummary = {
  todayMinutes: number;
  weekMinutes: number;
  monthMinutes: number;
};

export const getTimeSummary = cache(async (): Promise<TimeSummary> => {
  const user = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const earliest = startOfWeek < startOfMonth ? startOfWeek : startOfMonth;

  const { data, error } = await supabase
    .from("time_entries")
    .select("duration_minutes, started_at")
    .eq("user_id", user.id)
    .gte("started_at", earliest.toISOString());

  const summary: TimeSummary = { todayMinutes: 0, weekMinutes: 0, monthMinutes: 0 };
  if (error || !data) return summary;

  for (const e of data) {
    const minutes = e.duration_minutes ?? 0;
    const started = new Date(e.started_at);
    if (started >= startOfToday) summary.todayMinutes += minutes;
    if (started >= startOfWeek) summary.weekMinutes += minutes;
    if (started >= startOfMonth) summary.monthMinutes += minutes;
  }

  return summary;
});

export const getFiles = cache(
  async (options: { projectId?: string; taskId?: string; limit?: number } = {}) => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("files")
      .select("*, project:projects(id, name), task:tasks(id, title)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.taskId) query = query.eq("task_id", options.taskId);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as StoredFile[];
  }
);

export const getWikiPages = cache(async (projectId: string): Promise<WikiPage[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*")
    .eq("user_id", user.id)
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error || !data) return [];
  return data as WikiPage[];
});

export const getWikiPage = cache(
  async (projectId: string, slug: string): Promise<WikiPage | null> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("wiki_pages")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) return null;
    return data as WikiPage;
  }
);

type WikiPageWithProject = WikiPage & { project: { id: string; name: string } | null };

export const getAllWikiPages = cache(async (): Promise<WikiPageWithProject[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wiki_pages")
    .select("*, project:projects(id, name)")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error || !data) return [];
  return data as unknown as WikiPageWithProject[];
});

export const getWikiVersions = cache(
  async (wikiPageId: string): Promise<WikiVersion[]> => {
    const user = await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("wiki_versions")
      .select("*")
      .eq("user_id", user.id)
      .eq("wiki_page_id", wikiPageId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return [];
    return data as WikiVersion[];
  }
);