import { requireUser } from "@/lib/dal";
import { getPreferences } from "@/lib/dal";
import { getTimeEntries, getRunningTimer, getPomodoroStatus } from "@/lib/dal/time-files";
import { getActiveProjects } from "@/lib/dal/projects";
import { getTasks } from "@/lib/dal/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { TimeWorkspace } from "@/components/time/time-workspace";

export const metadata = {
  title: "Time",
};

export default async function TimePage() {
  const user = await requireUser();
  const [projects, tasks, timeEntries, running, pomodoro, prefs] = await Promise.all([
    getActiveProjects(),
    getTasks({ limit: 300 }),
    getTimeEntries({ limit: 50 }),
    getRunningTimer(),
    getPomodoroStatus(),
    getPreferences(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Time" description="Track your time and stay focused with pomodoro sessions." />
      <TimeWorkspace
        timeEntries={timeEntries}
        running={running}
        pomodoro={pomodoro}
        projects={projects}
        tasks={tasks}
        focusMinutes={prefs?.focus_duration_minutes ?? 25}
        breakMinutes={prefs?.break_duration_minutes ?? 5}
      />
    </div>
  );
}