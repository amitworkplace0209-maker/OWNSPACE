import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { getTagsWithUsage } from "@/lib/dal/tags";
import { PageHeader } from "@/components/shared/page-header";
import { TagsWorkspace } from "@/components/tags/tags-workspace";

export const metadata: Metadata = {
  title: "Tags",
};

export default async function TagsPage() {
  await requireUser();
  const tags = await getTagsWithUsage();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tags" description="Create and manage the tags used across your projects, tasks, notes and wiki." />
      <TagsWorkspace tags={tags} />
    </div>
  );
}