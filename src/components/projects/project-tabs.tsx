"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

/**
 * Project sections.
 *
 * The list is data rather than markup so the layout, the sidebar and the
 * command palette all read from the same place.
 */
const tabs = [
  { label: "Overview", href: "" },
  { label: "Structure", href: "/structure" },
  { label: "Tasks", href: "/tasks" },
  { label: "Checklist", href: "/checklist" },
  { label: "Notes", href: "/notes" },
  { label: "Daily Notes", href: "/daily-notes" },
  { label: "Calendar", href: "/calendar" },
  { label: "Reminders", href: "/reminders" },
  { label: "Phases & milestones", href: "/phases" },
  { label: "Finance", href: "/finance" },
  { label: "Files", href: "/files" },
  { label: "Resources", href: "/resources" },
  { label: "Wiki", href: "/wiki" },
  { label: "Activity", href: "/activity" },
  { label: "History", href: "/history" },
  { label: "Settings", href: "/settings" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const suffix = pathname.slice(base.length);

  return (
    <nav
      aria-label="Project sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border/60 pb-0"
    >
      {tabs.map((tab) => {
        const href = tab.href ? `${base}${tab.href}` : base;
        const active = tab.href === "" ? suffix === "" : suffix.startsWith(tab.href);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}