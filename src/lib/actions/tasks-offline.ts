"use server";

/**
 * Server-side replay for whole-row task writes made while offline.
 *
 * The client keeps the exact row it wants in IndexedDB, including the uuid it
 * generated. That id is the idempotency key: replaying a create twice upserts
 * the same row, and replaying an update or delete twice is harmless because the
 * second attempt simply finds no newer row to change.
 *
 * Everything is scoped twice — by the session user and by RLS — so a cached row
 * can never be used to write into somebody else's workspace.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { taskSchema } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";
import type { QueuedWrite } from "@/lib/offline/task-cache";

export type TaskWriteResult = { error?: string; data?: { id: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only these columns may come from a queued client write. */
const ALLOWED = new Set([
  "title",
  "description",
  "status",
  "priority",
  "progress",
  "start_date",
  "due_date",
  "reminder_at",
  "project_id",
  "phase_id",
  "parent_task_id",
  "sort_order",
  "estimated_minutes",
]);

function whitelist(patch: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED.has(key)) clean[key] = value;
  }
  return clean;
}

function formFrom(values: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    form.append(key, String(value));
  }
  return form;
}

export async function replayTaskWriteAction(write: QueuedWrite): Promise<TaskWriteResult> {
  if (!write || !UUID.test(write.taskId)) {
    return { error: "This offline change has an invalid task id." };
  }
  if (write.op !== "create" && write.op !== "update" && write.op !== "delete") {
    return { error: "Unsupported offline change." };
  }

  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const clean = whitelist(write.patch ?? {});

  if (write.op === "delete") {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", write.taskId)
      .eq("user_id", user.id);
    if (error) return { error: friendlyError(error, "Could not delete the offline task.") };
    revalidatePath("/tasks");
    revalidatePath("/dashboard");
    return { data: { id: write.taskId } };
  }

  // A whole-row create/update must satisfy the same rules as the normal form.
  const parsed = taskSchema.safeParse(Object.fromEntries(formFrom(clean)));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "This offline task is invalid." };
  }

  const extras: Record<string, unknown> = {};
  for (const key of ["start_date", "parent_task_id", "sort_order", "estimated_minutes"]) {
    if (clean[key] !== undefined && clean[key] !== null && clean[key] !== "") {
      extras[key] = clean[key];
    }
  }

  const row = {
    ...parsed.data,
    ...extras,
    id: write.taskId,
    user_id: user.id,
  };

  if (write.op === "create") {
    const { error } = await supabase.from("tasks").upsert(row, { onConflict: "id" });
    if (error) return { error: friendlyError(error, "Could not sync the offline task.") };
  } else {
    const { data: existing, error: lookupError } = await supabase
      .from("tasks")
      .select("project_id")
      .eq("id", write.taskId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError || !existing) return { error: "Task not found." };

    const { error } = await supabase
      .from("tasks")
      .update(row)
      .eq("id", write.taskId)
      .eq("user_id", user.id);
    if (error) return { error: friendlyError(error, "Could not sync the offline task.") };
  }

  await logActivity({
    userId: user.id,
    projectId: parsed.data.project_id,
    activityType: "task",
    entityType: "task",
    entityId: write.taskId,
    summary: write.op === "create" ? "Created task offline" : "Updated task offline",
    metadata: { title: parsed.data.title, syncedAt: new Date().toISOString() },
  });

  const projectId = parsed.data.project_id;
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${projectId}`);
  return { data: { id: write.taskId } };
}
