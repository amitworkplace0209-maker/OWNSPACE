"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { logActivity } from "@/lib/activity";
import { PRIORITIES, TASK_STATUSES } from "@/types";

export type BulkResult = { error?: string; affected?: number };

/** Postgres has no sane parameter limit for `.in()`; chunk to stay well under. */
const CHUNK = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Bulk status change.
 *
 * Marks a task done or finished at 100% in the same update, because a `done`
 * task sitting at 0% progress would render as an empty progress bar on every
 * dashboard and contradict itself.
 *
 * Ownership is re-checked against the caller's own rows before writing — a
 * crafted id list must not be able to touch another account's tasks.
 */
export async function bulkSetTaskStatusAction(
  ids: string[],
  status: string
): Promise<BulkResult> {
  const user = await getUserOrRedirect();
  if (ids.length === 0) return { affected: 0 };

  if (!(TASK_STATUSES as readonly string[]).includes(status)) {
    return { error: "Unknown status." };
  }

  const supabase = await createClient();
  let affected = 0;

  for (const batch of chunk(ids, CHUNK)) {
    const { data, error } = await supabase
      .from("tasks")
      .update({
        status,
        ...(status === "done" ? { progress: 100 } : {}),
      })
      .eq("user_id", user.id)
      .in("id", batch)
      .select("id, project_id");

    if (error) return { error: friendlyError(error, "Could not update those tasks.") };
    affected += data?.length ?? 0;
  }

  if (affected > 0) {
    await logActivity({
      userId: user.id,
      activityType: "task",
      entityType: "task",
      entityId: null,
      summary: `Moved ${affected} task${affected === 1 ? "" : "s"} to ${status.replace("_", " ")}`,
      metadata: { status, count: affected },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { affected };
}

export async function bulkSetTaskPriorityAction(
  ids: string[],
  priority: string
): Promise<BulkResult> {
  const user = await getUserOrRedirect();
  if (ids.length === 0) return { affected: 0 };

  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    return { error: "Unknown priority." };
  }

  const supabase = await createClient();
  let affected = 0;

  for (const batch of chunk(ids, CHUNK)) {
    const { data, error } = await supabase
      .from("tasks")
      .update({ priority })
      .eq("user_id", user.id)
      .in("id", batch)
      .select("id");

    if (error) return { error: friendlyError(error, "Could not update those tasks.") };
    affected += data?.length ?? 0;
  }

  revalidatePath("/tasks");
  return { affected };
}

/**
 * Bulk delete.
 *
 * `checklist_items` only cascades when the *task* is deleted, and
 * `task_dependencies` cascades too — so one delete is enough and no manual
 * cleanup is needed.
 */
export async function bulkDeleteTasksAction(ids: string[]): Promise<BulkResult> {
  const user = await getUserOrRedirect();
  if (ids.length === 0) return { affected: 0 };

  const supabase = await createClient();
  let affected = 0;

  for (const batch of chunk(ids, CHUNK)) {
    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("user_id", user.id)
      .in("id", batch)
      .select("id");

    if (error) return { error: friendlyError(error, "Could not delete those tasks.") };
    affected += data?.length ?? 0;
  }

  if (affected > 0) {
    await logActivity({
      userId: user.id,
      activityType: "task",
      entityType: "task",
      entityId: null,
      summary: `Deleted ${affected} task${affected === 1 ? "" : "s"}`,
      metadata: { count: affected },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { affected };
}

/** Deletes tasks that are already finished — used by the "Clear completed" action. */
export async function clearCompletedTasksAction(): Promise<BulkResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("user_id", user.id)
    .in("status", ["done", "cancelled"])
    .select("id");

  if (error) return { error: friendlyError(error, "Could not clear completed tasks.") };

  const affected = data?.length ?? 0;
  if (affected > 0) {
    await logActivity({
      userId: user.id,
      activityType: "task",
      entityType: "task",
      entityId: null,
      summary: `Cleared ${affected} completed task${affected === 1 ? "" : "s"}`,
      metadata: { count: affected },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  return { affected };
}