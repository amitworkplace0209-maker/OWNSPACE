import { getAllResources, getResourceTargets } from "@/lib/dal/resources";
import { getGDriveConnections } from "@/lib/dal/gdrive";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { ResourcesWorkspace } from "@/components/resources/resources-workspace";

export const metadata = {
  title: "Resources",
};

/**
 * Resources.
 *
 * Every attachment in the workspace in one list: files in Supabase Storage,
 * files referenced from Google Drive, and links — each carrying the project,
 * task or note it is attached to. Reads three tables in parallel and never
 * merges them, so a delete still knows which one owns the row.
 */
export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [resources, targets, driveAccounts] = await Promise.all([
    getAllResources(),
    getResourceTargets(),
    getGDriveConnections(),
  ]);

  const projectId =
    params.project && targets.projects.some((project) => project.id === params.project)
      ? params.project
      : null;

  const scoped = projectId
    ? resources.filter((item) => item.projectId === projectId)
    : resources;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Resources"
        description="Every file, Drive reference and link across your projects — and what each one is attached to."
      />
      <ResourcesWorkspace
        resources={scoped}
        projects={targets.projects}
        tasks={targets.tasks}
        driveAccounts={driveAccounts}
      />
    </div>
  );
}