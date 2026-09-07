import { getProject } from "@/lib/dal/projects";
import { getRecentActivity } from "@/lib/dal/calendar";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityList } from "@/components/shared/activity-list";

export const metadata = {
  title: "Project activity",
};

export default async function ProjectActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const project = await getProject(id);
  const activity = await getRecentActivity({ projectId: id, limit: 60 });

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader title="Activity" description={`Everything that happened in ${project.name}.`} />
      <div className="rounded-xl border bg-card">
        <ActivityList activities={activity} />
      </div>
    </div>
  );
}