import { getProject } from "@/lib/dal/projects";
import { requireUser } from "@/lib/dal";
import {
  getReminderAttachTargets,
  getReminderDashboard,
} from "@/lib/dal/reminders";
import { ProjectSection } from "@/components/projects/project-section";
import { RemindersWorkspace } from "@/components/reminders/reminders-workspace";

export const metadata = {
  title: "Reminders",
};

/**
 * Reminders for one project.
 *
 * Reuses the main /reminders workspace rather than a second read-only card
 * list: the old version could show repeat rules and channels but offered no way
 * to change one, so editing a reminder meant leaving the project screen.
 */
export default async function ProjectRemindersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; priority?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const project = await getProject(id);

  const status = ["live", "overdue", "due_soon", "snoozed", "upcoming", "done", "pending", "triggered", "dismissed"].includes(
    query.status ?? ""
  )
    ? (query.status as string)
    : "";
  const priority = ["none", "low", "medium", "high", "urgent"].includes(query.priority ?? "")
    ? (query.priority as string)
    : "";

  const [{ reminders, stats }, targets] = await Promise.all([
    getReminderDashboard({ projectId: id, status, priority }),
    getReminderAttachTargets(id),
  ]);

  return (
    <ProjectSection
      title="Reminders"
      description="Repeat rules, delivery channels, snooze and advance notice for this project."
    >
      <RemindersWorkspace
        reminders={reminders}
        stats={stats}
        projects={[project]}
        tasks={targets.tasks}
        nodes={targets.nodes}
        notes={targets.notes}
        userId={user.id}
        initialProjectId={id}
        initialStatus={status}
        initialPriority={priority}
        initialNow={new Date().toISOString()}
        readOnly={project.status === "archived"}
      />
    </ProjectSection>
  );
}