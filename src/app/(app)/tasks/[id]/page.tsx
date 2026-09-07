import { getTask, getTasks } from "@/lib/dal/tasks";
import { getTags } from "@/lib/dal/tags";
import { getAllPhases } from "@/lib/dal/phases-milestones";
import { getProject } from "@/lib/dal/projects";
import { getFiles } from "@/lib/dal/time-files";
import { TaskDetailView } from "@/components/tasks/task-detail";

export const metadata = {
  title: "Task",
};

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [task, tags, allTasks, phases, files] = await Promise.all([
    getTask(id),
    getTags(),
    getTasks({ limit: 500 }),
    getAllPhases(),
    getFiles({ taskId: id }),
  ]);

  const projectId = task.project_id;
  const project = await getProject(projectId);

  return (
    <TaskDetailView
      task={task}
      tags={tags}
      allTasks={allTasks.map((t) => ({ id: t.id, title: t.title, status: t.status }))}
      projects={[project]}
      phases={phases}
      files={files}
      readOnly={project.status === "archived"}
    />
  );
}