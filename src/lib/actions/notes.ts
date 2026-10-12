"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { noteSchema, parseForm } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type NoteFormState = { error?: string; data?: { id: string } };

export async function createNoteAction(
  _prevState: NoteFormState,
  formData: FormData
): Promise<NoteFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(noteSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .insert({ ...parsed.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: friendlyError(error, "Could not create the note.") };

  await logActivity({
    userId: user.id,
    activityType: "note",
    entityType: "note",
    entityId: data.id,
    summary: "Created note",
    metadata: { title: parsed.data.title, projectId: parsed.data.project_id },
  });

  revalidateNotePaths(data.id);
  return { data: { id: data.id } };
}

export async function updateNoteAction(
  noteId: string,
  _prevState: NoteFormState,
  formData: FormData
): Promise<NoteFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(noteSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("notes")
    .select("content")
    .eq("user_id", user.id)
    .eq("id", noteId)
    .maybeSingle();
  if (!existing) return { error: "Note not found." };

  const previousContent = (existing as { content: string | null }).content ?? "";
  const nextContent = parsed.data.content ?? "";
  if (previousContent !== nextContent) {
    await supabase
      .from("note_versions")
      .insert({ user_id: user.id, note_id: noteId, content: previousContent });
  }

  const { error } = await supabase
    .from("notes")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", noteId);
  if (error) return { error: friendlyError(error, "Could not update the note.") };

  await logActivity({
    userId: user.id,
    activityType: "note",
    entityType: "note",
    entityId: noteId,
    summary: "Updated note",
    metadata: { title: parsed.data.title },
  });

  revalidateNotePaths(noteId);
  return { data: { id: noteId } };
}

export async function deleteNoteAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("user_id", user.id).eq("id", noteId);
  if (error) return { error: friendlyError(error, "Could not delete the note.") };

  await logActivity({
    userId: user.id,
    activityType: "note",
    entityType: "note",
    entityId: noteId,
    summary: "Deleted note",
  });

  revalidateNotePaths(noteId);
  return {};
}

/**
 * Notes are read by four places — the list, the detail page, the dashboard card
 * and the project's notes tab — so a mutation that only revalidates `/notes`
 * leaves the other three showing a note that has moved.
 *
 * The command palette is deliberately absent: it searches on demand from the
 * browser, so there is no server render to invalidate, and revalidating a route
 * that no longer exists is a no-op that reads like it is doing something.
 */
function revalidateNotePaths(noteId?: string): void {
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  revalidatePath("/projects", "layout");
  if (noteId) revalidatePath(`/notes/${noteId}`);
}

export async function toggleNotePinAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  return toggleNoteFlag(user.id, noteId, "is_pinned");
}

export async function toggleNoteFavoriteAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  return toggleNoteFlag(user.id, noteId, "is_favorited");
}

async function toggleNoteFlag(
  userId: string,
  noteId: string,
  field: "is_pinned" | "is_favorited"
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select(field)
    .eq("user_id", userId)
    .eq("id", noteId)
    .maybeSingle();
  if (!data) return { error: "Note not found." };

  const current = (data as unknown as Record<string, boolean>)[field];

  const { error } = await supabase
    .from("notes")
    .update({ [field]: !current })
    .eq("user_id", userId)
    .eq("id", noteId);
  if (error) return { error: friendlyError(error, "Could not update the note.") };

  // The dashboard's "Recent notes" card renders is_pinned, so /dashboard has
  // to be revalidated too — it previously was not.
  revalidateNotePaths(noteId);
  return {};
}

export type NoteBulkResult = { error?: string; affected?: number };

/**
 * Bulk actions for the notes grid.
 *
 * `moveToProject` takes a project id or null for "personal"; clearing a
 * project deliberately nulls it rather than deleting the notes.
 */
