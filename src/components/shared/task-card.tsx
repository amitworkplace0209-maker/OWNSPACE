import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Clock, GripVertical, MoreHorizontal, Play } from "lucide-react";
import type { Task } from "@/types";

export type TaskWithProjectName = Task & {
  project_name: string;
};

interface TaskCardProps {
  task: TaskWithProjectName;
  compact?: boolean;
  className?: string;
}

export function TaskCard({ task, compact = false, className }: TaskCardProps) {
  const priorityColor =
    task.priority === "urgent"
      ? "bg-destructive text-destructive-foreground"
      : task.priority === "high"
        ? "bg-orange-500 text-orange-700 dark:text-orange-400"
        : task.priority === "medium"
          ? "bg-amber-500 text-amber-700 dark:text-amber-400"
          : task.priority === "low"
            ? "bg-sky-500 text-sky-700 dark:text-sky-400"
            : "bg-muted text-muted-foreground";

  const statusLabel =
    task.status === "done"
      ? "Done"
      : task.status === "in_progress"
        ? "In Progress"
        : task.status === "cancelled"
          ? "Cancelled"
          : task.status === "backlog"
            ? "Backlog"
            : "To Do";

  if (compact) {
    return (
      <div
        className={cn(
          "group flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition hover:border-primary/30",
          className
        )}
      >
        <GripVertical className="size-3 text-muted-foreground cursor-grab" />
        <span className={cn("text-sm", task.status === "done" && "line-through text-muted-foreground")}>
          {task.title}
        </span>
        <span className={`size-1.5 rounded-full ${priorityColor}`} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <GripVertical className="size-3 text-muted-foreground cursor-grab shrink-0" />
            <h3 className={cn("text-sm font-medium", task.status === "done" && "line-through text-muted-foreground")}>
              {task.title}
            </h3>
          </div>
          {task.project_name ? (
            <p className="text-xs text-muted-foreground">{task.project_name}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <span className={`size-2 rounded-full ${priorityColor}`} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs capitalize">
          {statusLabel}
        </Badge>
        <Badge variant="outline" className="text-xs capitalize">
          {task.priority === "none" ? "None" : task.priority}
        </Badge>
        {task.due_date ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {task.due_date}
          </span>
        ) : null}
      </div>
      {task.progress > 0 ? (
        <div className="mt-2">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between opacity-0 transition group-hover:opacity-100">
        <Button variant="ghost" size="sm">
          <Play className="size-3.5 mr-1" /> Open
        </Button>
        <Button variant="ghost" size="icon-sm">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}