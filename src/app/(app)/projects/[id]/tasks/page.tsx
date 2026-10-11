import { getProject } from "@/lib/dal/projects";
import { getSubtaskProgress, getTaskStats, getTasks } from "@/lib/dal/tasks";
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
  const [tasks, stats, phases] = await Promise.all([
    getTasks({ projectId: id, sort: "due" }),
    getTaskStats({ projectId: id }),
    getPhases(id),
  ]);

  const parentIds = tasks
    .filter((task) => tasks.some((other) => other.parent_task_id === task.id))
    .map((task) => task.id);
  const subtaskProgress = await getSubtaskProgress(parentIds);

  const status = TASK_STATUSES.includes(sp.status as (typeof TASK_STATUSES)[number])
    ? (sp.status as string)
    : "all";
  const due = ["today", "upcoming", "overdue", "no-date"].includes(sp.due ?? "")
    ? (sp.due as string)
    : "";

  return (
    <div className="flex flex-col gap-4 py-4">
      <PageHeader title="Tasks" description={`All tasks in ${project.name}.`} />
      <TasksWorkspace
        tasks={tasks}
        stats={stats}
        projects={[project]}
        phases={phases}
        subtaskProgress={subtaskProgress}
        initialStatus={status}
        initialDue={due}
        initialProjectId={project.id}
        readOnly={project.status === "archived"}
      />
    </div>
  );
}