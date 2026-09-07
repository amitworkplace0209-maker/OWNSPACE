"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { tagSchema } from "@/lib/schemas";

export type TagFormState = { error?: string; data?: { id: string } };

export async function createTagAction(
  _prevState: TagFormState,
  formData: FormData
): Promise<TagFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = tagSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tags")
    .insert({ ...result.data, user_id: user.id })
    .select("id")
    .single();
  if (error || !data) {
    if ((error?.code ?? "").startsWith("23")) {
      return { error: "A tag with this name already exists." };
    }
    return { error: friendlyError(error, "Could not create the tag.") };
  }

  revalidatePath("/tags");
  return { data: { id: data.id } };
}

export async function updateTagAction(
  tagId: string,
  _prevState: TagFormState,
  formData: FormData
): Promise<TagFormState> {
  const user = await getUserOrRedirect();
  const raw = Object.fromEntries(formData.entries());
  const result = tagSchema.safeParse(raw);
  if (!result.success) {
    return { error: result.error.issues[0]?.message ?? "Please check the form." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .update({ name: result.data.name, color: result.data.color })
    .eq("user_id", user.id)
    .eq("id", tagId);
  if (error) return { error: friendlyError(error, "Could not update the tag.") };

  revalidatePath("/tags");
  return {};
}

export async function deleteTagAction(tagId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();
  const { error } = await supabase.from("tags").delete().eq("user_id", user.id).eq("id", tagId);
  if (error) return { error: friendlyError(error, "Could not delete the tag.") };
  revalidatePath("/tags");
  return {};
}