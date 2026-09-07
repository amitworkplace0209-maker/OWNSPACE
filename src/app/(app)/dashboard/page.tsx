import Link from "next/link";
import { getProjectSummary } from "@/lib/dal/projects";
import {
  getTaskSummary,
  getTasksDueToday,
  getTasksOverdue,
  type DueTask,
} from "@/lib/dal/tasks";
import {
  getUpcomingEvents,
  getUpcomingReminders,
  getRecentActivity,
} from "@/lib/dal/calendar";
import { getRecentNotes } from "@/lib/dal/notes";
import { getProfile, requireUser } from "@/lib/dal";
import { formatDateTime, formatRelativeTime } from "@/lib/format";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReminderSweep } from "@/components/dashboard/reminder-sweep";
import { ProjectsProgress } from "@/components/dashboard/projects-progress";
import { ArrowUpRight, CalendarDays, CheckCircle2, Clock, FolderPlus } from "lucide-react";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function DueTaskRow({ task, overdue }: { task: DueTask; overdue?: boolean }) {
  return (
    <li>
      <Link
        href={`/projects`}
        className="group flex items-center justify-between gap-3 rounded-lg border-b border-border/50 py-2.5 last:border-0 hover:bg-accent/40"
      >
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium group-hover:underline">
            {task.title}
          </span>
          <span className="truncate text-xs text-muted-foreground">{task.project_name}</span>
        </div>
        <span
          className={`shrink-0 text-xs font-medium ${
            overdue ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {task.due_date ? formatRelativeTime(task.due_date) : "—"}
        </span>
      </Link>
    </li>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const [projectSummary, taskSummary, tasksToday, tasksOverdue, events, reminders, activity, recentNotes] =
    await Promise.all([
      getProjectSummary(),
      getTaskSummary(),
      getTasksDueToday(),
      getTasksOverdue(),
      getUpcomingEvents(5),
      getUpcomingReminders(5),
      getRecentActivity({ limit: 8 }),
      getRecentNotes(5),
    ]);

  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const name = profile?.display_name?.split(" ")[0];
  const statCards = [
    { label: "Active projects", value: String(projectSummary.active), href: "/projects" },
    { label: "Tasks due today", value: String(taskSummary.today), href: "/tasks?due=today" },
    { label: "Overdue tasks", value: String(taskSummary.overdue), href: "/tasks?due=overdue" },
    { label: "Upcoming events", value: String(events.length), href: "/calendar" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <ReminderSweep />
      <PageHeader
        title={`${greeting()}, ${name || "there"}`}
        description={todayLabel}
        actions={
          <Button render={<Link href="/projects?new=1" />}>
            <FolderPlus /> New project
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="group rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition hover:border-primary/40"
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="mt-1.5 text-2xl font-semibold tabular-nums">{card.value}</p>
            <ArrowUpRight className="mt-1 size-4 text-muted-foreground/60 transition group-hover:text-primary" />
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm">Due today</CardTitle>
                {taskSummary.today > 0 ? (
                  <Link href="/tasks?due=today">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      View all <ArrowUpRight className="ml-1 size-3.5" />
                    </Button>
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent>
                {tasksToday.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="Nothing due today"
                    description="Add a task and give it a due date to see it here."
                  />
                ) : (
                  <ul>
                    {tasksToday.map((task) => (
                      <DueTaskRow key={task.id} task={task} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-sm text-destructive">Overdue</CardTitle>
                {taskSummary.overdue > 0 ? (
                  <Link href="/tasks?due=overdue">
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                      View all <ArrowUpRight className="ml-1 size-3.5" />
                    </Button>
                  </Link>
                ) : null}
              </CardHeader>
              <CardContent>
                {tasksOverdue.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="You're all caught up"
                    description="No tasks are past their due date."
                  />
                ) : (
                  <ul>
                    {tasksOverdue.map((task) => (
                      <DueTaskRow key={task.id} task={task} overdue />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Upcoming events & reminders</CardTitle>
              <Link href="/calendar">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  Calendar <ArrowUpRight className="ml-1 size-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {events.length === 0 && reminders.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description="Add a calendar event or a reminder to see it here."
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <ul className="flex flex-col">
                    {events.slice(0, 4).map((event) => (
                      <li
                        key={event.id}
                        className="flex items-center justify-between gap-2 border-b border-border/50 py-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{event.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(event.starts_at)}
                          </p>
                        </div>
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                      </li>
                    ))}
                  </ul>
                  <ul className="flex flex-col">
                    {reminders.slice(0, 4).map((reminder) => (
                      <li
                        key={reminder.id}
                        className="flex items-center justify-between gap-2 border-b border-border/50 py-2 last:border-0"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{reminder.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(reminder.remind_at)}
                          </p>
                        </div>
                        <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Recent activity</CardTitle>
              <Link href="/activity">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  Activity <ArrowUpRight className="ml-1 size-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <EmptyState
                  title="No activity yet"
                  description="Actions you take in Ownspece will appear here."
                />
              ) : (
                <ul>
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0"
                    >
                      <span className="min-w-0 truncate text-muted-foreground">{item.summary}</span>
                      <span className="shrink-0 text-xs text-muted-foreground/70">
                        {formatRelativeTime(item.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Active projects</CardTitle>
              <Link href="/projects">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                  All <ArrowUpRight className="ml-1 size-3.5" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {projectSummary.active === 0 ? (
                <EmptyState
                  icon={FolderPlus}
                  title="No active projects"
                  description="Create your first project to get started."
                />
              ) : (
                <ProjectsProgress />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent notes</CardTitle>
            </CardHeader>
            <CardContent>
              {recentNotes.length === 0 ? (
                <EmptyState
                  title="No notes yet"
                  description="Capture ideas in notes from the Notes page."
                />
              ) : (
                <ul>
                  {recentNotes.map((note) => (
                    <li
                      key={note.id}
                      className="border-b border-border/50 py-2 last:border-0"
                    >
                      <Link href={`/notes/${note.id}`}>
                        <p className="truncate text-sm font-medium hover:underline">
                          {note.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {note.content}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}