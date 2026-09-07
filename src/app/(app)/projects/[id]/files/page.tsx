import { getProject } from "@/lib/dal/projects";
import { getFiles } from "@/lib/dal/time-files";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { FileManager } from "@/components/files/file-manager";

export const metadata = {
  title: "Project files",
};

export default async function ProjectFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const project = await getProject(id);
  const files = await getFiles({ projectId: id });

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader title="Files" description={`Documents and attachments in ${project.name}.`} />
      <FileManager projectId={project.id} files={files} readOnly={project.status === "archived"} />
    </div>
  );
}