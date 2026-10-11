import { getProjects } from "@/lib/dal/projects";
import { getFiles } from "@/lib/dal/time-files";
import { getTags } from "@/lib/dal/tags";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";

export const metadata = {
  title: "Projects",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; new?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [projects, tags, files] = await Promise.all([
    getProjects(),
    getTags(),
    // Step 10 can only attach files that already exist in storage, so the
    // picker needs the list up front.
    getFiles({ limit: 200 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Your work, organized into projects."
      />
      <ProjectsWorkspace
        projects={projects}
        tags={tags}
        files={files.map((file) => ({
          id: file.id,
          name: file.name,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
        }))}
        initialStatus={params.status ?? "all"}
        openWizard={params.new === "1"}
      />
    </div>
  );
}