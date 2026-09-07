"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { checklistSchema, checklistItemSchema } from "@/lib/schemas";

type ChecklistRow = { id: string; task_id: string };
type ChecklistItemRow = { id: string; checklist_id: string };

export type ChecklistFormState = { error?: string };

type DbClient = Awaited<ReturnType<typeof createClient>>;

async function getTaskProject(
  supabase: DbClient,
  userId: string,
  taskId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("user_id", userId)
    .eq("id", taskId)
    .maybeSingle();
  return data?.project_id ?? null;
}

export async function addChecklistAction(
  taskId: string,
  _prevState: ChecklistFormState,
  formData: FormData
): Promise<ChecklistFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = checklistSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();
  const projectId = await getTaskProject(supabase, user.id, taskId);
  if (projectId === null) return { error: "Task not found." };

  const { count } = await supabase
    .from("checklists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("task_id", taskId);
  const sort_order = count ?? 0;

  const { error } = await supabase
    .from("checklists")
    .insert([{ ...result.data, user_id: user.id, task_id: taskId, sort_order }]);
  if (error) return { error: friendlyError(error, "Could not add checklist.") };

  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function updateChecklistAction(
  checklistId: string,
  _prevState: ChecklistFormState,
  formData: FormData
): Promise<ChecklistFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = checklistSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("checklists")
    .select("task_id")
    .eq("user_id", user.id)
    .eq("id", checklistId)
    .maybeSingle();
  if (!existing) return { error: "Checklist not found." };

  const { error } = await supabase
    .from("checklists")
    .update({ title: result.data.title })
    .eq("user_id", user.id)
    .eq("id", checklistId);
  if (error) return { error: friendlyError(error, "Could not update checklist.") };

  const projectId = await getTaskProject(supabase, user.id, existing.task_id);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function deleteChecklistAction(checklistId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("checklists")
    .select("task_id")
    .eq("user_id", user.id)
    .eq("id", checklistId)
    .maybeSingle();
  if (!existing) return { error: "Checklist not found." };

  const { error } = await supabase.from("checklists").delete().eq("user_id", user.id).eq("id", checklistId);
  if (error) return { error: friendlyError(error, "Could not delete checklist.") };

  const projectId = await getTaskProject(supabase, user.id, existing.task_id);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

function parseChecklistItem(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const result = checklistItemSchema.safeParse(raw);
  if (!result.success) return { error: result.error.issues[0]?.message ?? "Please check the form." };
  return { data: result.data };
}

export async function addChecklistItemAction(
  checklistId: string,
  _prevState: ChecklistFormState,
  formData: FormData
): Promise<ChecklistFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseChecklistItem(formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("checklists")
    .select("task_id")
    .eq("user_id", user.id)
    .eq("id", checklistId)
    .maybeSingle();
  if (!existing) return { error: "Checklist not found." };

  const { count } = await supabase
    .from("checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("checklist_id", checklistId);
  const sort_order = count ?? 0;

  const { error } = await supabase.from("checklist_items").insert({
    ...parsed.data,
    user_id: user.id,
    checklist_id: checklistId,
    sort_order,
  });
  if (error) return { error: friendlyError(error, "Could not add item.") };

  const projectId = await getTaskProject(supabase, user.id, existing.task_id);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function toggleChecklistItemAction(checklistItemId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("checklist_items")
    .select("checklist_id, is_completed, checklists(task_id)")
    .eq("user_id", user.id)
    .eq("id", checklistItemId)
    .maybeSingle();
  if (!existing?.checklists) return { error: "Item not found." };

  const next = !existing.is_completed;
  const { error } = await supabase
    .from("checklist_items")
    .update({ is_completed: next, completed_at: next ? new Date().toISOString() : null })
    .eq("user_id", user.id)
    .eq("id", checklistItemId);
  if (error) return { error: friendlyError(error, "Could not update item.") };

  const taskId = (existing.checklists as unknown as { task_id: string }).task_id;
  const projectId = await getTaskProject(supabase, user.id, taskId);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function deleteChecklistItemAction(checklistItemId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("checklist_items")
    .select("checklist_id, checklists(task_id)")
    .eq("user_id", user.id)
    .eq("id", checklistItemId)
    .maybeSingle();
  if (!existing?.checklists) return { error: "Item not found." };

  const { error } = await supabase.from("checklist_items").delete().eq("user_id", user.id).eq("id", checklistItemId);
  if (error) return { error: friendlyError(error, "Could not delete item.") };

  const taskId = (existing.checklists as unknown as { task_id: string }).task_id;
  const projectId = await getTaskProject(supabase, user.id, taskId);
  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function reorderChecklistItemsAction(items: ChecklistItemRow[]): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: owned } = await supabase
    .from("checklist_items")
    .select("id")
    .eq("user_id", user.id)
    .in("id", items.map((i) => i.id));
  if ((owned?.length ?? 0) !== items.length) return { error: "Access denied." };

  const patch = items.map((item, index) => ({ ...item, sort_order: index }));
  const { error } = await supabase.from("checklist_items").upsert(patch);
  if (error) return { error: friendlyError(error, "Could not reorder items.") };
  return {};
}

export async function reorderChecklistsAction(items: ChecklistRow[]): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: owned } = await supabase
    .from("checklists")
    .select("id")
    .eq("user_id", user.id)
    .in("id", items.map((c) => c.id));
  if ((owned?.length ?? 0) !== items.length) return { error: "Access denied." };

  const patch = items.map((checklist, index) => ({ ...checklist, sort_order: index }));
  const { error } = await supabase.from("checklists").upsert(patch);
  if (error) return { error: friendlyError(error, "Could not reorder checklists.") };
  return {};
}