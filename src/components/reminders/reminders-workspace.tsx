"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  AlarmClock,
  AlarmClockOff,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  ListTodo,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar, VIEW_ICONS } from "@/components/shared/workspace-toolbar";
import { ReminderFormDialog, ScheduleSummary } from "@/components/reminders/reminder-form-dialog";
import {
  bulkCompleteRemindersAction,
  bulkDeleteRemindersAction,
  bulkSetRemindersEnabledAction,
  completeReminderAction,
  deleteReminderAction,
  snoozeReminderAction,
  toggleReminderEnabledAction,
  unsnoozeReminderAction,
} from "@/lib/actions/calendar";
import {
  PRIORITY_LABEL,
  SNOOZE_PRESETS,
  applyReminderFilters,
  deriveReminderState,
  groupReminders,
  isDone,
  isLive,
  isRecurring,
  repeatSummary,
  snoozeUntilTomorrow,
  type ReminderGrouping,
  type ReminderListItem,
} from "@/lib/reminder-logic";
import { formatDateTime } from "@/lib/format";
import { cn } from "cn";
import { PRIORITIES, type Priority, type Project } from "@/types";

const GROUPINGS = [
  { value: "", label: "None" },
  { value: "project", label: "Project" },
  { value: "state", label: "State" },
  { value: "priority", label: "Priority" },
  { value: "day", label: "Day" },
];

const STATE_LABEL: Record<string, string> = {
  overdue: "Overdue",
  due_soon: "Due soon",
  snoozed: "Snoozed",
  upcoming: "Upcoming",
  done: "Done",
};

type ViewMode = "list" | "timeline";

/**
 * Reminders.
 *
 * Shows project reminders and personal ones in the same list, because from the
 * user's side they are one inbox — a personal reminder simply has no project on
 * it. The old version split them apart and hid every advanced scheduling field
 * (repeat, channels, priority, advance), even though the database had carried
 * those columns since migration 017.
 */
