"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Flag, Timer, Bell, CheckSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "cn";

export type TimelineItem = {
  id: string;
  kind: "milestone" | "task" | "event" | "reminder";
  date: string;
  title: string;
  meta: string;
  href: string;
};

const kinds = ["all", "milestone", "task", "event", "reminder"] as const;
type Kind = (typeof kinds)[number];

const kindIcon: Record<string, typeof Flag> = {
  milestone: Flag,
  task: CheckSquare,
  event: CalendarDays,
  reminder: Bell,
};

const kindLabel: Record<Kind, string> = {
  all: "All",
  milestone: "Milestones",
  task: "Tasks",
  event: "Events",
  reminder: "Reminders",
};

function sortItems(items: TimelineItem[]) {
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function TimelineWorkspace({ items }: { items: TimelineItem[] }) {
  const [viewMonth, setViewMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [filter, setFilter] = useState<Kind>("all");

  const grouped = useMemo(() => {
    const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
    const visible = sortItems(filtered).filter((i) => i.date.slice(0, 7) === viewMonth);
    const map = new Map<string, TimelineItem[]>();
    for (const item of visible) {
      const list = map.get(item.date) ?? [];
      list.push(item);
      map.set(item.date, list);
    }
    return Array.from(map.entries());
  }, [items, viewMonth, filter]);

  const doneItems = useMemo(
    () => sortItems(filter === "all" ? items : items.filter((i) => i.kind === filter)).filter((i) => i.date < viewMonth),
    [items, viewMonth, filter]
  );

  function prevMonth() {
    const [y, m] = viewMonth.split("-").map(Number);
    setViewMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`);
  }
  function nextMonth() {
    const [y, m] = viewMonth.split("-").map(Number);
    setViewMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} aria-label="Previous month" className="rounded-lg border p-2 hover:bg-accent"><ChevronLeft className="size-4" /></button>
          <button onClick={nextMonth} aria-label="Next month" className="rounded-lg border p-2 hover:bg-accent"><ChevronRight className="size-4" /></button>
          <h2 className="ml-1 text-lg font-semibold">
            {new Date(`${viewMonth}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
        </div>
        <div className="flex flex-wrap gap-1">
          {kinds.map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn("rounded-lg border px-2.5 py-1 text-xs transition", filter === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              {kindLabel[k]}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Add tasks with due dates, milestones, events or reminders to see the full timeline." />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map(([date, dayItems]) => {
            const today = date === new Date().toISOString().slice(0, 10);
            return (
              <div key={date}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  {new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  {today ? <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">TODAY</span> : null}
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {dayItems.map((item) => {
                    const Icon = kindIcon[item.kind];
                    return (
                      <li key={`${item.kind}-${item.id}`}>
                        <Link
                          href={item.href}
                          className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2 transition hover:border-primary/50 hover:bg-accent/40"
                        >
                          <Icon className="size-4 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{item.meta}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Timer className="size-3.5" />
        <span>Showing {grouped.length} date{grouped.length === 1 ? "" : "s"} in {viewMonth}. {doneItems.length} item{doneItems.length === 1 ? "" : "s"} due before this month.</span>
      </div>
    </div>
  );
}