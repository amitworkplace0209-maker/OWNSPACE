import Link from "next/link";
import {
  Bell,
  CalendarDays,
  CheckSquare,
  FolderPlus,
  NotebookPen,
  Upload,
  type LucideIcon,
} from "lucide-react";

type Action = {
  id: string;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
};

/**
 * Quick actions.
 *
 * Every entry navigates to a real workflow — the `?new=1` query is consumed by
 * each workspace, which opens its create form on arrival. Nothing here is a
 * decorative button.
 */
const ACTIONS: Action[] = [
  {
    id: "project",
    label: "Project",
    hint: "Start a new project",
    href: "/projects?new=1",
    icon: FolderPlus,
  },
  {
    id: "task",
    label: "Task",
    hint: "Add a task",
    href: "/tasks?new=1",
    icon: CheckSquare,
  },
  {
    id: "note",
    label: "Note",
    hint: "Capture a note",
    href: "/notes?new=1",
    icon: NotebookPen,
  },
  {
    id: "reminder",
    label: "Reminder",
    hint: "Set a reminder",
    href: "/reminders?new=1",
    icon: Bell,
  },
  {
    id: "event",
    label: "Event",
    hint: "Block out time",
    href: "/calendar?new=1",
    icon: CalendarDays,
  },
  {
    id: "file",
    label: "Upload",
    hint: "Add a file",
    href: "/resources",
    icon: Upload,
  },
];

export function QuickActions() {
  return (
    <nav aria-label="Quick actions">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <li key={action.id}>
              <Link
                href={action.href}
                className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-primary/35 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none active:translate-y-px"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <span className="min-w-0 flex-1 flex-col">
                  <span className="block truncate text-sm font-medium">
                    {action.label}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {action.hint}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
