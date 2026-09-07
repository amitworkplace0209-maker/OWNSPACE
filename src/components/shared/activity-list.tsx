import Link from "next/link";
import {
  FolderKanban,
  ListTodo,
  StickyNote,
  CalendarClock,
  Speech,
  ClipboardList,
  BookOpen,
  FileText,
  AlarmClock,
  Timer,
  Hourglass,
  Target,
  Flag,
  type LucideIcon,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/format";
import { EmptyState } from "@/components/shared/empty-state";
import type { Activity } from "@/types";

const iconByType: Record<string, { icon: LucideIcon; className: string }> = {
  project: { icon: FolderKanban, className: "text-indigo-500" },
  phase: { icon: Flag, className: "text-violet-500" },
  milestone: { icon: Target, className: "text-fuchsia-500" },
  task: { icon: ListTodo, className: "text-sky-500" },
  comment: { icon: Speech, className: "text-emerald-500" },
  checklist: { icon: ClipboardList, className: "text-teal-500" },
  note: { icon: StickyNote, className: "text-amber-500" },
  wiki: { icon: BookOpen, className: "text-orange-500" },
  file: { icon: FileText, className: "text-rose-500" },
  calendar: { icon: CalendarClock, className: "text-blue-500" },
  reminder: { icon: AlarmClock, className: "text-red-500" },
  time: { icon: Timer, className: "text-cyan-500" },
  pomodoro: { icon: Hourglass, className: "text-lime-500" },
};

export function ActivityList({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return (
      <EmptyState
        title="No activity yet"
        description="Things you do will show up here as a timeline."
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {activities.map((a) => {
        const meta = iconByType[a.activity_type] ?? { icon: ListTodo, className: "text-muted-foreground" };
        const Icon = meta.icon;
        const href =
          a.entity_type === "project"
            ? `/projects/${a.entity_id}`
            : a.entity_type === "task"
              ? `/tasks/${a.entity_id}`
              : a.entity_type === "note"
                ? `/notes/${a.entity_id}`
                : a.entity_type === "calendar_event"
                  ? "/calendar"
                  : a.entity_type === "reminder"
                    ? "/reminders"
                    : a.entity_type === "phase" && a.project_id
                      ? `/projects/${a.project_id}/phases`
                      : a.entity_type === "milestone" && a.project_id
                        ? `/projects/${a.project_id}/phases`
                        : a.entity_type === "wiki_page"
                          ? `/wiki`
                          : a.project_id
                            ? `/projects/${a.project_id}`
                            : null;

        const linkHref = href ?? "#";

        return (
          <li key={a.id} className="flex gap-3 border-b border-border/50 px-1 py-3 last:border-0">
            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted ${meta.className}`}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                {a.summary}
                {a.metadata && (a.metadata as Record<string, string>).title ? (
                  <span className="text-muted-foreground">
                    {" "}
                    «{(a.metadata as Record<string, string>).title}»
                  </span>
                ) : null}
              </p>
              {a.project_id ? (
                <Link
                  href={linkHref}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  View details
                </Link>
              ) : null}
            </div>
            <time className="shrink-0 text-xs text-muted-foreground" dateTime={a.created_at}>
              {formatRelativeTime(a.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}