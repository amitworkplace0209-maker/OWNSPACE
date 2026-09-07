import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { DailyNote, Note, NoteVersion, PlanningEntry } from "@/types";

export type NoteWithTagNames = Note & { tag_names: string[]; project_name: string };

export type NoteListOptions = {
  projectId?: string;
  query?: string;
  pinned?: boolean;
  favorited?: boolean;
  limit?: number;
};

export const getNotes = cache(
  async (options: NoteListOptions = {}): Promise<NoteWithTagNames[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("notes")
      .select("*, project(name), tags:note_tags(tags(name))")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.query) query = query.ilike("title", `%${options.query}%`);
    if (options.pinned !== undefined && !options.projectId) query = query.eq("is_pinned", true);
    if (options.favorited !== undefined) query = query.eq("is_favorited", true);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as unknown as Array<Note & { project: { name: string } | null; tags: { name: string }[] }>).map(
      (n) => ({
        ...n,
        tag_names: (n.tags ?? []).map((t) => t.name),
        project_name: n.project?.name ?? "",
      })
    );
  }
);

export const getNote = cache(async (noteId: string): Promise<NoteWithTagNames> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .select("*, project(id, name), tags:note_tags(tags(name))")
    .eq("user_id", user.id)
    .eq("id", noteId)
    .maybeSingle();

  if (error || !data) notFound();
  const n = data as unknown as Note & {
    project: { id: string; name: string } | null;
    tags: { name: string }[];
  };
  return { ...n, tag_names: (n.tags ?? []).map((t) => t.name), project_name: n.project?.name ?? "" };
});

export const getRecentNotes = cache(async (limit = 5): Promise<NoteWithTagNames[]> => {
  return getNotes({ limit });
});

export const getNoteVersions = cache(
  async (noteId: string): Promise<NoteVersion[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("note_versions")
      .select("*")
      .eq("user_id", user.id)
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data as NoteVersion[];
  }
);

export const getDailyNote = cache(
  async (projectId: string, date: string): Promise<DailyNote | null> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("daily_notes")
      .select("*")
      .eq("user_id", user.id)
      .eq("project_id", projectId)
      .eq("note_date", date)
      .maybeSingle();

    if (error || !data) return null;
    return data as DailyNote;
  }
);

export const getDailyNotes = cache(
  async (options: { projectId?: string; from?: string; to?: string; query?: string; limit?: number } = {}) => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("daily_notes")
      .select("*, project(id, name, color)")
      .eq("user_id", user.id)
      .order("note_date", { ascending: false });

    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.from) query = query.gte("note_date", options.from);
    if (options.to) query = query.lte("note_date", options.to);
    if (options.query) query = query.ilike("content", `%${options.query}%`);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as DailyNote[];
  }
);

export const getPlanningEntries = cache(
  async ({ from, to }: { from: string; to: string }): Promise<PlanningEntry[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("planning_entries")
      .select("*, project(id, name, color)")
      .eq("user_id", user.id)
      .gte("plan_date", from)
      .lte("plan_date", to)
      .order("plan_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error || !data) return [];
    return data as PlanningEntry[];
  }
);