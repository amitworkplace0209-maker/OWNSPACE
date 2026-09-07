"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { wikiPageSchema, parseForm } from "@/lib/schemas";
import { logActivity } from "@/lib/activity";

export type WikiFormState = { error?: string; data?: { id: string; slug: string } };

async function saveVersion(
  userId: string,
  pageId: string,
  content: string
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("wiki_versions")
    .insert({ user_id: userId, wiki_page_id: pageId, content });
}

export async function createWikiPageAction(
  _prevState: WikiFormState,
  formData: FormData
): Promise<WikiFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(wikiPageSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  const projectId = formData.get("project_id") ? String(formData.get("project_id")) : null;
  if (!projectId) return { error: "A project is required." };
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { error: "Project not found." };

  const { data, error } = await supabase
    .from("wiki_pages")
    .insert({ ...parsed.data, user_id: user.id, project_id: projectId })
    .select("id, slug, content")
    .single();
  if (error || !data) {
    if ((error?.code ?? "").startsWith("23")) {
      return { error: "A page with this slug already exists." };
    }
    return { error: friendlyError(error, "Could not create the page.") };
  }

  await saveVersion(user.id, data.id, data.content ?? parsed.data.content ?? "");

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "wiki",
    entityType: "wiki_page",
    entityId: data.id,
    summary: "Created wiki page",
    metadata: { title: parsed.data.title, slug: parsed.data.slug },
  });

  revalidatePath(`/projects/${projectId}/wiki`);
  revalidatePath("/wiki");
  revalidatePath("/dashboard");
  return { data: { id: data.id, slug: data.slug } };
}

export async function updateWikiPageAction(
  pageId: string,
  _prevState: WikiFormState,
  formData: FormData
): Promise<WikiFormState> {
  const user = await getUserOrRedirect();
  const parsed = parseForm(wikiPageSchema, formData);
  if (!parsed.data) return { error: parsed.error };
  const supabase = await createClient();

  // Verify ownership + capture old values
  const { data: existing } = await supabase
    .from("wiki_pages")
    .select("slug, project_id, content")
    .eq("user_id", user.id)
    .eq("id", pageId)
    .maybeSingle();
  if (!existing) return { error: "Page not found." };

  // Record version history before updating
  await saveVersion(user.id, pageId, existing.content ?? "");

  const { error } = await supabase
    .from("wiki_pages")
    .update({ ...parsed.data })
    .eq("user_id", user.id)
    .eq("id", pageId);
  if (error) {
    if ((error?.code ?? "").startsWith("23")) {
      return { error: "A page with this slug already exists." };
    }
    return { error: friendlyError(error, "Could not update the page.") };
  }

  if (existing.project_id) revalidatePath(`/projects/${existing.project_id}/wiki`);
  revalidatePath("/wiki");
  revalidatePath("/dashboard");
  return { data: { id: pageId, slug: parsed.data.slug } };
}

export async function deleteWikiPageAction(pageId: string): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("wiki_pages")
    .select("slug, project_id")
    .eq("user_id", user.id)
    .eq("id", pageId)
    .maybeSingle();
  if (!existing) return { error: "Page not found." };

  const { error } = await supabase.from("wiki_pages").delete().eq("user_id", user.id).eq("id", pageId);
  if (error) return { error: friendlyError(error, "Could not delete the page.") };

  await logActivity({
    userId: user.id,
    projectId: existing.project_id,
    activityType: "wiki",
    entityType: "wiki_page",
    entityId: pageId,
    summary: "Deleted wiki page",
    metadata: { slug: existing.slug },
  });

  if (existing.project_id) revalidatePath(`/projects/${existing.project_id}/wiki`);
  revalidatePath("/wiki");
  revalidatePath("/dashboard");
  return {};
}

export async function restoreWikiPageVersionAction(
  pageId: string,
  versionId: string
): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const [page, version] = await Promise.all([
    supabase
      .from("wiki_pages")
      .select("id, content, project_id")
      .eq("user_id", user.id)
      .eq("id", pageId)
      .maybeSingle(),
    supabase
      .from("wiki_versions")
      .select("content")
      .eq("user_id", user.id)
      .eq("wiki_page_id", pageId)
      .eq("id", versionId)
      .maybeSingle(),
  ]);
  if (!page.data) return { error: "Page not found." };
  if (!version.data) return { error: "Version not found." };

  const nextContent = (version.data as { content: string }).content;
  const previousContent = (page.data as { content: string | null }).content ?? "";
  if (previousContent !== nextContent) {
    await saveVersion(user.id, pageId, previousContent);
  }

  const { error } = await supabase
    .from("wiki_pages")
    .update({ content: nextContent })
    .eq("user_id", user.id)
    .eq("id", pageId);
  if (error) return { error: friendlyError(error, "Could not restore the page version.") };

  const projectId = (page.data as { project_id: string | null }).project_id;
  if (projectId) revalidatePath(`/projects/${projectId}/wiki`);
  revalidatePath("/wiki");
  revalidatePath("/dashboard");
  return {};
}

export async function setWikiTagsAction(input: { pageId: string; tagIds: string[] }): Promise<{ error?: string }> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const { data: ownedTags } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", user.id)
    .in("id", input.tagIds);
  const ownedIds = new Set((ownedTags ?? []).map((t) => t.id));

  const { data: existing } = await supabase
    .from("wiki_tags")
    .select("id, tag_id")
    .eq("user_id", user.id)
    .eq("wiki_page_id", input.pageId);

  const toRemove = (existing ?? []).filter((e) => !ownedIds.has(e.tag_id)).map((e) => e.id);
  const toAdd = [...ownedIds].filter((id) => !(existing ?? []).some((e) => e.tag_id === id));

  if (toRemove.length > 0) {
    const { error } = await supabase.from("wiki_tags").delete().eq("user_id", user.id).in("id", toRemove);
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("wiki_tags")
      .insert(toAdd.map((tagId) => ({ user_id: user.id, wiki_page_id: input.pageId, tag_id: tagId })));
    if (error) return { error: friendlyError(error, "Could not update tags.") };
  }

  revalidatePath("/wiki");
  return {};
}