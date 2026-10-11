import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, Circle, CloudOff } from "lucide-react";
import { formatDateShort, formatRelativeTime, isOverdueDate } from "@/lib/format";
import { cn } from "cn";
import type { CachedTask } from "@/lib/offline/task-cache";

const LIVE: CachedTask["status"][] = ["backlog", "todo", "in_progress"];

/**
 * Tasks loading shell.
 *
 * Kept in its own module so `loading.tsx` can import it without pulling the
 * workspace â€” and the realtime/IndexedDB code behind it â€” into the prefetch
 * bundle. The shape mirrors the real page so nothing jumps when the rows land.
 */
export function TasksSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading tasks">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="skeleton h-7 w-24 rounded-full" />
        <div className="skeleton h-7 w-28 rounded-full" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-xl border bg-card p-3.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-8 w-24" />
        <div className="skeleton h-8 min-w-40 flex-1" />
      </div>

      <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {Array.from({ length: rows }).map((_, index) => (
          <li
            key={index}
            className="flex items-center gap-3 border-b border-border/50 px-3 py-3 last:border-0"
          >
            <Skeleton className="size-5 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-14 rounded-md" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The task list as it exists offline.
 *
 * Rendered by the route shell when the RSC payload behind it has not arrived
 * and will not until the connection returns. Read-only on purpose: there is no
 * session to write with, so offering a checkbox that cannot save would be a
 * lie. Every row is marked with when it was cached rather than pretending to be
 * current.
 */
export function CachedTaskList({
  tasks,
  cachedAt,
}: {
  tasks: CachedTask[];
  cachedAt: string | null;
}) {
  if (tasks.length === 0) return <TasksSkeleton />;

  const open = tasks.filter((task) => LIVE.includes(task.status));
  const shown = (open.length > 0 ? open : tasks).slice(0, 40);

  return (
    <div className="flex flex-col gap-2">
      {cachedAt ? (
        <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
          <CloudOff aria-hidden="true" className="size-3.5" />
          Saved {formatRelativeTime(cachedAt)} â€” read-only until you reconnect
        </p>
      ) : null}

      <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {shown.map((task, index) => {
          const done = task.status === "done";
          const overdue = isOverdueDate(task.due_date) && LIVE.includes(task.status);

          return (
            <li
              key={task.id}
              style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
              className="row-stagger flex items-center gap-3 border-b border-border/50 px-3 py-2.5 last:border-0"
            >
              {done ? (
                <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-success" />
              ) : (
                <Circle aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
                  {task.title}
                </p>
                {task.project_name ? (
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: task.project_color ?? "var(--primary)" }}
                    />
                    <span className="truncate">{task.project_name}</span>
                  </span>
                ) : null}
              </div>

              {task.due_date ? (
                <span
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-0.5 text-xs tabular-nums",
                    overdue ? "bg-danger/12 font-medium text-danger" : "text-muted-foreground"
                  )}
                >
                  {formatDateShort(task.due_date)}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {tasks.length > shown.length ? (
        <p className="px-1 text-xs text-muted-foreground">
          +{tasks.length - shown.length} more saved on this device
        </p>
      ) : null}
    </div>
  );
}