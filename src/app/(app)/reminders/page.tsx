import { requireUser } from "@/lib/dal";
import { getReminders } from "@/lib/dal/calendar";
import { getActiveProjects } from "@/lib/dal/projects";
import { getTasks } from "@/lib/dal/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { RemindersWorkspace } from "@/components/reminders/reminders-workspace";

export const metadata = {
  title: "Reminders",
};

export default async function RemindersPage() {
  await requireUser();
  const [reminders, projects, tasks] = await Promise.all([
    getReminders(),
    getActiveProjects(),
    getTasks({ limit: 200 }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reminders" description="Never miss a deadline again." />
      <RemindersWorkspace reminders={reminders} projects={projects} tasks={tasks} />
    </div>
  );
}