import { getProjects } from "@/lib/dal/projects";
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

  const [projects, tags] = await Promise.all([
    getProjects({ status: params.status && params.status !== "all" ? (params.status as "active") : undefined }),
    getTags(),
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
        initialStatus={params.status ?? "all"}
      />
    </div>
  );
}