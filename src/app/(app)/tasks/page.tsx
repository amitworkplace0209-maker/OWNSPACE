import { getTasks } from "@/lib/dal/tasks";
import { getActiveProjects } from "@/lib/dal/projects";
import { getAllPhases } from "@/lib/dal/phases-milestones";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { TASK_STATUSES } from "@/types";

export const metadata = {
  title: "Tasks",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    due?: string;
    project?: string;
    new?: string;
  }>;
}) {
  await requireUser();
  const params = await searchParams;

  const status = TASK_STATUSES.includes(params.status as (typeof TASK_STATUSES)[number])
    ? (params.status as (typeof TASK_STATUSES)[number])
    : "all";
  const due = ["today", "upcoming", "overdue", "none"].includes(params.due ?? "")
    ? (params.due as "today" | "upcoming" | "overdue" | "none")
    : "all";

  const [tasks, projects, phases] = await Promise.all([
    getTasks({
      status,
      due,
      projectId: params.project && params.project !== "all" ? params.project : undefined,
      sort: "due",
    }),
    getActiveProjects(),
    getAllPhases(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Every to-do across your projects."
      />
      <TasksWorkspace
        tasks={tasks}
        projects={projects}
        phases={phases}
        initialStatus={status === "all" ? "all" : status}
        initialDue={due === "all" ? "" : due}
        initialProjectId={params.project && params.project !== "all" ? params.project : undefined}
      />
    </div>
  );
}