"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const tabs = [
  { label: "Overview", href: "" },
  { label: "Tasks", href: "/tasks" },
  { label: "Phases & milestones", href: "/phases" },
  { label: "Files", href: "/files" },
  { label: "Wiki", href: "/wiki" },
  { label: "Activity", href: "/activity" },
];

export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const suffix = pathname.slice(base.length);

  return (
    <nav className="flex flex-wrap gap-1 border-b border-border/60 pb-0">
      {tabs.map((tab) => {
        const href = tab.href ? `${base}${tab.href}` : base;
        const active = tab.href === "" ? suffix === "" : suffix.startsWith(tab.href);
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition",
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