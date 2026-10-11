"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useOffline } from "next/offline";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Circle,
  Eraser,
  Flame,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TasksSkeleton } from "@/components/tasks/tasks-skeleton";
import { LiveIndicator, OfflineBanner } from "@/components/tasks/live-indicator";
import {
  PriorityBadge,
  TaskStatusBadge,
  taskStatusLabel,
  priorityLabel,
} from "@/components/shared/badges";
import { StatStrip, StatStripFooter, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar, VIEW_ICONS } from "@/components/shared/workspace-toolbar";
import { formatDateShort, isOverdueDate } from "@/lib/format";
import { useTasksLive } from "@/hooks/use-tasks-live";
import { useBakedTasks } from "@/hooks/use-baked-tasks";
import { deleteTaskAction } from "@/lib/actions/tasks";
import {
  bulkDeleteTasksAction,
  bulkSetTaskPriorityAction,
  bulkSetTaskStatusAction,
  clearCompletedTasksAction,
} from "@/lib/actions/tasks-bulk";
import { cn } from "cn";
import type { Priority, Task, TaskStatus } from "@/types";
import type { Project, ProjectPhase } from "@/types";
import type { TaskStats, TaskWithTagNames } from "@/lib/dal/tasks";
import type { CachedTask } from "@/lib/offline/task-cache";
import { PRIORITIES, TASK_STATUSES } from "@/types";

const GROUPINGS = [
  { value: "", label: "None" },
  { value: "project", label: "Project" },
  { value: "priority", label: "Priority" },
  { value: "due", label: "Due date" },
];

const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** Accent per column, so the board reads as five states rather than one grid. */
const COLUMN_TINT: Record<TaskStatus, string> = {
  backlog: "bg-muted-foreground/40",
  todo: "bg-info/60",
  in_progress: "bg-primary/70",
  done: "bg-success/70",
  cancelled: "bg-muted-foreground/30",
};

/** Live statuses â€” cancelled is not "open work". */
const LIVE: TaskStatus[] = ["backlog", "todo", "in_progress"];

