import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import type { Tag } from "@/types";

export const getTags = cache(async (): Promise<Tag[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as Tag[];
});

export const getTagsWithUsage = cache(async (): Promise<Array<Tag & { usage: number }>> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .select(
      `*, project_tags(count), task_tags(count), note_tags(count), wiki_tags(count)`
    )
    .eq("user_id", user.id)
    .order("name", { ascending: true });

  if (error || !data) return [];

  type TagCountRow = Tag & {
    project_tags: { count: number }[];
    task_tags: { count: number }[];
    note_tags: { count: number }[];
    wiki_tags: { count: number }[];
  };

  return (data as unknown as TagCountRow[]).map((t) => ({
    id: t.id,
    user_id: t.user_id,
    name: t.name,
    color: t.color,
    created_at: t.created_at,
    updated_at: t.updated_at,
    usage:
      (t.project_tags?.[0]?.count ?? 0) +
      (t.task_tags?.[0]?.count ?? 0) +
      (t.note_tags?.[0]?.count ?? 0) +
      (t.wiki_tags?.[0]?.count ?? 0),
  }));
});