import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { getProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { ArchiveWorkspace } from "@/components/archive/archive-workspace";

export const metadata: Metadata = {
  title: "Archive",
};

export default async function ArchivePage() {
  await requireUser();
  const projects = await getProjects({ status: "archived" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Archive" description="Restore or permanently delete archived projects." />
      <ArchiveWorkspace projects={projects} />
    </div>
  );
}