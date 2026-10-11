import { getCalendarEvents } from "@/lib/dal/calendar";
import { getReminders } from "@/lib/dal/calendar";
import { getTasks } from "@/lib/dal/tasks";
import { getProjectOverview } from "@/lib/dal/phases-milestones";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarDays } from "lucide-react";
import { cn } from "cn";

export const metadata = {
  title: "Calendar",
};

type Entry = {
  id: string;
  kind: "Event" | "Task" | "Reminder" | "Milestone";
  title: string;
  at: string;
  allDay: boolean;
  done?: boolean;
};

function dayRange(offsetDays: number) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - offsetDays);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(to.getDate() + 60);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

const KIND_STYLES: Record<Entry["kind"], string> = {
  Event: "bg-info/12 text-info",
  Task: "bg-primary/12 text-primary",
  Reminder: "bg-warning/15 text-warning",
  Milestone: "bg-success/12 text-success",
};

/**
 * Project calendar.
 *
 * This is the agenda view: rather than duplicating task and reminder rows into
 * a calendar table, each is read from its own table through `project_id` and
 * merged here. The month, week and day views in the global calendar render the
 * same rows.
 */
export default async function ProjectCalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { from, to } = dayRange(30);

  const [events, reminders, tasks, overview] = await Promise.all([
    getCalendarEvents(from, to, id),
    getReminders({ projectId: id, status: "all" }),
    getTasks({ projectId: id, completed: false, limit: 200 }),
    getProjectOverview(id),
  ]);

  const entries: Entry[] = [
    ...events.map((event) => ({
      id: event.id,
      kind: "Event" as const,
      title: event.title,
      at: event.starts_at,
      allDay: event.all_day,
    })),
    ...reminders.map((reminder) => ({
      id: reminder.id,
      kind: "Reminder" as const,
      title: reminder.title,
      at: reminder.remind_at,
      allDay: false,
      done: reminder.status === "triggered" || reminder.status === "dismissed",
    })),
    ...tasks
      .filter((task) => task.due_date)
      .map((task) => ({
        id: task.id,
        kind: "Task" as const,
        title: task.title,
        at: `${task.due_date}T12:00:00`,
        allDay: true,
        done: task.status === "done",
      })),
    ...overview.milestones.map((milestone) => ({
      id: milestone.id,
      kind: "Milestone" as const,
      title: milestone.title,
      at: milestone.due_date
        ? `${milestone.due_date}T12:00:00`
        : new Date().toISOString(),
      allDay: true,
      done: milestone.status === "completed",
    })),
  ]
    .filter((entry) => entry.at >= from && entry.at <= to)
    .sort((a, b) => a.at.localeCompare(b.at));

  return (
    <ProjectSection
      title="Calendar"
      description="Agenda for this project: events, task deadlines, reminders and milestones in one list."
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled"
          description="Add events, or give a task, reminder or milestone a date, and it will show up here."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {entries.length} entries over the next 60 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col">
              {entries.map((entry) => (
                <li
                  key={`${entry.kind}-${entry.id}`}
                  className="flex flex-wrap items-center gap-2 border-b border-border/50 py-2 text-sm last:border-0"
                >
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                      KIND_STYLES[entry.kind]
                    )}
                  >
                    {entry.kind}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", entry.done && "text-muted-foreground line-through")}>
                    {entry.title}
                  </span>
                  <time
                    dateTime={entry.at}
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                  >
                    {new Date(entry.at).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    {entry.allDay
                      ? ""
                      : ` · ${new Date(entry.at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`}
                  </time>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </ProjectSection>
  );
}