"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { taskSchema } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";
import type { Priority, TaskStatus } from "@/types";

export type TaskFormState = { error?: string; data?: { id: string } };

const TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "done", "cancelled"];
const PRIORITIES: Priority[] = ["none", "low", "medium", "high", "urgent"];

export async function createTaskAction(
  _prevState: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = taskSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...result.data, user_id: user.id })
    .select("id")
    .single();

  if (error || !data) {
    return { error: friendlyError(error, "Could not create the task.") };
  }

  await logActivity({
    userId: user.id,
    projectId: result.data.project_id,
    activityType: "task",
    entityType: "task",
    entityId: data.id,
    summary: "Created task",
    metadata: { title: result.data.title },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${result.data.project_id}`);
  return { data: { id: data.id } };
}

export async function updateTaskAction(
  taskId: string,
  _prevState: TaskFormState,
  formData: FormData
): Promise<TaskFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = taskSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Task not found." };

  const { error } = await supabase
    .from("tasks")
    .update({ ...result.data })
    .eq("user_id", user.id)
    .eq("id", taskId);

  if (error) return { error: friendlyError(error, "Could not update the task.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "task",
    entityType: "task",
    entityId: taskId,
    summary: "Updated task",
    metadata: { title: result.data.title },
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${existing.project_id}`);
  return { data: { id: taskId } };
}

export async function deleteTaskAction(taskId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("tasks")
    .select("project_id, title")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Task not found." };

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("user_id", user.id)
    .eq("id", taskId);
  if (error) return { error: friendlyError(error, "Could not delete the task.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "task",
    entityType: "task",
    entityId: taskId,
    summary: "Deleted task",
  });

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function setTaskStatusAction(taskId: string, status: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  if (!TASK_STATUSES.includes(status as TaskStatus)) {
    return { error: "Invalid task status." };
  }

  const supabase = await createClient();

  // compute progress automatically for done status
  const patch: Record<string, string | number> = { status };
  if (status === "done") patch.progress = 100;
  if (status === "todo") patch.progress = 0;

  const { data: existing, error: existingErr } = await supabase
    .from("tasks")
    .select("project_id, title, progress")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Task not found." };

  const { error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("user_id", user.id)
    .eq("id", taskId);
  if (error) return { error: friendlyError(error, "Could not update status.") };

  if (status === "done") {
    await logActivity({
      userId: user.id,
      projectId: existing.project_id,
      activityType: "task",
      entityType: "task",
      entityId: taskId,
      summary: "Completed task",
      metadata: { title: existing.title },
    });
  }

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function setTaskProgressAction(taskId: string, progress: number): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const clamped = Math.max(0, Math.min(100, Math.round(progress)));
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Task not found." };

  const { error } = await supabase
    .from("tasks")
    .update({ progress: clamped })
    .eq("user_id", user.id)
    .eq("id", taskId);
  if (error) return { error: friendlyError(error, "Could not update progress.") };

  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

export async function setTaskPriorityAction(taskId: string, priority: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  if (!PRIORITIES.includes(priority as Priority)) {
    return { error: "Invalid priority." };
  }
  const supabase = await createClient();

  const { data: existing, error: existingErr } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (existingErr || !existing) return { error: "Task not found." };

  const { error } = await supabase
    .from("tasks")
    .update({ priority })
    .eq("user_id", user.id)
    .eq("id", taskId);
  if (error) return { error: friendlyError(error, "Could not update priority.") };

  revalidatePath("/tasks");
  revalidatePath(`/projects/${existing.project_id}`);
  return {};
}

async function couldCreateCycle(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  start: string,
  target: string
): Promise<boolean> {
  // Returns true if adding `target -> start` (start depends on target) would
  // create a cycle, i.e. there is already a dependency chain start -> ... -> target.
  const visited = new Set<string>();
  const stack = [start];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const { data: deps } = await supabase
      .from("task_dependencies")
      .select("depends_on_task_id")
      .eq("user_id", userId)
      .eq("task_id", current);
    for (const d of deps ?? []) stack.push(d.depends_on_task_id);
  }
  return false;
}

export async function addTaskDependencyAction(
  taskId: string,
  dependsOnTaskId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  if (taskId === dependsOnTaskId) return { error: "A task cannot depend on itself." };

  const supabase = await createClient();

  // Both tasks must belong to the user (RLS also enforces this on insert).
  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, project_id")
    .eq("user_id", user.id)
    .in("id", [taskId, dependsOnTaskId]);
  if ((tasks ?? []).length !== 2) return { error: "Task not found." };

  if (await couldCreateCycle(supabase, user.id, taskId, dependsOnTaskId)) {
    return { error: "This would create a circular dependency." };
  }

  const taskProject = (tasks ?? []).find((t) => t.id === taskId)?.project_id ?? null;

  const { error } = await supabase.from("task_dependencies").insert({
    user_id: user.id,
    task_id: taskId,
    depends_on_task_id: dependsOnTaskId,
  });
  if (error) {
    if ((error.code ?? "").startsWith("23")) {
      return { error: "This dependency already exists." };
    }
    return { error: friendlyError(error, "Could not add dependency.") };
  }

  const { data: depTask } = await supabase
    .from("tasks")
    .select("title")
    .eq("user_id", user.id)
    .eq("id", dependsOnTaskId)
    .single();

  await logActivity({
    userId: user.id,
    projectId: taskProject ?? null,
    activityType: "task",
    entityType: "task",
    entityId: taskId,
    summary: `Added dependency on “${depTask?.title ?? "task"}”`,
    metadata: { depends_on: dependsOnTaskId },
  });

  revalidatePath(`/projects/${taskProject ?? ""}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function removeTaskDependencyAction(
  taskId: string,
  dependsOnTaskId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("user_id", user.id)
    .eq("task_id", taskId)
    .eq("depends_on_task_id", dependsOnTaskId);
  if (error) return { error: friendlyError(error, "Could not remove dependency.") };

  revalidatePath("/tasks");
  revalidatePath(`/projects/${dependsOnTaskId}`);
  return {};
}

export async function setTaskTagsAction(input: { taskId: string; tagIds: string[] }): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: ownedTags } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", user.id)
    .in("id", input.tagIds);
  const ownedIds = new Set((ownedTags ?? []).map((t) => t.id));

  const { data: existing } = await supabase
    .from("task_tags")
    .select("id, tag_id")
    .eq("user_id", user.id)
    .eq("task_id", input.taskId);

  const toRemove = (existing ?? []).filter((e) => !ownedIds.has(e.tag_id)).map((e) => e.id);
  const toAdd = [...ownedIds].filter((id) => !(existing ?? []).some((e) => e.tag_id === id));

  if (toRemove.length > 0) {
    const { error } = await supabase.from("task_tags").delete().eq("user_id", user.id).in("id", toRemove);
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("task_tags")
      .insert(toAdd.map((tagId) => ({ user_id: user.id, task_id: input.taskId, tag_id: tagId })));
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }

  revalidatePath("/tasks");
  return {};
}