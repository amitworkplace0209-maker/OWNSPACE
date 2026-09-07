import { requireUser } from "@/lib/dal";
import {
  getActiveProjects,
} from "@/lib/dal/projects";
import { getAnalyticsSnapshot, getProjectAnalytics, getActivityTrend } from "@/lib/dal/analytics";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ActivityTrendChart } from "@/components/analytics/activity-trend-chart";
import { formatDurationMinutes } from "@/lib/format";
import { TASK_STATUSES, PRIORITIES } from "@/types";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  await requireUser();
  const projects = await getActiveProjects();
  const [snapshot, projectMetrics, trend] = await Promise.all([
    getAnalyticsSnapshot(),
    Promise.all(projects.map((p) => getProjectAnalytics(p.id))),
    getActivityTrend(30),
  ]);

  const totalMinutes = snapshot.time.totalMinutes;
  const timeToday = snapshot.time.todayMinutes;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" description="A snapshot of your productivity across every project." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active projects" value={String(snapshot.projects.active)} sub={`${snapshot.projects.total} total · ${snapshot.projects.completed} done`} />
        <StatCard label="Tasks" value={String(snapshot.tasks.total)} sub={`${snapshot.tasks.completed} completed · ${snapshot.tasks.overdue} overdue`} />
        <StatCard label="Time tracked" value={formatDurationMinutes(totalMinutes)} sub={`${formatDurationMinutes(timeToday)} today`} />
        <StatCard label="Pomodoros" value={String(snapshot.pomodoro.totalSessions)} sub={`${snapshot.pomodoro.todaySessions} today · ${formatDurationMinutes(snapshot.pomodoro.totalFocusMinutes)} focus`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tasks by status</CardTitle>
            <CardDescription>{snapshot.tasks.completionRate}% completion rate</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {TASK_STATUSES.map((s) => {
              const count = snapshot.tasks.byStatus[s];
              const pct = snapshot.tasks.total ? Math.round((count / snapshot.tasks.total) * 100) : 0;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm capitalize">{s.replace("_", " ")}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tasks by priority</CardTitle>
            <CardDescription>How your workload is prioritised</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {PRIORITIES.map((p) => {
              const count = snapshot.tasks.byPriority[p];
              const pct = snapshot.tasks.total ? Math.round((count / snapshot.tasks.total) * 100) : 0;
              return (
                <div key={p} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm capitalize">{p}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums">{count}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Last 30 days</CardTitle>
          <CardDescription>Tasks completed, minutes tracked, pomodoros and notes created per day</CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTrendChart data={trend} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>By project</CardTitle>
          <CardDescription>Completion and activity per project</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4">Project</th>
                <th className="py-2 pr-4">Progress</th>
                <th className="py-2 pr-4">Tasks</th>
                <th className="py-2 pr-4">Phases</th>
                <th className="py-2 pr-4">Milestones</th>
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Pomodoros</th>
              </tr>
            </thead>
            <tbody>
              {projectMetrics.map((m) => {
                const project = projects.find((p) => p.id === m.projectId);
                return (
                  <tr key={m.projectId} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="py-2 pr-4 font-medium">{project?.name}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${m.taskCompletionRate}%` }} />
                        </div>
                        <span className="text-xs tabular-nums">{m.taskCompletionRate}%</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{m.taskDone}/{m.taskTotal}</td>
                    <td className="py-2 pr-4 tabular-nums">{m.phases.completed}/{m.phases.total}</td>
                    <td className="py-2 pr-4 tabular-nums">{m.milestones.completed}/{m.milestones.total}</td>
                    <td className="py-2 pr-4">{formatDurationMinutes(m.timeMinutes)}</td>
                    <td className="py-2 pr-4 tabular-nums">{m.pomodoroSessions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Notes" value={String(snapshot.notes.total)} sub={`${snapshot.notes.updatedThisWeek} updated this week`} />
        <StatCard label="Notes per project" value={formatNotesPerProject(snapshot.notes.total, projectMetrics.length)} sub={`${projectMetrics.length} active projects analysed`} />
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function formatNotesPerProject(total: number, projects: number): string {
  return projects ? (total / projects).toFixed(1) : "0";
}