export function RemindersWorkspace({
  reminders,
  stats,
  projects,
  tasks,
  nodes,
  notes,
  initialProjectId = "",
  initialStatus = "",
  initialPriority = "",
  initialNow,
  readOnly = false,
}: {
  reminders: ReminderListItem[];
  stats: {
    total: number;
    dueToday: number;
    overdue: number;
    dueSoon: number;
    upcoming: number;
    snoozed: number;
    done: number;
    disabled: number;
    repeating: number;
    personal: number;
    byProject: Record<string, number>;
    byPriority: Record<string, number>;
    onTimeRate: number;
  };
  projects: Project[];
  tasks: { id: string; title: string; project_id: string | null }[];
  nodes: { id: string; title: string; project_id: string | null }[];
  notes: { id: string; title: string; project_id: string | null }[];
  initialProjectId?: string;
  initialStatus?: string;
  initialPriority?: string;
  /** Server clock, so the first render agrees with the server's markup. */
  initialNow: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState("");
  const [groupBy, setGroupBy] = React.useState<ReminderGrouping | "">("");
  const [view, setView] = React.useState<ViewMode>("list");
  const [repeatFilter, setRepeatFilter] = React.useState<"any" | "repeating" | "once">("any");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReminderListItem | null>(null);
  const [deleting, setDeleting] = React.useState<ReminderListItem | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [pending, startTransition] = useTransition();

  // View preference is read once through a rAF so it never fights React over
  // the server-rendered markup.
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:reminders:view");
    if (saved === "list" || saved === "timeline") {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  React.useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    router.replace(`${pathname}?${params.toString()}`);
    const id = window.requestAnimationFrame(() => {
      setEditing(null);
      setFormOpen(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchParams, pathname, router]);

  function changeView(next: string) {
    setView(next as ViewMode);
    window.localStorage.setItem("ownspece:reminders:view", next);
  }

  function setFilter(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(param);
    else params.set(param, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  // The clock is seeded from the server so the first client render matches the
  // server's markup exactly — deriving "Today" from a fresh `new Date()` on the
  // client would flip a group heading during hydration. The interval then keeps
  // it honest, so a snooze that expires while the page is open comes back on
  // its own without a reload.
  const [now, setNow] = React.useState(() => new Date(initialNow));
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const filtered = React.useMemo(
    () =>
      applyReminderFilters(
        reminders,
        {
          query,
          projectId: initialProjectId,
          scope: "all",
          priority: (initialPriority || "") as Priority | "",
          state: (initialStatus || "") as never,
          repeat: repeatFilter,
        },
        now
      ),
    [reminders, query, initialProjectId, initialPriority, initialStatus, repeatFilter, now]
  );

  // Selection is derived, not pruned: anything no longer visible is simply
  // absent, so a bulk action can never target a row that is off screen.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(filtered.map((item) => item.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, filtered]);

  const groups = React.useMemo(
    () => groupReminders(filtered, groupBy || "none", now),
    [filtered, groupBy, now]
  );

  const visibleStats = React.useMemo(() => {
    const stateOf = (item: ReminderListItem) => deriveReminderState(item, now);
    return {
      over: filtered.filter((item) => stateOf(item) === "overdue").length,
      dueSoon: filtered.filter((item) => stateOf(item) === "due_soon").length,
      today: filtered.filter(
        (item) => new Date(item.remind_at).toDateString() === now.toDateString() && isLive(item)
      ).length,
      repeating: filtered.filter(isRecurring).length,
      personal: filtered.filter((item) => !item.project_id).length,
      live: filtered.filter(isLive).length,
    };
  }, [filtered, now]);

  const statItems: StatStripItem[] = [
    {
      id: "all",
      label: "Total",
      value: stats.total,
      icon: AlarmClock,
      tone: "neutral",
      hint: `${stats.personal} personal`,
    },
    {
      id: "today",
      label: "Due today",
      value: visibleStats.today,
      icon: CalendarClock,
      tone: "info",
      hint: stats.dueToday > 0 ? "Across everything" : "Nothing today",
    },
    {
      id: "overdue",
      label: "Overdue",
      value: visibleStats.over,
      icon: TriangleAlert,
      tone: visibleStats.over > 0 ? "danger" : "success",
      hint: visibleStats.over > 0 ? "Needs attention" : "All clear",
    },
    {
      id: "repeating",
      label: "Repeating",
      value: visibleStats.repeating,
      icon: Repeat,
      tone: "warning",
      hint: `${stats.disabled} muted`,
    },
    {
      id: "done",
      label: "Done",
      value: stats.done,
      icon: CheckCircle2,
      tone: "success",
      hint: `${stats.onTimeRate}% on time`,
    },
  ];

  const activeTile = initialProjectId ? undefined : undefined;

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(label: string, action: () => Promise<{ error?: string; affected?: number }>) {
    const ids = [...effectiveSelected];
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.affected ?? 0;
      toast.success(`${label} ${count} reminder${count === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function act(label: string, action: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else {
        toast.success(`${label}.`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} activeId={activeTile} />

      <WorkspaceToolbar
        filters={[
          {
            param: "status",
            label: "State",
            value: initialStatus,
            options: [
              { value: "", label: "Any state" },
              { value: "live", label: "Active", count: visibleStats.live },
              { value: "overdue", label: "Overdue", count: visibleStats.over },
              { value: "due_soon", label: "Due soon", count: visibleStats.dueSoon },
              { value: "snoozed", label: "Snoozed", count: stats.snoozed },
              { value: "upcoming", label: "Upcoming", count: stats.upcoming },
              { value: "done", label: "Done", count: stats.done },
            ],
          },
          {
            param: "priority",
            label: "Priority",
            value: initialPriority,
            options: [
              { value: "", label: "Any priority" },
              ...PRIORITIES.map((value) => ({
                value,
                label: PRIORITY_LABEL[value],
                count: stats.byPriority[value] ?? 0,
              })),
            ],
          },
          ...(projects.length > 0
            ? [
                {
                  param: "project",
                  label: "Project",
                  value: initialProjectId,
                  options: [
                    { value: "", label: "All + personal" },
                    { value: "personal", label: "Personal only" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                      count: stats.byProject[project.id] ?? 0,
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
          placeholder: "Search reminders, projects…",
          label: "Search reminders",
        }}
        grouping={{
          value: groupBy,
          onChange: (value) => setGroupBy(value as ReminderGrouping | ""),
          options: GROUPINGS,
        }}
        view={{
          value: view,
          onChange: changeView,
          options: [
            { value: "list", label: "List", icon: VIEW_ICONS.list },
            { value: "timeline", label: "Timeline", icon: VIEW_ICONS.kanban },
          ],
        }}
        actions={
          !readOnly ? (
            <>
              <RepeatFilter value={repeatFilter} onChange={setRepeatFilter} />
              <Button onClick={openCreate}>
                <Plus /> New reminder
              </Button>
            </>
          ) : null
        }
      />

      {effectiveSelected.size > 0 && !readOnly ? (
        <BulkBar
          count={effectiveSelected.size}
          pending={pending}
          onComplete={() => run("Completed", () => bulkCompleteRemindersAction([...effectiveSelected]))}
          onMute={() => run("Muted", () => bulkSetRemindersEnabledAction([...effectiveSelected], false))}
          onUnmute={() => run("Unmuted", () => bulkSetRemindersEnabledAction([...effectiveSelected], true))}
          onDelete={() => setBulkDeleting(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={reminders.length === 0 ? Bell : Search}
          title={reminders.length === 0 ? "No reminders yet" : "No matching reminders"}
          description={
            reminders.length === 0
              ? "Create a reminder, or attach one to a project so it shows up there too."
              : "Try clearing a filter or searching for something else."
          }
          action={
            reminders.length === 0 ? (
              readOnly ? undefined : (
                <Button onClick={openCreate}>
                  <Plus /> Create a reminder
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setRepeatFilter("any");
                  router.push(pathname);
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : view === "timeline" ? (
        <TimelineView
          items={filtered}
          readOnly={readOnly}
          pending={pending}
          onComplete={(item, done) =>
            act(done ? "Reopened" : "Completed", () => completeReminderAction(item.id, done))
          }
          onToggleEnabled={(item) =>
            act(item.is_enabled ? "Muted" : "Unmuted", () =>
              toggleReminderEnabledAction(item.id)
            )
          }
        />
      ) : (
        <ListView
          groups={groups}
          selected={effectiveSelected}
          readOnly={readOnly}
          pending={pending}
          now={now}
          onToggleSelected={toggleSelected}
          onComplete={(item, done) =>
            act(done ? "Reopened" : "Completed", () => completeReminderAction(item.id, done))
          }
          onSnooze={(item, minutes) =>
            act("Snoozed", () => snoozeReminderAction(item.id, minutes))
          }
          onSnoozeTomorrow={(item) =>
            act("Snoozed until tomorrow", () =>
              snoozeReminderAction(item.id, undefined, snoozeUntilTomorrow(now))
            )
          }
          onUnsnooze={(item) => act("Restored", () => unsnoozeReminderAction(item.id))}
          onToggleEnabled={(item) =>
            act(item.is_enabled ? "Muted" : "Unmuted", () =>
              toggleReminderEnabledAction(item.id)
            )
          }
          onEdit={(item) => {
            setEditing(item);
            setFormOpen(true);
          }}
          onDelete={(item) => setDeleting(item)}
        />
      )}

      <ReminderFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        projects={projects}
        tasks={tasks}
        nodes={nodes}
        notes={notes}
        reminder={editing}
        defaultProjectId={initialProjectId && initialProjectId !== "personal" ? initialProjectId : ""}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="This permanently removes the reminder."
        confirmLabel="Delete reminder"
        onConfirm={async () => {
          if (!deleting) return;
          startTransition(async () => {
            const result = await deleteReminderAction(deleting.id);
            setDeleting(null);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Reminder deleted.");
            router.refresh();
          });
        }}
      />

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Delete ${effectiveSelected.size} reminder${effectiveSelected.size === 1 ? "" : "s"}?`}
        description="This permanently deletes the selected reminders."
        confirmLabel="Delete reminders"
        onConfirm={async () => {
          const ids = [...effectiveSelected];
          setBulkDeleting(false);
          startTransition(async () => {
            const result = await bulkDeleteRemindersAction(ids);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success(`Deleted ${result.affected ?? 0} reminders.`);
            setSelected(new Set());
            router.refresh();
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar extras
// ---------------------------------------------------------------------------

function RepeatFilter({
  value,
  onChange,
}: {
  value: "any" | "repeating" | "once";
  onChange: (value: "any" | "repeating" | "once") => void;
}) {
  const options: Array<{ value: "any" | "repeating" | "once"; label: string }> = [
    { value: "any", label: "All" },
    { value: "repeating", label: "Repeating" },
    { value: "once", label: "One-off" },
  ];

  return (
    <div role="group" aria-label="Repeat" className="flex items-center gap-0.5 rounded-lg border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function BulkBar({
  count,
  pending,
  onComplete,
  onMute,
  onUnmute,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  onComplete: () => void;
  onMute: () => void;
  onUnmute: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
      <span className="flex items-center gap-2 px-1 text-sm font-medium">
        {count} selected
      </span>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" onClick={onComplete} disabled={pending}>
        <CheckCircle2 /> Complete
      </Button>
      <Button size="sm" variant="outline" onClick={onMute} disabled={pending}>
        Mute
      </Button>
      <Button size="sm" variant="outline" onClick={onUnmute} disabled={pending}>
        Unmute
      </Button>

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

function ListView({
  groups,
  selected,
  readOnly,
  pending,
  now,
  onToggleSelected,
  onComplete,
  onSnooze,
  onSnoozeTomorrow,
  onUnsnooze,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  groups: ReturnType<typeof groupReminders>;
  selected: Set<string>;
  readOnly: boolean;
  pending: boolean;
  now: Date;
  onToggleSelected: (id: string) => void;
  onComplete: (item: ReminderListItem, done: boolean) => void;
  onSnooze: (item: ReminderListItem, minutes: number) => void;
  onSnoozeTomorrow: (item: ReminderListItem) => void;
  onUnsnooze: (item: ReminderListItem) => void;
  onToggleEnabled: (item: ReminderListItem) => void;
  onEdit: (item: ReminderListItem) => void;
  onDelete: (item: ReminderListItem) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          <header className="flex items-center gap-2 px-1">
            {!readOnly ? (
              <Checkbox
                checked={group.items.length > 0 && group.items.every((item) => selected.has(item.id))}
                onCheckedChange={() => {
                  const ids = group.items.map((item) => item.id);
                  const everySelected = ids.every((id) => selected.has(id));
                  for (const id of ids) {
                    if (everySelected === selected.has(id)) onToggleSelected(id);
                  }
                }}
                aria-label={`Select all in ${group.label}`}
                className="size-4"
              />
            ) : null}
            <h3
              className={cn(
                "text-xs font-medium tracking-wide uppercase",
                group.id === "overdue" && "text-destructive"
              )}
            >
              {group.id === "all" ? group.label : STATE_LABEL[group.id] ?? group.label}
            </h3>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {group.items.length}
            </span>
          </header>

          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {group.items.map((item) => (
              <ReminderRow
                key={item.id}
                item={item}
                state={deriveReminderState(item, now)}
                checked={selected.has(item.id)}
                readOnly={readOnly}
                pending={pending}
                onToggleSelected={() => onToggleSelected(item.id)}
                onComplete={onComplete}
                onSnooze={onSnooze}
                onSnoozeTomorrow={onSnoozeTomorrow}
                onUnsnooze={onUnsnooze}
                onToggleEnabled={onToggleEnabled}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ReminderRow({
  item,
  state,
  checked,
  readOnly,
  pending,
  onToggleSelected,
  onComplete,
  onSnooze,
  onSnoozeTomorrow,
  onUnsnooze,
  onToggleEnabled,
  onEdit,
  onDelete,
}: {
  item: ReminderListItem;
  state: string;
  checked: boolean;
  readOnly: boolean;
  pending: boolean;
  onToggleSelected: () => void;
  onComplete: (item: ReminderListItem, done: boolean) => void;
  onSnooze: (item: ReminderListItem, minutes: number) => void;
  onSnoozeTomorrow: (item: ReminderListItem) => void;
  onUnsnooze: (item: ReminderListItem) => void;
  onToggleEnabled: (item: ReminderListItem) => void;
  onEdit: (item: ReminderListItem) => void;
  onDelete: (item: ReminderListItem) => void;
}) {
  const done = isDone(item);
  const live = isLive(item);
  const repeat = repeatSummary(item);

  return (
    <li
      className={cn(
        "group flex items-start gap-3 border-b border-border/50 p-3 transition last:border-0 hover:bg-accent/30",
        state === "overdue" && "bg-destructive/5",
        done && "opacity-60",
        !item.is_enabled && !done && "opacity-70"
      )}
    >
      {!readOnly ? (
        <Checkbox
          checked={checked}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${item.title}`}
          className="mt-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
        />
      ) : null}

      <button
        type="button"
        onClick={() => !readOnly && onComplete(item, !done)}
        disabled={readOnly || pending}
        aria-label={done ? `Reopen ${item.title}` : `Complete ${item.title}`}
        className="mt-0.5 shrink-0 disabled:cursor-default"
      >
        {done ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : state === "overdue" ? (
          <CircleAlert className="size-5 text-destructive" />
        ) : (
          <span
            className={cn(
              "block size-5 rounded-full border-2 transition",
              item.is_enabled
                ? "border-primary"
                : "border-muted-foreground/40",
              "group-hover:border-primary"
            )}
          />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn("text-sm font-medium", done && "line-through")}>{item.title}</p>
          {item.priority !== "none" ? (
            <Badge
              variant="secondary"
              className={cn(
                "rounded-full px-1.5 py-0 text-[10px]",
                item.priority === "urgent" && "bg-destructive/12 text-destructive",
                item.priority === "high" && "bg-warning/12 text-warning"
              )}
            >
              {PRIORITY_LABEL[item.priority]}
            </Badge>
          ) : null}
          {repeat ? (
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Repeat className="size-3" />
              {repeat}
            </span>
          ) : null}
        </div>

        {item.note ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.note}</p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
          <span className={cn(state === "overdue" && "font-medium text-destructive")}>
            {formatDateTime(item.remind_at)}
          </span>
          {state === "overdue" ? (
            <span className="font-medium text-destructive">Overdue</span>
          ) : null}
          {item.snoozed_until ? (
            <span className="text-warning">
              Snoozed until {formatDateTime(item.snoozed_until)}
            </span>
          ) : null}
          {item.project_id ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: item.project_color ?? "var(--primary)" }}
              />
              {item.project_name}
            </span>
          ) : (
            <span className="text-muted-foreground">Personal</span>
          )}
          {item.task_id ? (
            <Link
              href={`/tasks/${item.task_id}`}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
            >
              <ListTodo className="size-3" />
              Task
            </Link>
          ) : null}
          {item.advance_minutes > 0 ? (
            <span className="text-muted-foreground">{item.advance_minutes}m early</span>
          ) : null}
        </div>
      </div>

      {!readOnly ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          {live && !done ? (
            <SnoozeMenu item={item} pending={pending} onSnooze={onSnooze} onSnoozeTomorrow={onSnoozeTomorrow} />
          ) : null}
          {item.status === "snoozed" ? (
            <Button variant="outline" size="sm" onClick={() => onUnsnooze(item)} disabled={pending}>
              Restore
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={item.is_enabled ? `Mute ${item.title}` : `Unmute ${item.title}`}
            onClick={() => onToggleEnabled(item)}
            disabled={pending}
          >
            {item.is_enabled ? (
              <AlarmClock className="size-3.5" />
            ) : (
              <AlarmClockOff className="size-3.5 text-muted-foreground" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Edit ${item.title}`}
            onClick={() => onEdit(item)}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.title}`}
            onClick={() => onDelete(item)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function SnoozeMenu({
  item,
  pending,
  onSnooze,
  onSnoozeTomorrow,
}: {
  item: ReminderListItem;
  pending: boolean;
  onSnooze: (item: ReminderListItem, minutes: number) => void;
  onSnoozeTomorrow: (item: ReminderListItem) => void;
}) {
  // A muted reminder still shows its snooze control — muting stops the
  // automatic fire, not the manual "remind me in an hour".
  const presets = item.snooze_minutes
    ? [{ label: `${item.snooze_minutes}m`, minutes: item.snooze_minutes }, ...SNOOZE_PRESETS]
    : SNOOZE_PRESETS;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {presets.slice(0, 2).map((preset) => (
        <Button
          key={preset.minutes}
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => onSnooze(item, preset.minutes)}
        >
          {preset.label}
        </Button>
      ))}
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => onSnoozeTomorrow(item)}
      >
        Tomorrow
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timeline view — upcoming reminders laid out against a clock
// ---------------------------------------------------------------------------

function TimelineView({
  items,
  readOnly,
  pending,
  onComplete,
  onToggleEnabled,
}: {
  items: ReminderListItem[];
  readOnly: boolean;
  pending: boolean;
  onComplete: (item: ReminderListItem, done: boolean) => void;
  onToggleEnabled: (item: ReminderListItem) => void;
}) {
  const days = React.useMemo(() => {
    const buckets = new Map<string, ReminderListItem[]>();
    for (const item of items) {
      const key = new Date(item.remind_at).toDateString();
      const bucket = buckets.get(key) ?? [];
      bucket.push(item);
      buckets.set(key, bucket);
    }
    return [...buckets.entries()].sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      {days.map(([day, dayItems]) => (
        <section key={day} className="flex flex-col gap-2">
          <header className="flex items-center gap-2 px-1">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {new Date(day).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h3>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {dayItems.length}
            </span>
          </header>

          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {dayItems.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-center gap-3 border-b border-border/50 p-3 transition last:border-0 hover:bg-accent/30",
                  isDone(item) && "opacity-60"
                )}
              >
                <span className="w-16 shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  {new Date(item.remind_at).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>

                <span
                  aria-hidden="true"
                  className="h-8 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: item.project_color ?? "var(--primary)" }}
                />

                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-sm font-medium", isDone(item) && "line-through")}>
                    {item.title}
                  </p>
                  <ScheduleSummary
                    remindAt={item.project_name ?? "Personal"}
                    advanceMinutes={item.advance_minutes}
                    repeat={repeatSummary(item)}
                    isEnabled={item.is_enabled}
                  />
                </div>

                {!readOnly ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={item.is_enabled ? `Mute ${item.title}` : `Unmute ${item.title}`}
                      onClick={() => onToggleEnabled(item)}
                      disabled={pending}
                    >
                      {item.is_enabled ? (
                        <AlarmClock className="size-3.5" />
                      ) : (
                        <AlarmClockOff className="size-3.5 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={isDone(item) ? `Reopen ${item.title}` : `Complete ${item.title}`}
                      onClick={() => onComplete(item, !isDone(item))}
                      disabled={pending}
                    >
                      <CheckCircle2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

