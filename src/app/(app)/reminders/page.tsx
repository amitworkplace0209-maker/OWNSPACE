import { requireUser } from "@/lib/dal";
import { getActiveProjects } from "@/lib/dal/projects";
import { getReminderAttachTargets, getReminderDashboard } from "@/lib/dal/reminders";
import { PageHeader } from "@/components/shared/page-header";
import { RemindersWorkspace } from "@/components/reminders/reminders-workspace";
import { PRIORITIES } from "@/types";

export const metadata = {
  title: "Reminders",
};

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<{
    project?: string;
    status?: string;
    priority?: string;
    new?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // Whitelisted against the real enums so a hand-edited query string cannot
  // push an unexpected value into the filter chain.
  const status = ["live", "overdue", "due_soon", "snoozed", "upcoming", "done", "pending", "triggered", "dismissed"].includes(
    params.status ?? ""
  )
    ? (params.status as string)
    : "";
  const priority = PRIORITIES.includes(params.priority as (typeof PRIORITIES)[number])
    ? (params.priority as string)
    : "";
  const projectId = params.project ?? "";

  // The list, the stat tiles and the attach-target pickers are independent
  // reads, so they go out together.
  const [{ reminders, stats }, projects, targets] = await Promise.all([
    getReminderDashboard({ projectId, status, priority }),
    getActiveProjects(),
    getReminderAttachTargets(projectId === "personal" ? undefined : projectId || undefined),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reminders"
        description="Nudges for yourself and for every project — repeating, muted, or personal."
      />
      <RemindersWorkspace
        reminders={reminders}
        stats={stats}
        projects={projects}
        tasks={targets.tasks}
        nodes={targets.nodes}
        notes={targets.notes}
        userId={user.id}
        initialProjectId={projectId}
        initialStatus={status}
        initialPriority={priority}
        initialNow={new Date().toISOString()}
      />
    </div>
  );
}