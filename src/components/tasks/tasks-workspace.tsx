"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState } from "react";
import { Search, CheckCircle2, Circle, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { formatDateShort, isOverdueDate } from "@/lib/format";
import { deleteTaskAction, setTaskStatusAction } from "@/lib/actions/tasks";
import { cn } from "cn";
import type { Task } from "@/types";
import type { TaskWithTagNames } from "@/lib/dal/tasks";
import type { Project } from "@/types";
import type { ProjectPhase } from "@/types";

const dueFilters = [
  { label: "All", value: "" },
  { label: "Overdue", value: "overdue" },
  { label: "Today", value: "today" },
  { label: "Upcoming", value: "upcoming" },
];

export function TasksWorkspace({
  tasks,
  projects,
  phases,
  initialStatus,
  initialDue,
  initialProjectId,
  showProjectColumn = true,
  readOnly = false,
}: {
  tasks: TaskWithTagNames[];
  projects: Project[];
  phases: ProjectPhase[];
  initialStatus: string;
  initialDue: string;
  initialProjectId?: string;
  showProjectColumn?: boolean;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [query, setQuery] = useState("");

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const status = initialStatus === "all" ? "" : initialStatus;

  const filtered = tasks.filter((t) => {
    if (status && t.status !== status) return false;
    if (initialDue === "overdue" && !isOverdueDate(t.due_date)) return false;
    if (initialDue === "today") {
      const today = new Date().toISOString().slice(0, 10);
      if (t.due_date !== today) return false;
    }
    if (initialDue === "upcoming") {
      const today = new Date().toISOString().slice(0, 10);
      if (!t.due_date || t.due_date < today) return false;
    }
    if (initialProjectId && t.project_id !== initialProjectId) return false;
    if (query.trim() && !t.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  function toggleComplete(task: Task) {
    void setTaskStatusAction(task.id, task.status === "done" ? "todo" : "done");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
          {(["", "in_progress", "todo", "done", "cancelled"] as const).map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter("status", s)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition",
                status === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {s === "" ? "All" : s.replace("_", " ")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
          {dueFilters.map((f) => (
            <button
              key={f.value || "all-due"}
              onClick={() => setFilter("due", f.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-sm font-medium transition",
                initialDue === f.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tasks…"
            className="h-8 pl-7"
            aria-label="Filter tasks"
          />
        </div>

        {!readOnly ? (
          <Button onClick={() => { setEditing(null); setNewOpen(true); }}>
            <Plus /> New task
          </Button>
        ) : null}
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={readOnly ? "No tasks in this project" : "No tasks yet"}
          description={readOnly ? "This project has no tasks." : "Create a task to start tracking your work."}
          action={
            readOnly ? undefined : (
              <Button onClick={() => { setEditing(null); setNewOpen(true); }}>
                <Plus /> Create a task
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matching tasks" description="Try changing the filters above." />
      ) : (
        <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
          {filtered.map((task) => (
            <li
              key={task.id}
              className="group flex items-center gap-3 border-b border-border/50 px-4 py-3 last:border-0 hover:bg-accent/30"
            >
              <button
                onClick={() => toggleComplete(task)}
                aria-label={task.status === "done" ? "Mark as not done" : "Mark as done"}
                disabled={readOnly}
                className="shrink-0 text-muted-foreground transition hover:text-primary disabled:cursor-default disabled:opacity-60 disabled:hover:text-muted-foreground"
              >
                {task.status === "done" ? (
                  <CheckCircle2 className="size-5 text-emerald-500" />
                ) : (
                  <Circle className="size-5" />
                )}
              </button>

              <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm",
                    task.status === "done" && "text-muted-foreground line-through"
                  )}
                >
                  {task.title}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {showProjectColumn && task.project_name ? (
                    <span className="truncate">{task.project_name}</span>
                  ) : null}
                  <TaskStatusBadge status={task.status} />
                  <PriorityBadge priority={task.priority} />
                </div>
              </Link>

              <span
                className={cn(
                  "shrink-0 text-xs",
                  isOverdueDate(task.due_date) && !["done", "cancelled"].includes(task.status)
                    ? "font-medium text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {task.due_date ? formatDateShort(task.due_date) : null}
              </span>

              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                {!readOnly ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${task.title}`}
                      onClick={() => { setEditing(task); }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => setDeleting(task)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <TaskFormDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        projects={projects}
        phases={phases}
        task={editing}
        defaultProjectId={initialProjectId ?? null}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="This permanently deletes the task and all its comments and checklists."
        confirmLabel="Delete task"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteTaskAction(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}