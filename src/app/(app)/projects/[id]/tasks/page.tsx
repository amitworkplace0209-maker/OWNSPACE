import { getProject } from "@/lib/dal/projects";
import { getTasks } from "@/lib/dal/tasks";
import { getPhases } from "@/lib/dal/phases-milestones";
import { TASK_STATUSES } from "@/types";
import { PageHeader } from "@/components/shared/page-header";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export const metadata = {
  title: "Project tasks",
};

export default async function ProjectTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; due?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const project = await getProject(id);
  const [tasks, phases] = await Promise.all([
    getTasks({ projectId: id, sort: "due" }),
    getPhases(id),
  ]);

  const status = TASK_STATUSES.includes(sp.status as (typeof TASK_STATUSES)[number])
    ? (sp.status as string)
    : "all";
  const due = ["today", "upcoming", "overdue", "none"].includes(sp.due ?? "")
    ? (sp.due as string)
    : "";

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader title="Tasks" description={`All tasks in ${project.name}.`} />
      <TasksWorkspace
        tasks={tasks}
        projects={[project]}
        phases={phases}
        initialStatus={status}
        initialDue={due}
        initialProjectId={project.id}
        readOnly={project.status === "archived"}
      />
    </div>
  );
}