"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError, createAdminClient } from "@/lib/actions/helpers";
import { profileSchema, preferencesSchema, parseForm } from "@/lib/schemas";

export type ProfileFormState = { error?: string; data?: { id: string } };

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(profileSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: parsed.data.display_name || null,
      username: parsed.data.username || null,
    })
    .eq("id", user.id);
  if (error) {
    if ((error?.code ?? "").startsWith("23")) {
      return { error: "That username is already taken." };
    }
    return { error: friendlyError(error, "Could not update your profile.") };
  }

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { data: { id: user.id } };
}

export async function updateAvatarAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const user = await getUserOrRedirect();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return {};
  if (file.size > 2 * 1024 * 1024) return { error: "Avatar must be under 2 MB." };

  const supabase = await createClient();
  const { data: userMeta } = await supabase.auth.getUser();
  if (!userMeta?.user) return { error: "Please sign in again." };
  const email = userMeta.user.email ?? "";
  const safeEmail = email.replace(/[^a-zA-Z0-9]/g, "_");
  const path = `${user.id}/${safeEmail}_${Date.now()}.${file.name.split(".").pop() ?? "png"}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from("ownspece-files")
    .upload(path, bytes, { contentType: file.type || "image/png", upsert: false });
  if (uploadErr) return { error: friendlyError(uploadErr, "Could not upload the avatar.") };

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", user.id);
  if (updateErr) return { error: friendlyError(updateErr, "Could not update your avatar.") };

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { data: { id: user.id } };
}

export async function updatePreferencesAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(preferencesSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createAdminClient();

  // Patch semantics: only fields present in the form data are written, so
  // partial updates (e.g. changing only the theme or only an accent) can never
  // clobber unrelated preferences.
  const rawEntries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  // Coerce empty-string daily_note_time (invalid Postgres time type) to null.
  const entries = rawEntries.map(([k, v]) =>
    k === "daily_note_time" && v === "" ? [k, null] : [k, v]
  );
  const payload = Object.fromEntries(entries);

  const { error } = await supabase
    .from("user_preferences")
    .update(payload)
    .eq("user_id", user.id);
  if (error) {
    return { error: friendlyError(error, "Could not update preferences.") };
  }

  revalidatePath("/settings");
  revalidatePath("/profile");
  return { data: { id: user.id } };
}

const THEMES = ["light", "dark", "amoled", "system"] as const;

export async function setThemeAction(theme: string): Promise<void> {
  const user = await getUserOrRedirect();
  if (!(THEMES as readonly string[]).includes(theme)) return;
  const supabase = await createClient();
  await supabase
    .from("user_preferences")
    .update({ theme })
    .eq("user_id", user.id);
  revalidatePath("/settings");
}