export async function bulkSetNotesPinnedAction(
  noteIds: string[],
  pinned: boolean
): Promise<NoteBulkResult> {
  const user = await getUserOrRedirect();
  if (noteIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("notes")
    .update({ is_pinned: pinned })
    .eq("user_id", user.id)
    .in("id", noteIds);
  if (error) return { error: friendlyError(error, "Could not update the notes.") };

  revalidateNotePaths();
  return { affected: noteIds.length };
}

export async function bulkSetNotesFavoritedAction(
  noteIds: string[],
  favorited: boolean
): Promise<NoteBulkResult> {
  const user = await getUserOrRedirect();
  if (noteIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("notes")
    .update({ is_favorited: favorited })
    .eq("user_id", user.id)
    .in("id", noteIds);
  if (error) return { error: friendlyError(error, "Could not update the notes.") };

  revalidateNotePaths();
  return { affected: noteIds.length };
}

/**
 * Moves notes into a project, or back to personal when `projectId` is null.
 *
 * `node_id` is cleared alongside, because a section belongs to the project it
 * was picked from and leaving it behind would file the note under a section of
 * a project it no longer belongs to.
 */
export async function bulkMoveNotesAction(
  noteIds: string[],
  projectId: string | null
): Promise<NoteBulkResult> {
  const user = await getUserOrRedirect();
  if (noteIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const patch: Record<string, unknown> = { project_id: projectId, node_id: null };

  if (projectId) {
    const { data: owned } = await supabase
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .eq("id", projectId)
      .maybeSingle();
    if (!owned) return { error: "Project not found." };
  }

  const { error } = await supabase
    .from("notes")
    .update(patch)
    .eq("user_id", user.id)
    .in("id", noteIds);
  if (error) return { error: friendlyError(error, "Could not move the notes.") };

  revalidateNotePaths();
  return { affected: noteIds.length };
}

export async function bulkDeleteNotesAction(noteIds: string[]): Promise<NoteBulkResult> {
  const user = await getUserOrRedirect();
  if (noteIds.length === 0) return { affected: 0 };
  const supabase = await createClient();

  const { error } = await supabase
    .from("notes")
    .delete()
    .eq("user_id", user.id)
    .in("id", noteIds);
  if (error) return { error: friendlyError(error, "Could not delete the notes.") };

  revalidateNotePaths();
  return { affected: noteIds.length };
}

export async function restoreNoteVersionAction(
  noteId: string,
  versionId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const [note, version] = await Promise.all([
    supabase
      .from("notes")
      .select("id, content")
      .eq("user_id", user.id)
      .eq("id", noteId)
      .maybeSingle(),
    supabase
      .from("note_versions")
      .select("content")
      .eq("user_id", user.id)
      .eq("note_id", noteId)
      .eq("id", versionId)
      .maybeSingle(),
  ]);
  if (!note.data) return { error: "Note not found." };
  if (!version.data) return { error: "Version not found." };

  const nextContent = (version.data as { content: string }).content;
  const previousContent = (note.data as { content: string | null }).content ?? "";
  if (previousContent !== nextContent) {
    await supabase
      .from("note_versions")
      .insert({ user_id: user.id, note_id: noteId, content: previousContent });
  }

  const { error } = await supabase
    .from("notes")
    .update({ content: nextContent })
    .eq("user_id", user.id)
    .eq("id", noteId);
  if (error) return { error: friendlyError(error, "Could not restore the note version.") };

  revalidatePath(`/notes/${noteId}`);
  revalidateNotePaths(noteId);
  return {};
}

export async function setNoteTagsAction(input: { noteId: string; tagIds: string[] }): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: ownedTags } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", user.id)
    .in("id", input.tagIds);
  const ownedIds = new Set((ownedTags ?? []).map((t) => t.id));

  const { data: existing } = await supabase
    .from("note_tags")
    .select("id, tag_id")
    .eq("user_id", user.id)
    .eq("note_id", input.noteId);

  const toRemove = (existing ?? []).filter((e) => !ownedIds.has(e.tag_id)).map((e) => e.id);
  const toAdd = [...ownedIds].filter((id) => !(existing ?? []).some((e) => e.tag_id === id));

  if (toRemove.length > 0) {
    const { error } = await supabase.from("note_tags").delete().eq("user_id", user.id).in("id", toRemove);
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("note_tags")
      .insert(toAdd.map((tagId) => ({ user_id: user.id, note_id: input.noteId, tag_id: tagId })));
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }

  // /tags shows per-tag note counts, so editing a note's tags changes that page.
  revalidatePath("/tags");
  revalidateNotePaths(input.noteId);
  return {};
}