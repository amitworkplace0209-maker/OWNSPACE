import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { computeNoteStats, sortNotes, type NoteStats } from "@/lib/note-logic";
import type { DailyNote, Note, NoteVersion, PlanningEntry } from "@/types";

export type NoteWithTagNames = Note & {
  tag_names: string[];
  project_name: string | null;
  project_color: string | null;
  node_name: string | null;
};

const NOTE_SELECT =
  "id, user_id, project_id, node_id, title, content, is_pinned, is_favorited, color, sort_order, created_at, updated_at, project:projects(id, name, color), node:project_nodes(title), tags:note_tags(tags(id, name, color))";

/**
 * Flattens PostgREST's embedded relations into flat fields.
 *
 * The embedded `project` / `node` / `tags` keys used to be spread straight onto
 * the result, so the returned objects carried properties the `NoteWithTagNames`
 * type never declared.
 */
function flatten(data: unknown): NoteWithTagNames[] {
  const rows = data as Array<
    Note & {
      project?: { id: string; name: string; color: string | null } | null;
      node?: { title: string } | null;
      tags?: Array<{ tags: { id: string; name: string; color: string | null } | null }>;
    }
  >;

  return rows.map(({ project, node, tags, ...note }) => ({
    ...note,
    project_name: project?.name ?? null,
    project_color: project?.color ?? null,
    node_name: node?.title ?? null,
    tag_names: (tags ?? []).flatMap((entry) => (entry.tags ? [entry.tags.name] : [])),
  }));
}

export type NoteListOptions = {
  /** Pass "personal" to exclude notes that belong to a project. */
  projectId?: string;
  query?: string;
  pinned?: boolean;
  favorited?: boolean;
  tagId?: string;
  limit?: number;
};

export const getNotes = cache(
  async (options: NoteListOptions = {}): Promise<NoteWithTagNames[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("notes")
      .select(NOTE_SELECT)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (options.projectId === "personal") {
      query = query.is("project_id", null);
    } else if (options.projectId) {
      query = query.eq("project_id", options.projectId);
    }

    // The old version ignored the boolean and always filtered on `true`, and
    // dropped the pinned filter entirely whenever a project was set.
    if (options.pinned !== undefined) query = query.eq("is_pinned", options.pinned);
    if (options.favorited !== undefined) query = query.eq("is_favorited", options.favorited);

    if (options.tagId) query = query.eq("note_tags.tag_id", options.tagId);

    if (options.query) {
      // Escaped so a stray % or , in the search box is a literal rather than
      // an `or()` filter wildcard.
      const needle = options.query.replace(/[%,()]/g, "");
      if (needle) query = query.ilike("title", `%${needle}%`);
    }

    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];

    return flatten(data);
  }
);

/** Same list plus the rollup, from a single fetch. */
export const getNoteDashboard = cache(
  async (options: NoteListOptions = {}): Promise<{
    notes: NoteWithTagNames[];
    stats: NoteStats;
  }> => {
    const notes = sortNotes(await getNotes(options));
    return { notes, stats: computeNoteStats(notes) };
  }
);

/** Tags in use, for the toolbar's tag filter. */
export const getNoteTags = cache(async (): Promise<Array<{ id: string; name: string; color: string | null }>> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .eq("user_id", user.id)
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data as Array<{ id: string; name: string; color: string | null }>;
});

/** Project sections, so a note can be filed under one. */
export const getNoteNodes = cache(
  async (projectId?: string): Promise<Array<{ id: string; title: string; project_id: string | null }>> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("project_nodes")
      .select("id, title, project_id")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .limit(200);
    if (projectId) query = query.eq("project_id", projectId);

    const { data, error } = await query;
    if (error || !data) return [];
    return data as Array<{ id: string; title: string; project_id: string | null }>;
  }
);

export const getNote = cache(async (noteId: string): Promise<NoteWithTagNames> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .select(NOTE_SELECT)
    .eq("user_id", user.id)
    .eq("id", noteId)
    .maybeSingle();

  // An error here is a 404 too, which hides broken queries behind "no such
  // note" — but changing that would turn transient DB blips into error pages.
  if (error || !data) notFound();
  return flatten([data])[0];
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
      .select("*, project:projects(id, name, color)")
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
      .select("*, project:projects(id, name, color)")
      .eq("user_id", user.id)
      .gte("plan_date", from)
      .lte("plan_date", to)
      .order("plan_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error || !data) return [];
    return data as PlanningEntry[];
  }
);