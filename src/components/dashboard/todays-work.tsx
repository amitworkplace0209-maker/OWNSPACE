"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
} from "lucide-react";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { PriorityBadge } from "@/components/shared/badges";
import { SectionShell } from "@/components/dashboard/section-shell";
import { StatusDot, toneText } from "@/components/dashboard/tone";
import { setTaskStatusAction } from "@/lib/actions/tasks";
import { countdownLabel, daysUntil, type TodayProgress } from "@/lib/dashboard-logic";
import { formatDateShort } from "@/lib/format";
import type { Priority, TaskStatus } from "@/types";

export type TodayTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  priority: Priority;
  project_id: string | null;
  project_name: string | null;
};

type SegmentId = "today" | "overdue" | "in-progress" | "priority";

const SEGMENT_LABEL: Record<SegmentId, string> = {
  today: "Due today",
  overdue: "Overdue",
  "in-progress": "In progress",
  priority: "High priority",
};

function dueLabel(dueDate: string | null): { text: string; late: boolean } {
  const days = daysUntil(dueDate);
  if (days === null) return { text: "", late: false };
  if (days < 0) return { text: countdownLabel(days), late: true };
  if (days === 0) return { text: "Today", late: false };
  if (days === 1) return { text: "Tomorrow", late: false };
  return { text: formatDateShort(dueDate), late: false };
}

export function TodaysWork({
  dueToday,
  overdue,
  inProgress,
  highPriority,
  progress,
}: {
  dueToday: TodayTask[];
  overdue: TodayTask[];
  inProgress: TodayTask[];
  highPriority: TodayTask[];
  progress: TodayProgress;
}) {
  const router = useRouter();
  const [segment, setSegment] = React.useState<SegmentId>(
    dueToday.length > 0 ? "today" : overdue.length > 0 ? "overdue" : "today"
  );
  const [pendingIds, setPendingIds] = React.useState<ReadonlySet<string>>(
    () => new Set()
  );

  const counts: Record<SegmentId, number> = {
    today: dueToday.length,
    overdue: overdue.length,
    "in-progress": inProgress.length,
    priority: highPriority.length,
  };

  const tasks: Record<SegmentId, TodayTask[]> = {
    today: dueToday,
    overdue,
    "in-progress": inProgress,
    priority: highPriority,
  };

  const active = tasks[segment];

  async function toggle(task: TodayTask, checked: boolean) {
    if (pendingIds.has(task.id)) return;
    setPendingIds((prev) => new Set(prev).add(task.id));
    try {
      const res = await setTaskStatusAction(
        task.id,
        checked ? "done" : "todo"
      );
      if (res?.error) {
        toast.error(res.error);
      } else {
        router.refresh();
      }
    } catch {
      toast.error("Could not update the task.");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(task.id);
        return next;
      });
    }
  }

  const emptyCopy: Record<
    SegmentId,
    { title: string; description: string }
  > = {
    today: {
      title: "Nothing due today",
      description: "Add a task and give it a due date.",
    },
    overdue: {
      title: "You're all caught up",
      description: "No tasks are past their due date.",
    },
    "in-progress": {
      title: "Nothing in progress",
      description: "Move a task to In progress when you start working on it.",
    },
    priority: {
      title: "No high-priority tasks",
      description: "Mark a task High or Urgent to see it here.",
    },
  };

  return (
    <SectionShell
      title="Today's work"
      icon={ListChecks}
      description={
        progress.total > 0
          ? `${progress.completed} of ${progress.total} completed · ${progress.percent}%`
          : "Your current queue"
      }
      action="All tasks"
      actionHref="/tasks"
      accentEdge
      className="lg:col-span-2"
    >
      <div className="flex flex-col gap-4">
        {/* Progress — real completion figures for everything due today. */}
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              Today&apos;s progress
            </p>
            <p className="text-xs font-medium tabular-nums">
              {progress.completed} / {progress.total} tasks completed
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
            aria-label="Today's task completion"
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          >
            <div
              className="dash-progress-fill h-full rounded-full bg-primary"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>

        {/* Segmented filter — buttons with aria-pressed, not tab semantics,
            so screen readers announce them as toggleable filters. */}
        <div
          role="group"
          aria-label="Filter today's work"
          className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
        >
          {(Object.keys(SEGMENT_LABEL) as SegmentId[]).map((id) => {
            const selected = segment === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => setSegment(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  selected
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {id === "overdue" && counts.overdue > 0 ? (
                  <StatusDot tone="danger" />
                ) : null}
                {SEGMENT_LABEL[id]}
                <span
                  className={cn(
                    "tabular-nums",
                    selected ? "text-muted-foreground" : "text-muted-foreground/70"
                  )}
                >
                  {counts[id]}
                </span>
              </button>
            );
          })}
        </div>

        {active.length === 0 ? (
          <EmptyState
            icon={segment === "overdue" ? CheckCircle2 : CircleDashed}
            title={emptyCopy[segment].title}
            description={emptyCopy[segment].description}
            className="py-10"
            action={
              <Button render={<Link href="/tasks?new=1" />}>
                <Plus /> Create task
              </Button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-1">
            {active.map((task) => {
              const done = task.status === "done";
              const busy = pendingIds.has(task.id);
              const due = dueLabel(task.due_date);
              const late = segment === "overdue" || due.late;

              return (
                <li key={task.id}>
                  <div className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-border hover:bg-accent/40">
                    <Checkbox
                      checked={done}
                      disabled={busy}
                      onCheckedChange={(checked) =>
                        void toggle(task, checked === true)
                      }
                      aria-label={
                        done
                          ? `Reopen task ${task.title}`
                          : `Complete task ${task.title}`
                      }
                      className="transition data-checked:animate-in"
                    />

                    <Link
                      href={`/tasks/${task.id}`}
                      className="min-w-0 flex-1 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          done && "text-muted-foreground line-through"
                        )}
                      >
                        {task.title}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {busy ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-3 animate-spin"
                          />
                        ) : null}
                        <span className="truncate">
                          {task.project_name ?? "Project"}
                        </span>
                      </span>
                    </Link>

                    {task.priority !== "none" ? (
                      <span className="hidden sm:block">
                        <PriorityBadge priority={task.priority} />
                      </span>
                    ) : null}

                    {due.text ? (
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium tabular-nums",
                          late ? toneText.danger : "text-muted-foreground"
                        )}
                      >
                        {due.text}
                      </span>
                    ) : null}

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`More actions for ${task.title}`}
                          >
                            <MoreHorizontal />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          render={<Link href={`/tasks/${task.id}`} />}
                        >
                          <ArrowUpRight /> Open task
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          render={<Link href={`/tasks/${task.id}?edit=1`} />}
                        >
                          <Pencil /> Edit task
                        </DropdownMenuItem>
                        {task.project_id ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              render={
                                <Link href={`/projects/${task.project_id}`} />
                              }
                            >
                              <ListChecks /> Open project
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}