export function TasksWorkspace({
  tasks,
  stats,
  projects,
  phases,
  subtaskProgress,
  initialStatus,
  initialDue,
  initialPriority,
  initialProjectId,
  showProjectColumn = true,
  readOnly = false,
  userId = null,
  openNew = false,
}: {
  tasks: TaskWithTagNames[];
  stats: TaskStats;
  projects: Project[];
  phases: ProjectPhase[];
  /** Subtask rollup keyed by parent task id. Empty on read-only views. */
  subtaskProgress: Record<string, { total: number; done: number }>;
  initialStatus: string;
  initialDue: string;
  initialPriority?: string;
  initialProjectId?: string;
  showProjectColumn?: boolean;
  readOnly?: boolean;
  /** Namespaces the offline cache; null disables caching on scoped views. */
  userId?: string | null;
  /** The ?new=1 shortcut from the manifest and the dashboard. */
  openNew?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const offline = useOffline();

  const [newOpen, setNewOpen] = React.useState(openNew);
  const [editing, setEditing] = React.useState<Task | null>(null);
  const [deleting, setDeleting] = React.useState<Task | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [groupBy, setGroupBy] = React.useState<string>("");
  const [view, setView] = React.useState<string>("list");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, startTransition] = React.useTransition();

  // View preference lives in localStorage so the choice survives a navigation.
  // Read through a rAF-scheduled setState rather than synchronously in the
  // initializer, which would disagree with the server render.
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:tasks:view");
    if (saved === "board" || saved === "list") {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  function changeView(next: string) {
    setView(next);
    window.localStorage.setItem("ownspece:tasks:view", next);
  }

  function setFilter(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(param);
    else params.set(param, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const baked = useBakedTasks(userId);

// `TaskWithTagNames` is structurally a `CachedTask` â€” the offline type exists
  // so the cache layer does not have to import the server-only DAL â€” so the
  // rows pass straight through.
  const serverTasks = tasks;

  const { status, liveTasks, queuedCount, update, syncNow } = useTasksLive({
    userId,
    tasks: serverTasks,
    enabled: !readOnly,
  });

  // Offline, the baked snapshot is the source of truth: the RSC payload for
  // this route may never arrive, and showing yesterday's rows beats an empty
  // page. Online, the server wins and the cache is just the fallback.
  const useBaked = offline && baked.tasks.length > 0;
  const source = useBaked ? baked.tasks : liveTasks;

  const status_ = initialStatus === "all" ? "" : initialStatus;
  const priority = initialPriority && initialPriority !== "all" ? initialPriority : "";

  const filtered = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const needle = query.trim().toLowerCase();

    return source.filter((task) => {
      if (status_ && task.status !== status_) return false;
      if (priority && task.priority !== priority) return false;

      if (initialDue === "overdue") {
        if (!task.due_date || task.due_date >= today || !LIVE.includes(task.status)) {
          return false;
        }
      }
      if (initialDue === "today" && task.due_date !== today) return false;
      if (initialDue === "upcoming") {
        if (!task.due_date || task.due_date < today) return false;
      }
      if (initialDue === "no-date" && task.due_date) return false;

      if (initialProjectId && task.project_id !== initialProjectId) return false;

      // Search reaches tags and project name too â€” the title alone is rarely
      // enough once you have more than a handful of projects.
      if (needle) {
        const haystack = [
          task.title,
          task.description ?? "",
          task.project_name,
          ...task.tag_names,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [source, status_, priority, initialDue, initialProjectId, query]);

  // Selection is *derived*, not stored: anything no longer visible is simply
  // absent from the effective set. Pruning it with an effect instead would be a
  // synchronous setState, and it would still leave one render where a bulk
  // action could target a task that is no longer on screen.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(filtered.map((task) => task.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, filtered]);

  function toggleComplete(task: Task) {
    if (readOnly) return;
    void update(task.id, "status", task.status === "done" ? "todo" : "done");
  }

  function moveStatus(task: Task, next: string) {
    if (readOnly) return;
    void update(task.id, "status", next);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runBulk(
    label: string,
    action: () => Promise<{ error?: string; affected?: number }>
  ) {
    const ids = [...effectiveSelected];
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.affected ?? 0;
      toast.success(`${label} ${count} task${count === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function clearCompleted() {
    startTransition(async () => {
      const result = await clearCompletedTasksAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.affected === 0) {
        toast("Nothing to clear.");
        return;
      }
      toast.success(`Cleared ${result.affected} completed task${result.affected === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  const columns = TASK_STATUSES.map((value) => ({
    status: value,
    label: taskStatusLabel[value],
    tasks: filtered
      .filter((task) => task.status === value)
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
  }));

  const statItems: StatStripItem[] = [
    {
      id: "all",
      label: "Total",
      value: stats.total,
      icon: ListChecks,
      tone: "neutral",
      hint: `${stats.byStatus.todo ?? 0} to do`,
    },
    {
      id: "dueToday",
      label: "Due today",
      value: stats.dueToday,
      icon: CalendarClock,
      tone: "info",
      href: "/tasks?due=today",
      hint: stats.dueToday > 0 ? "Plan these first" : "Nothing due",
    },
    {
      id: "overdue",
      label: "Overdue",
      value: stats.overdue,
      icon: AlertTriangle,
      tone: stats.overdue > 0 ? "danger" : "success",
      href: "/tasks?due=overdue",
      hint: stats.overdue > 0 ? "Needs attention" : "All clear",
    },
    {
      id: "inProgress",
      label: "In progress",
      value: stats.inProgress,
      icon: Flame,
      tone: "warning",
      href: "/tasks?status=in_progress",
      hint: `${stats.unassignedDue} due with no project`,
    },
    {
      id: "done",
      label: "Done today",
      value: stats.completedToday,
      icon: CheckCircle2,
      tone: "success",
      hint: `${stats.completionRate}% of all work`,
    },
  ];

  const activeTile =
    initialDue === "today"
      ? "dueToday"
      : initialDue === "overdue"
        ? "overdue"
        : status_ === "in_progress"
          ? "inProgress"
          : !status_ && !initialDue && !priority
            ? "all"
            : undefined;

  return (
    <div className="flex flex-col gap-4">
      {!readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <OfflineBanner
          queuedCount={queuedCount}
          cachedAt={useBaked ? baked.cachedAt : null}
          onSync={syncNow}
        />
          <LiveIndicator
            status={status}
            queuedCount={queuedCount}
            onSync={syncNow}
            className={offline ? "" : "ml-auto"}
          />
        </div>
      ) : null}

      <StatStrip items={statItems} activeId={activeTile} />

      <StatStripFooter
        completionRate={stats.completionRate}
        doneLabel={`${Object.entries(stats.byStatus)
          .filter(([key]) => key === "done" || key === "cancelled")
          .reduce((sum, [, count]) => sum + count, 0)} finished`}
        totalLabel={`${stats.total} total`}
      />

      <WorkspaceToolbar
        filters={[
          {
            param: "status",
            label: "Status",
            value: status_,
            options: [
              { value: "", label: "All statuses" },
              ...TASK_STATUSES.map((value) => ({
                value,
                label: taskStatusLabel[value],
                count: stats.byStatus[value] ?? 0,
              })),
            ],
          },
          {
            param: "due",
            label: "Due",
            value: initialDue,
            options: [
              { value: "", label: "Any date" },
              { value: "overdue", label: "Overdue", count: stats.overdue },
              { value: "today", label: "Due today", count: stats.dueToday },
              { value: "upcoming", label: "Upcoming" },
              { value: "no-date", label: "No due date" },
            ],
          },
          {
            param: "priority",
            label: "Priority",
            value: priority,
            options: [
              { value: "", label: "Any priority" },
              ...PRIORITIES.map((value) => ({
                value,
                label: value === "urgent" ? "Critical" : value,
                count: stats.byPriority[value] ?? 0,
              })),
            ],
          },
          ...(showProjectColumn && projects.length > 0
            ? [
                {
                  param: "project",
                  label: "Project",
                  value: initialProjectId ?? "",
                  options: [
                    { value: "", label: "All projects" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    })),
                  ],
                },
              ]
            : []),
        ]}
        onFilterChange={setFilter}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search tasks, tags, projectsâ€¦",
          label: "Search tasks",
        }}
        grouping={{ value: groupBy, onChange: setGroupBy, options: GROUPINGS }}
        view={{
          value: view,
          onChange: changeView,
          options: [
            { value: "list", label: "List", icon: VIEW_ICONS.list },
            { value: "board", label: "Board", icon: VIEW_ICONS.kanban },
          ],
        }}
        actions={
          !readOnly ? (
            <>
              {(stats.byStatus.done ?? 0) + (stats.byStatus.cancelled ?? 0) > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCompleted}
                  disabled={pending}
                  title="Delete every done and cancelled task"
                >
                  <Eraser /> Clear completed
                </Button>
              ) : null}
              <Button onClick={() => { setEditing(null); setNewOpen(true); }}>
                <Plus /> New task
              </Button>
            </>
          ) : null
        }
      />

      {effectiveSelected.size > 0 && !readOnly ? (
        <BulkBar
          count={effectiveSelected.size}
          pending={pending}
          onStatus={(value) =>
            runBulk("Moved", () => bulkSetTaskStatusAction([...effectiveSelected], value))
          }
          onPriority={(value) =>
            runBulk("Re-prioritised", () => bulkSetTaskPriorityAction([...effectiveSelected], value))
          }
          onComplete={() =>
            runBulk("Completed", () => bulkSetTaskStatusAction([...effectiveSelected], "done"))
          }
          onDelete={() => setBulkDeleting(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {source.length === 0 && baked.reading ? (
        <TasksSkeleton />
      ) : source.length === 0 ? (
        <EmptyState
          icon={Plus}
          title={readOnly ? "No tasks in this project" : "No tasks yet"}
          description={
            readOnly
              ? "This project has no tasks."
              : "Create a task to start tracking your work."
          }
          action={
            readOnly ? undefined : (
              <Button onClick={() => { setEditing(null); setNewOpen(true); }}>
                <Plus /> Create a task
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching tasks"
          description="Try clearing a filter or searching for something else."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setQuery("");
                router.push(pathname);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : view === "board" ? (
        <KanbanView
          columns={columns}
          readOnly={readOnly}
          onToggle={toggleComplete}
          onMove={moveStatus}
          subtaskProgress={subtaskProgress}
          showProjectColumn={showProjectColumn}
          selected={effectiveSelected}
          onToggleSelected={toggleSelected}
          onEdit={setEditing}
        />
      ) : (
        <ListView
          tasks={filtered}
          grouped={groupBy}
          readOnly={readOnly}
          selected={effectiveSelected}
          onToggleSelected={toggleSelected}
          onToggle={toggleComplete}
          onEdit={setEditing}
          onDelete={setDeleting}
          onMove={moveStatus}
          showProjectColumn={showProjectColumn}
          subtaskProgress={subtaskProgress}
        />
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

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Delete ${effectiveSelected.size} task${effectiveSelected.size === 1 ? "" : "s"}?`}
        description="This permanently deletes the selected tasks along with their comments and checklists."
        confirmLabel="Delete tasks"
        onConfirm={async () => {
          const ids = [...effectiveSelected];
          setBulkDeleting(false);
          const result = await bulkDeleteTasksAction(ids);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          const count = result.affected ?? 0;
          toast.success(`Deleted ${count} task${count === 1 ? "" : "s"}.`);
          setSelected(new Set());
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk action bar
// ---------------------------------------------------------------------------

function BulkBar({
  count,
  pending,
  onStatus,
  onPriority,
  onComplete,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  onStatus: (status: string) => void;
  onPriority: (priority: string) => void;
  onComplete: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="animate-slide-up sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
      <span className="flex items-center gap-2 px-1 text-sm font-medium">
        <span className="count-pop inline-block tabular-nums">{count}</span> selected
      </span>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" onClick={onComplete} disabled={pending}>
        <CheckCircle2 /> Complete
      </Button>

      <select
        aria-label="Set status"
        disabled={pending}
        defaultValue=""
        onChange={(event) => {
          if (!event.target.value) return;
          onStatus(event.target.value);
          event.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none disabled:opacity-60 dark:bg-input/30"
      >
        <option value="">Set statusâ€¦</option>
        {TASK_STATUSES.map((value) => (
          <option key={value} value={value}>
            {taskStatusLabel[value]}
          </option>
        ))}
      </select>

      <select
        aria-label="Set priority"
        disabled={pending}
        defaultValue=""
        onChange={(event) => {
          if (!event.target.value) return;
          onPriority(event.target.value);
          event.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none disabled:opacity-60 dark:bg-input/30"
      >
        <option value="">Set priorityâ€¦</option>
        {PRIORITIES.map((value) => (
          <option key={value} value={value}>
            {priorityLabel[value]}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Clear
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

type Group = { id: string; label: string; tasks: CachedTask[] };

function ListView({
  tasks,
  grouped,
  readOnly,
  selected,
  onToggleSelected,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  showProjectColumn,
  subtaskProgress,
}: {
  tasks: CachedTask[];
  grouped: string;
  readOnly: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (task: Task, status: string) => void;
  showProjectColumn: boolean;
  subtaskProgress: Record<string, { total: number; done: number }>;
}) {
  const groups = React.useMemo(() => groupTasks(tasks, grouped), [tasks, grouped]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          {grouped ? (
            <header className="flex items-center gap-2 px-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </h3>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {group.tasks.length}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </header>
          ) : null}

          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {group.tasks.map((task, index) => (
              <TaskRow
                key={task.id}
                task={task}
                index={index}
                readOnly={readOnly}
                checked={selected.has(task.id)}
                onToggleSelected={onToggleSelected}
                onToggle={onToggle}
                onEdit={onEdit}
                onDelete={onDelete}
                onMove={onMove}
                showProjectColumn={showProjectColumn}
                subtask={subtaskProgress[task.id]}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function groupTasks(tasks: CachedTask[], grouped: string): Group[] {
  if (!grouped) return [{ id: "all", label: "All tasks", tasks }];

  const buckets = new Map<string, Group>();

  const ensure = (id: string, label: string): Group => {
    const existing = buckets.get(id);
    if (existing) return existing;
    const created: Group = { id, label, tasks: [] };
    buckets.set(id, created);
    return created;
  };

  const today = new Date().toISOString().slice(0, 10);

  for (const task of tasks) {
    if (grouped === "project") {
      ensure(task.project_name || "No project", task.project_name || "No project").tasks.push(task);
      continue;
    }
    if (grouped === "priority") {
      const label = task.priority === "urgent" ? "Critical" : task.priority;
      ensure(task.priority, label === "none" ? "No priority" : label).tasks.push(task);
      continue;
    }
    if (grouped === "due") {
      if (!task.due_date) {
        ensure("none", "No due date").tasks.push(task);
      } else if (task.due_date < today) {
        ensure("overdue", "Overdue").tasks.push(task);
      } else if (task.due_date === today) {
        ensure("today", "Today").tasks.push(task);
      } else {
        ensure("later", "Later").tasks.push(task);
      }
    }
  }

  // Overdue first, then today, then everything else â€” the reading order that
  // matches how someone actually works through a list.
  const order = ["overdue", "today", "later", "none"];
  return [...buckets.values()].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function TaskRow({
  task,
  index,
  readOnly,
  checked,
  onToggleSelected,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  showProjectColumn,
  subtask,
}: {
  task: CachedTask;
  index: number;
  readOnly: boolean;
  checked: boolean;
  onToggleSelected: (id: string) => void;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMove: (task: Task, status: string) => void;
  showProjectColumn: boolean;
  subtask?: { total: number; done: number };
}) {
  const done = task.status === "done";
  const cancelled = task.status === "cancelled";
  const overdue = isOverdueDate(task.due_date) && LIVE.includes(task.status);

  return (
    <li
      // The stagger is capped so a long list does not leave the last rows
      // arriving seconds after the first.
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      className={cn(
        "row-stagger group relative flex items-center gap-3 border-b border-border/50 px-3 py-2.5 transition-colors last:border-0",
        "hover:bg-accent/30",
        done && "opacity-60",
        cancelled && "opacity-45",
        task.pending && "task-pending"
      )}
    >
      {!readOnly ? (
        <Checkbox
          checked={checked}
          onCheckedChange={() => onToggleSelected(task.id)}
          aria-label={`Select ${task.title}`}
          className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
        />
      ) : null}

      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 opacity-0 transition-opacity",
          "group-hover:opacity-100",
          task.pending && "opacity-100"
        )}
        style={{ backgroundColor: task.pending ? "var(--primary)" : "transparent" }}
      />

      <button
        type="button"
        onClick={() => onToggle(task)}
        disabled={readOnly}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className="relative shrink-0 rounded-full text-muted-foreground transition hover:scale-110 hover:text-primary disabled:cursor-default disabled:opacity-60 disabled:hover:scale-100 disabled:hover:text-muted-foreground"
      >
        {done ? (
          <CheckCircle2 className="check-ring size-5 text-success" />
        ) : (
          <Circle className="size-5" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link href={`/tasks/${task.id}`} className="truncate">
          <p className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
            {task.title}
          </p>
        </Link>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {showProjectColumn && task.project_name ? (
            <span className="flex min-w-0 items-center gap-1">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: task.project_color ?? "var(--primary)" }}
              />
              <span className="truncate">{task.project_name}</span>
            </span>
          ) : null}
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.tag_names.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]">
              {tag}
            </span>
          ))}
          {task.estimated_minutes ? (
            <span className="hidden sm:inline">
              ~{task.estimated_minutes >= 60
                ? `${Math.round((task.estimated_minutes / 60) * 10) / 10}h`
                : `${task.estimated_minutes}m`}
            </span>
          ) : null}
          {task.pending ? (
            <span className="text-[11px] text-primary">Savingâ€¦</span>
          ) : null}
        </div>

        {subtask && subtask.total > 0 ? (
          <div className="flex items-center gap-2 pt-1">
            <Progress
              value={Math.round((subtask.done / subtask.total) * 100)}
              className="h-1 w-24"
            />
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {subtask.done}/{subtask.total} subtasks
            </span>
          </div>
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

      {!readOnly ? (
        <select
          value={task.status}
          onChange={(event) => onMove(task, event.target.value)}
          aria-label={`Move "${task.title}"`}
          className="hidden h-7 shrink-0 rounded-md border border-input bg-transparent px-1.5 text-xs opacity-0 outline-none transition group-hover:opacity-100 focus-visible:opacity-100 sm:block dark:bg-input/30"
        >
          {TASK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {taskStatusLabel[value]}
            </option>
          ))}
        </select>
      ) : null}

      {!readOnly ? (
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit "${task.title}"`}
            onClick={() => onEdit(task)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete "${task.title}"`}
            onClick={() => onDelete(task)}
            className="hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Board view
// ---------------------------------------------------------------------------

function KanbanView({
  columns,
  readOnly,
  onToggle,
  onMove,
  subtaskProgress,
  showProjectColumn,
  selected,
  onToggleSelected,
  onEdit,
}: {
  columns: Array<{ status: TaskStatus; label: string; tasks: CachedTask[] }>;
  readOnly: boolean;
  onToggle: (task: Task) => void;
  onMove: (task: Task, status: string) => void;
  subtaskProgress: Record<string, { total: number; done: number }>;
  showProjectColumn: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
  onEdit: (task: Task) => void;
}) {
  const [active, setActive] = React.useState<TaskStatus | null>(null);

  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {columns.map((column) => {
        const isActive = active === column.status;

        return (
          <section
            key={column.status}
            data-active={isActive}
            onMouseEnter={() => setActive(column.status)}
            onMouseLeave={() => setActive((current) => (current === column.status ? null : current))}
            className={cn(
              "column-sweep relative flex w-72 shrink-0 snap-start flex-col gap-2 rounded-xl border bg-card/60 p-2 transition-colors",
              isActive && "border-primary/40 bg-card"
            )}
          >
            <header className="flex items-center justify-between gap-2 px-1 py-1">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span
                  aria-hidden="true"
                  className={cn("size-2 rounded-full", COLUMN_TINT[column.status])}
                />
                {column.label}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                {column.tasks.length}
              </span>
            </header>

            <div className="flex flex-col gap-2">
              {column.tasks.length === 0 ? (
                <p className="rounded-lg border border-dashed px-2 py-6 text-center text-xs text-muted-foreground">
                  Nothing here
                </p>
              ) : (
                column.tasks.map((task, index) => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    index={index}
                    readOnly={readOnly}
                    selected={selected.has(task.id)}
                    onToggleSelected={onToggleSelected}
                    onToggle={onToggle}
                    onMove={onMove}
                    onEdit={onEdit}
                    showProjectColumn={showProjectColumn}
                    subtask={subtaskProgress[task.id]}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  task,
  index,
  readOnly,
  selected,
  onToggleSelected,
  onToggle,
  onMove,
  onEdit,
  showProjectColumn,
  subtask,
}: {
  task: CachedTask;
  index: number;
  readOnly: boolean;
  selected: boolean;
  onToggleSelected: (id: string) => void;
  onToggle: (task: Task) => void;
  onMove: (task: Task, status: string) => void;
  onEdit: (task: Task) => void;
  showProjectColumn: boolean;
  subtask?: { total: number; done: number };
}) {
  const done = task.status === "done";
  const overdue = isOverdueDate(task.due_date) && LIVE.includes(task.status);

  return (
    <article
      style={{ "--i": Math.min(index, 10) } as React.CSSProperties}
      className={cn(
        "row-stagger group/card relative flex flex-col gap-2 rounded-lg border bg-card p-3 transition",
        "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
        done && "opacity-60",
        task.pending && "task-pending"
      )}
    >
      <div className="flex items-start gap-2">
        {!readOnly ? (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelected(task.id)}
            aria-label={`Select ${task.title}`}
            className="mt-0.5 shrink-0 opacity-0 transition group-hover/card:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
          />
        ) : null}
        <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm font-medium hover:underline",
              done && "text-muted-foreground line-through"
            )}
          >
            {task.title}
          </p>
        </Link>
        <button
          type="button"
          onClick={() => onToggle(task)}
          disabled={readOnly}
          aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
          className="shrink-0 rounded-full text-muted-foreground transition hover:scale-110 hover:text-primary disabled:opacity-60"
        >
          {done ? (
            <CheckCircle2 className="check-ring size-4 text-success" />
          ) : (
            <Circle className="size-4" />
          )}
        </button>
      </div>

      {showProjectColumn && task.project_name ? (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: task.project_color ?? "var(--primary)" }}
          />
          <span className="truncate">{task.project_name}</span>
        </span>
      ) : null}

      {subtask && subtask.total > 0 ? (
        <div className="flex items-center gap-2">
          <Progress value={Math.round((subtask.done / subtask.total) * 100)} className="h-1" />
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {subtask.done}/{subtask.total}
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.due_date ? (
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[11px]",
              overdue
                ? "bg-danger/12 font-medium text-danger"
                : "bg-muted text-muted-foreground"
            )}
          >
            {formatDateShort(task.due_date)}
          </span>
        ) : null}
        {task.pending ? <span className="text-[11px] text-primary">Savingâ€¦</span> : null}
      </div>

      {!readOnly ? (
        <div className="flex items-center gap-1">
          <select
            value={task.status}
            onChange={(event) => onMove(task, event.target.value)}
            aria-label={`Move "${task.title}"`}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none dark:bg-input/30"
          >
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {taskStatusLabel[value]}
              </option>
            ))}
          </select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit "${task.title}"`}
            onClick={() => onEdit(task)}
          >
            <Pencil className="size-4" />
          </Button>
        </div>
      ) : null}
    </article>
  );
}
