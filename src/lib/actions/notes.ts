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
    metadata: { title: parsed.data.title },
  });

  revalidatePath("/notes");
  revalidatePath("/dashboard");
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

  revalidatePath("/notes");
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/dashboard");
  return { data: { id: noteId } };
}

export async function deleteNoteAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase.from("notes").delete().eq("user_id", user.id).eq("id", noteId);
  if (error) return { error: friendlyError(error, "Could not delete the note.") };
  revalidatePath("/notes");
  revalidatePath("/dashboard");
  return {};
}

export async function toggleNotePinAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  return toggleNoteFlag(user.id, noteId, "is_pinned", "/notes");
}

export async function toggleNoteFavoriteAction(noteId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  return toggleNoteFlag(user.id, noteId, "is_favorited", "/notes");
}

async function toggleNoteFlag(
  userId: string,
  noteId: string,
  field: "is_pinned" | "is_favorited",
  path: string
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

  revalidatePath(path);
  revalidatePath("/notes");
  return {};
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
  revalidatePath("/notes");
  revalidatePath("/dashboard");
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

  revalidatePath(`/notes/${input.noteId}`);
  revalidatePath("/notes");
  return {};
}