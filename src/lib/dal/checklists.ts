import "server-only";

import { cache } from "react";
import { requireUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import type { Checklist, ChecklistItem } from "@/types";

export type ChecklistWithItems = Checklist & {
  items: ChecklistItem[];
  /** What the checklist is attached to, for display. */
  ownerLabel: string | null;
};

/**
 * Checklists for a project, with their items.
 *
 * A checklist belongs to either a task or a structure node (the database
 * enforces exactly one), so both are resolved into one readable label here
 * rather than every caller repeating the two queries.
 */
export const getProjectChecklists = cache(
  async (projectId: string): Promise<ChecklistWithItems[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("checklists")
      .select("*, task:tasks(id, title), node:project_nodes(id, title)")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true });

    if (error || !data) return [];

    // A checklist attached to neither is invisible on the project pages, so
    // filter in memory against the project's tasks and nodes rather than
    // issuing two more round trips.
    const [{ data: taskIds }, { data: nodeIds }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id")
        .eq("user_id", user.id)
        .eq("project_id", projectId),
      supabase
        .from("project_nodes")
        .select("id")
        .eq("user_id", user.id)
        .eq("project_id", projectId),
    ]);

    const ownedTasks = new Set((taskIds ?? []).map((row) => row.id as string));
    const ownedNodes = new Set((nodeIds ?? []).map((row) => row.id as string));

    const rows = (data as Array<Checklist & {
      task: { id: string; title: string } | null;
      node: { id: string; title: string } | null;
    }>).filter(
      (row) =>
        (row.task_id && ownedTasks.has(row.task_id)) ||
        (row.node_id && ownedNodes.has(row.node_id))
    );

    if (rows.length === 0) return [];

    const { data: itemRows } = await supabase
      .from("checklist_items")
      .select("*")
      .eq("user_id", user.id)
      .in("checklist_id", rows.map((row) => row.id))
      .order("sort_order", { ascending: true });

    const itemsByChecklist = new Map<string, ChecklistItem[]>();
    for (const item of (itemRows ?? []) as ChecklistItem[]) {
      const list = itemsByChecklist.get(item.checklist_id) ?? [];
      list.push(item);
      itemsByChecklist.set(item.checklist_id, list);
    }

    return rows.map((row) => ({
      ...row,
      items: itemsByChecklist.get(row.id) ?? [],
      ownerLabel: row.task?.title ?? row.node?.title ?? null,
    }));
  }
);

/**
 * Progress for a checklist, using the same rule as the wizard: completed ÷
 * total, rounded, and 0 for an empty list.
 */
export function checklistProgress(items: ChecklistItem[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((item) => item.is_completed).length;
  return Math.round((done / items.length) * 100);
}

/** Roll every checklist of a project into one figure. */
export function overallChecklistProgress(
  checklists: Array<{ items: ChecklistItem[] }>
): number {
  const all = checklists.flatMap((checklist) => checklist.items);
  return checklistProgress(all);
}