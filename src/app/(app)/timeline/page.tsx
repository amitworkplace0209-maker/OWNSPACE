import { requireUser } from "@/lib/dal";
import { getCalendarEvents, getReminders } from "@/lib/dal/calendar";
import { getTasks } from "@/lib/dal/tasks";
import { getAllMilestones } from "@/lib/dal/phases-milestones";
import { PageHeader } from "@/components/shared/page-header";
import { TimelineWorkspace, type TimelineItem } from "@/components/timeline/timeline-workspace";
import { statusLabelOf } from "@/components/timeline/timeline-labels";

export const metadata = {
  title: "Timeline",
};

export default async function TimelinePage() {
  await requireUser();
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const from = new Date(y, m - 2, 1).toISOString();
  const to = new Date(y, m + 6, 0, 23, 59, 59).toISOString();

  const [milestones, tasks, events, reminders] = await Promise.all([
    getAllMilestones(),
    getTasks({ limit: 500 }),
    getCalendarEvents(from, to),
    getReminders(),
  ]);

  const items: TimelineItem[] = [
    ...milestones.flatMap((m) => m.due_date ? [{
      id: m.id,
      kind: "milestone" as const,
      date: m.due_date.slice(0, 10),
      title: m.title,
      meta: `${(m as unknown as { project?: { name?: string } }).project?.name ?? "Milestone"} · ${statusLabelOf(m.status)}`,
      href: m.project_id ? `/projects/${m.project_id}/phases` : "/projects",
    }] : []),
    ...tasks
      .filter((t) => t.due_date)
      .map((t) => ({
        id: t.id,
        kind: "task" as const,
        date: t.due_date!.slice(0, 10),
        title: t.title,
        meta: `${t.project_name} · ${statusLabelOf(t.status)}`,
        href: t.project_id ? `/projects/${t.project_id}/tasks` : `/tasks/${t.id}`,
      })),
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      date: e.starts_at.slice(0, 10),
      title: e.title,
      meta: e.all_day ? "All day" : e.starts_at.slice(11, 16),
      href: "/calendar",
    })),
    ...reminders.map((r) => ({
      id: r.id,
      kind: "reminder" as const,
      date: r.remind_at.slice(0, 10),
      title: r.title,
      meta: `${r.remind_at.slice(11, 16)} · ${statusLabelOf(r.status)}`,
      href: "/reminders",
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Timeline" description="Every due date, event and reminder across your projects." />
      <TimelineWorkspace items={items} />
    </div>
  );
}