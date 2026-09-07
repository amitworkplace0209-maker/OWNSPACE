"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { commentSchema } from "@/lib/schemas";

export type CommentFormState = { error?: string };

export async function addCommentAction(
  taskId: string,
  _prevState: CommentFormState,
  formData: FormData
): Promise<CommentFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = commentSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { data: task } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("user_id", user.id)
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return { error: "Task not found." };

  const { error } = await supabase
    .from("task_comments")
    .insert({ ...result.data, user_id: user.id, task_id: taskId });
  if (error) return { error: friendlyError(error, "Could not add comment.") };

  revalidatePath(`/projects/${task.project_id}/tasks`);
  revalidatePath("/tasks");
  return {};
}

export async function deleteCommentAction(commentId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("task_comments")
    .select("task_id, tasks(project_id)")
    .eq("user_id", user.id)
    .eq("id", commentId)
    .maybeSingle();
  if (!existing?.tasks) return { error: "Comment not found." };

  const projectId = (existing.tasks as unknown as { project_id: string }).project_id;

  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("user_id", user.id)
    .eq("id", commentId);
  if (error) return { error: friendlyError(error, "Could not delete comment.") };

  revalidatePath(`/projects/${projectId}/tasks`);
  revalidatePath("/tasks");
  return {};
}