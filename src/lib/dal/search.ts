import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";

export type SearchResultItem = {
  id: string;
  kind: "project" | "task" | "note" | "wiki_page" | "daily_note" | "file" | "milestone";
  title: string;
  subtitle?: string | null;
  href: string;
  updated_at?: string | null;
};

export type SearchResults = {
  projects: SearchResultItem[];
  tasks: SearchResultItem[];
  notes: SearchResultItem[];
  wiki: SearchResultItem[];
  dailyNotes: SearchResultItem[];
  files: SearchResultItem[];
  milestones: SearchResultItem[];
};

export const searchAll = cache(async (query: string): Promise<SearchResults> => {
  const user = await requireUser();
  if (!query.trim()) {
    return { projects: [], tasks: [], notes: [], wiki: [], dailyNotes: [], files: [], milestones: [] };
  }
  const supabase = await createClient();
  const q = `%${query.trim()}%`;

  const [projectsRes, tasksRes, notesRes, wikiRes, dailyRes, filesRes, mileRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, name, status")
        .eq("user_id", user.id)
        .neq("status", "archived")
        .ilike("name", q)
        .limit(10),
      supabase
        .from("tasks")
        .select("id, title, status, project_id, project:projects!inner(id, name)")
        .eq("user_id", user.id)
        .ilike("title", q)
        .limit(15),
      supabase
        .from("notes")
        .select("id, title, project_id, updated_at")
        .eq("user_id", user.id)
        .ilike("title", q)
        .limit(10),
      supabase
        .from("wiki_pages")
        .select("id, title, project_id")
        .eq("user_id", user.id)
        .ilike("title", q)
        .limit(10),
      supabase
        .from("daily_notes")
        .select("id, note_date, content, project_id, project:projects!inner(id, name)")
        .eq("user_id", user.id)
        .ilike("content", q)
        .limit(10),
      supabase
        .from("files")
        .select("id, name, project_id")
        .eq("user_id", user.id)
        .ilike("name", q)
        .limit(10),
      supabase
        .from("milestones")
        .select("id, title, project_id")
        .eq("user_id", user.id)
        .ilike("title", q)
        .limit(10),
    ]);

  const results: SearchResults = {
    projects: (projectsRes.data ?? []).map((p) => ({
      id: p.id,
      kind: "project",
      title: p.name,
      subtitle: null,
      href: `/projects/${p.id}`,
    })),
    tasks: (tasksRes.data ?? []).map((t) => {
      const row = t as unknown as {
        id: string;
        title: string;
        project_id: string;
        project: { id: string; name: string };
      };
      return {
        id: row.id,
        kind: "task",
        title: row.title,
        subtitle: row.project?.name ?? null,
        href: `/projects/${row.project?.id ?? row.project_id}/tasks`,
      };
    }),
    notes: (notesRes.data ?? []).map((n) => ({
      id: n.id,
      kind: "note",
      title: n.title,
      subtitle: n.project_id ? null : "No project",
      href: `/notes/${n.id}`,
    })),
    wiki: (wikiRes.data ?? []).map((w) => ({
      id: w.id,
      kind: "wiki_page",
      title: w.title,
      subtitle: null,
      href: `/projects/${w.project_id}/wiki`,
    })),
    dailyNotes: (dailyRes.data ?? []).map((d) => {
      const row = d as unknown as {
        id: string;
        note_date: string;
        project_id: string;
        project: { id: string; name: string };
      };
      return {
        id: row.id,
        kind: "daily_note",
        title: `Daily note · ${row.note_date}`,
        subtitle: row.project?.name ?? null,
        href: `/daily?date=${row.note_date}`,
      };
    }),
    files: (filesRes.data ?? []).map((f) => {
      const row = f as unknown as { id: string; name: string; project_id: string | null };
      return {
        id: row.id,
        kind: "file",
        title: row.name,
        subtitle: null,
        href: row.project_id ? `/projects/${row.project_id}/files` : `/resources`,
      };
    }),
    milestones: (mileRes.data ?? []).map((m) => ({
      id: m.id,
      kind: "milestone",
      title: m.title,
      subtitle: null,
      href: `/projects/${m.project_id}/phases`,
    })),
  };

  return results;
});