import { Suspense } from "react";
import { getSubtaskProgress, getTaskStats, getTasks } from "@/lib/dal/tasks";
import { getActiveProjects } from "@/lib/dal/projects";
import { getAllPhases } from "@/lib/dal/phases-milestones";
import { requireUser } from "@/lib/dal";
import { PageHeader } from "@/components/shared/page-header";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";
import { TasksSkeleton } from "@/components/tasks/tasks-skeleton";
import { PRIORITIES, TASK_STATUSES } from "@/types";

export const metadata = {
  title: "Tasks",
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    due?: string;
    priority?: string;
    project?: string;
    new?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const status = TASK_STATUSES.includes(params.status as (typeof TASK_STATUSES)[number])
    ? (params.status as (typeof TASK_STATUSES)[number])
    : "all";
  // `no-date` is what the toolbar emits. It used to be validated against a list
  // that only contained "none", so choosing "No due date" silently reset the
  // filter instead of applying it.
  const due = ["today", "upcoming", "overdue", "no-date"].includes(params.due ?? "")
    ? (params.due as "today" | "upcoming" | "overdue" | "no-date")
    : "all";
  const priority = PRIORITIES.includes(params.priority as (typeof PRIORITIES)[number])
    ? (params.priority as (typeof PRIORITIES)[number])
    : "all";
  const projectId =
    params.project && params.project !== "all" ? params.project : undefined;

  // The toolbar speaks in "no-date"; the DAL calls the same filter "none".
  const dalDue = due === "no-date" ? "none" : due;

  // The stats strip and the list come from the same query on purpose: the counts
  // above the list can never disagree with the list itself. Only the subtask
  // rollup needs a second query, and only for parents that actually have one.
  const [tasks, stats, projects, phases] = await Promise.all([
    getTasks({ status, due: dalDue, priority, projectId, sort: "due" }),
    getTaskStats({ projectId }),
    getActiveProjects(),
    getAllPhases(),
  ]);

  const parentIds = tasks
    .filter((task) => tasks.some((other) => other.parent_task_id === task.id))
    .map((task) => task.id);

  const subtaskProgress = await getSubtaskProgress(parentIds);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Every to-do across your projects."
      />
      {/* The workspace subscribes to realtime and hydrates the offline cache,
          so it has to mount on the client. Splitting it behind a boundary keeps
          the header painted while the JavaScript chunk streams. */}
      <Suspense fallback={<TasksSkeleton />}>
        <TasksWorkspace
          tasks={tasks}
          stats={stats}
          projects={projects}
          phases={phases}
          subtaskProgress={subtaskProgress}
          initialStatus={status === "all" ? "all" : status}
          initialDue={due === "all" ? "" : due}
          initialPriority={priority === "all" ? "all" : priority}
          initialProjectId={projectId}
          userId={user.id}
          openNew={params.new === "1"}
        />
      </Suspense>
    </div>
  );
}