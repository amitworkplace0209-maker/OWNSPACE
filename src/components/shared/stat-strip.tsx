"use client";

import Link from "next/link";
import { CheckCircle2, CircleDashed, Clock, Flame, ListTodo } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Progress } from "@/components/ui/progress";
import { toneGradient, toneGlow } from "@/components/dashboard/tone";
import type { SemanticTone } from "@/lib/dashboard-logic";

export type StatStripItem = {
  id: string;
  label: string;
  value: number;
  icon: LucideIcon;
  tone: SemanticTone;
  /** Where clicking goes; omitted tiles are non-interactive. */
  href?: string;
  hint?: string;
};

/**
 * Headline numbers for a workspace, styled like the dashboard's KPI cards.
 *
 * The tiles are the fastest way to notice "12 overdue" without reading a list,
 * and each one is also a filter — the number and the navigation are the same
 * click, so there is no gap between "how much" and "show me".
 */
export function StatStrip({
  items,
  activeId,
  className,
}: {
  items: StatStripItem[];
  /** Id of the tile matching the current filter, highlighted. */
  activeId?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-5", className)}>
      {items.map((item) => {
        const Icon = item.icon;
        const active = activeId === item.id;

        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {item.label}
              </p>
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg text-white transition-transform duration-200 group-hover:scale-105",
                  toneGradient[item.tone],
                  toneGlow[item.tone]
                )}
              >
                <Icon className="size-3.5" />
              </span>
            </div>
            <p className="dash-kpi-value">{item.value}</p>
            {item.hint ? (
              <p className="truncate text-xs text-muted-foreground">{item.hint}</p>
            ) : null}
          </>
        );

        const shell = cn(
          "group relative flex flex-col gap-1 overflow-hidden rounded-xl border bg-card p-3.5 text-left transition",
          item.href
            ? "hover:border-primary/40 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            : "",
          active && "border-primary ring-2 ring-primary/25"
        );

        return item.href ? (
          <Link key={item.id} href={item.href} className={shell}>
            {body}
          </Link>
        ) : (
          <div key={item.id} className={shell}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Completion bar shown under the strip. */
export function StatStripFooter({
  completionRate,
  doneLabel,
  totalLabel,
}: {
  completionRate: number;
  doneLabel: string;
  totalLabel: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
        <span className="text-sm font-medium">{completionRate}% complete</span>
      </div>
      <Progress value={completionRate} className="h-1.5 min-w-32 flex-1" />
      <span className="text-xs text-muted-foreground">
        {doneLabel} · {totalLabel}
      </span>
    </div>
  );
}

export const TASK_STAT_ICONS = {
  all: ListTodo,
  dueToday: Clock,
  overdue: Flame,
  inProgress: CircleDashed,
  done: CheckCircle2,
};