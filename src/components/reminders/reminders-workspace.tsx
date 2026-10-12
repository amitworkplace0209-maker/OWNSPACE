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
  ChevronRight,
  CircleAlert,
  CloudOff,
  FolderKanban,
  ListTodo,
  Pencil,
  Plus,
  Radio,
  Repeat,
  Search,
  Trash2,
  TriangleAlert,
  User,
  WifiOff,
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
import { QuickAddBar } from "@/components/reminders/quick-add-bar";
import { NotificationSettingsButton } from "@/components/reminders/notification-settings";
import { ReminderNotifier } from "@/components/reminders/reminder-notifier";
import {
  bulkCompleteRemindersAction,
  bulkDeleteRemindersAction,
  bulkReopenRemindersAction,
  bulkRescheduleRemindersAction,
  bulkSetReminderPriorityAction,
  bulkSetRemindersEnabledAction,
  bulkSnoozeRemindersAction,
  deleteReminderAction,
} from "@/lib/actions/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { formatDateTime, toIsoSubmit } from "@/lib/format";
import { useRemindersLive } from "@/hooks/use-reminders-live";
import type { CachedProject } from "@/lib/offline/reminder-cache";
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
 * "scope" is not a `ReminderGrouping` — it is a grouping this workspace adds,
 * splitting the list into Personal plus one section per project. It is kept out
 * of the shared union so the pure `groupReminders` never has to know about it.
 */
type GroupChoice = ReminderGrouping | "scope";

/**
 * Reminders.
 *
 * Shows project reminders and personal ones in the same list, because from the
 * user's side they are one inbox — a personal reminder simply has no project on
 * it. The old version split them apart and hid every advanced scheduling field
 * (repeat, channels, priority, advance), even though the database had carried
 * those columns since migration 017.
 *
 * Four things are layered on top of that original list, each isolated in its
 * own file so this component stays readable:
 *
 *   - `useRemindersLive` — realtime patching plus an offline queue, so the list
 *     stays live and every action still works with no connection.
 *   - The app-wide `ReminderNotifier` in the app layout — fires due reminders
 *     as toasts or OS notifications, obeying this device's own quiet hours,
 *     priority floor and digest setting. Not mounted here: one instance owns the
 *     tick, and a second would double-alert.
 *   - `QuickAddBar` — "tomorrow 9am standup" without opening the form.
 *   - `NotificationSettingsButton` — the per-device alert configuration.
 */
export function RemindersWorkspace({
  reminders,
  stats,
  projects,
  tasks,
  nodes,
  notes,
  userId,
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
  /** Namespaces the offline cache and the fired-alert history. */
  userId: string;
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
  const [groupBy, setGroupBy] = React.useState<GroupChoice | "">("");
  const [view, setView] = React.useState<ViewMode>("list");
  const [repeatFilter, setRepeatFilter] = React.useState<"any" | "repeating" | "once">("any");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ReminderListItem | null>(null);
  const [deleting, setDeleting] = React.useState<ReminderListItem | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = React.useState(false);
  const [rescheduleAt, setRescheduleAt] = React.useState("");
  const [pending, startTransition] = useTransition();

  // Projects are cached alongside the reminders so the offline page can still
  // name them; only the fields the list renders are kept.
  const cachedProjects = React.useMemo<CachedProject[]>(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color,
        status: project.status,
        icon: project.icon,
        is_pinned: project.is_pinned,
        is_favorite: project.is_favorite,
      })),
    [projects]
  );

  const { status: liveStatus, liveReminders, queuedCount, update, syncNow } =
    useRemindersLive({
      userId,
      reminders,
      projects: cachedProjects,
      enabled: !readOnly,
    });

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
        liveReminders,
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
    [liveReminders, query, initialProjectId, initialPriority, initialStatus, repeatFilter, now]
  );

  // Selection is derived, not pruned: anything no longer visible is simply
  // absent, so a bulk action can never target a row that is off screen.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(filtered.map((item) => item.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, filtered]);

  // Group by scope by default rather than by state. "Personal" and each project
  // become their own section, which is the split the user actually thinks in —
  // grouping by state scattered one project's reminders across four headers.
  // Inside a project the default falls back to state, because that is the order
  // a single project's reminders are worked in.
  const effectiveGroup: GroupChoice = groupBy || (initialProjectId ? "state" : "scope");

  const groups = React.useMemo(
    () =>
      effectiveGroup === "scope"
        ? groupByScope(filtered)
        : groupReminders(filtered, effectiveGroup || "none", now),
    [filtered, effectiveGroup, now]
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
      projects: new Set(
        filtered.filter((item) => item.project_id).map((item) => item.project_id as string)
      ).size,
    };
  }, [filtered, now]);

  const statItems: StatStripItem[] = [
    {
      id: "all",
      label: "Total",
      value: stats.total,
      icon: AlarmClock,
      tone: "neutral",
      hint: `${stats.personal} personal · ${visibleStats.projects} projects`,
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

  function run(
    label: string,
    action: () => Promise<{ error?: string; affected?: number }>
  ) {
    if (effectiveSelected.size === 0) return;

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.affected ?? 0;
      toast.success(`${label} ${count} reminder${count === 1 ? "" : "s"}.`);
      setSelected(new Set());
      setBulkMenuOpen(false);
      router.refresh();
    });
  }

  /** Reschedule takes an explicit date, so it validates before calling the server. */
  function reschedule() {
    if (!rescheduleAt) {
      toast.error("Pick a new date and time first.");
      return;
    }
    run("Rescheduled", () =>
      bulkRescheduleRemindersAction([...effectiveSelected], toIsoSubmit(rescheduleAt))
    );
    setRescheduleAt("");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The notifier is not mounted here: it lives in the app layout so a
          reminder alerts from any page, and two instances would each raise their
          own toast for the same reminder. */}
      <SyncStrip status={liveStatus} queuedCount={queuedCount} onRetry={syncNow} />

      <StatStrip items={statItems} activeId={activeTile} />

      {!readOnly ? (
        <QuickAddBar
          defaultProjectId={
            initialProjectId && initialProjectId !== "personal" ? initialProjectId : ""
          }
        />
      ) : null}

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
          value: effectiveGroup,
          onChange: (value) => setGroupBy(value as GroupChoice),
          options: [{ value: "scope", label: "Personal & projects" }, ...GROUPINGS],
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
              <NotificationSettingsButton />
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
          menuOpen={bulkMenuOpen}
          onMenuOpenChange={setBulkMenuOpen}
          rescheduleAt={rescheduleAt}
          onRescheduleChange={setRescheduleAt}
          onReschedule={reschedule}
          onSnooze={(minutes) =>
            run("Snoozed", () => bulkSnoozeRemindersAction([...effectiveSelected], minutes))
          }
          onSnoozeTomorrow={() =>
            run("Snoozed until tomorrow", () =>
              bulkRescheduleRemindersAction(
                [...effectiveSelected],
                toIsoSubmit(snoozeUntilTomorrow(now).toISOString())
              )
            )
          }
          onPriority={(priority) =>
            run("Reprioritised", () =>
              bulkSetReminderPriorityAction([...effectiveSelected], priority)
            )
          }
          onComplete={() => run("Completed", () => bulkCompleteRemindersAction([...effectiveSelected]))}
          onReopen={() => run("Reopened", () => bulkReopenRemindersAction([...effectiveSelected]))}
          onMute={() =>
            run("Muted", () => bulkSetRemindersEnabledAction([...effectiveSelected], false))
          }
          onUnmute={() =>
            run("Unmuted", () => bulkSetRemindersEnabledAction([...effectiveSelected], true))
          }
          onDelete={() => setBulkDeleting(true)}
          onClear={() => {
            setSelected(new Set());
            setBulkMenuOpen(false);
          }}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={reminders.length === 0 ? Bell : Search}
          title={reminders.length === 0 ? "No reminders yet" : "No matching reminders"}
          description={
            reminders.length === 0
              ? "Add one above in a single line — “tomorrow 9am standup” — or open the full form."
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
          onComplete={(item, done) => void update(item.id, { kind: "complete", value: done })}
          onToggleEnabled={(item) =>
            void update(item.id, { kind: "enabled", value: !item.is_enabled })
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
          onComplete={(item, done) => void update(item.id, { kind: "complete", value: done })}
          onSnooze={(item, minutes) =>
            void update(item.id, {
              kind: "snooze",
              value: new Date(Date.now() + minutes * 60_000).toISOString(),
            })
          }
          onSnoozeTomorrow={(item) =>
            void update(item.id, {
              kind: "snooze",
              value: snoozeUntilTomorrow(now).toISOString(),
            })
          }
          onUnsnooze={(item) => void update(item.id, { kind: "unsnooze", value: "" })}
          onToggleEnabled={(item) =>
            void update(item.id, { kind: "enabled", value: !item.is_enabled })
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
        defaultProjectId={
          initialProjectId && initialProjectId !== "personal" ? initialProjectId : ""
        }
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
          const target = deleting;
          setDeleting(null);
          await deleteReminderAction(target.id);
          toast.success("Reminder deleted.");
          router.refresh();
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
// Connection + sync status
// ---------------------------------------------------------------------------

/**
 * A single honest line about connectivity and the offline queue.
 *
 * Shown only when there is something to say. A permanently visible "connected"
 * badge is noise that trains people to stop reading status indicators — but the
 * moment an edit is queued and unsent, that is exactly when the user needs to
 * know their change is not on the server yet.
 */
function SyncStrip({
  status,
  queuedCount,
  onRetry,
}: {
  status: "connecting" | "live" | "offline" | "error";
  queuedCount: number;
  onRetry: () => void;
}) {
  if (status === "live" && queuedCount === 0) return null;

  const offline = status === "offline";

  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs",
        offline || queuedCount > 0
          ? "border-warning/40 bg-warning/10 text-warning"
          : "border-border bg-card text-muted-foreground"
      )}
    >
      {offline ? (
        <WifiOff aria-hidden="true" className="size-3.5 shrink-0" />
      ) : (
        <Radio aria-hidden="true" className="size-3.5 shrink-0" />
      )}

      <span className="font-medium">
        {offline ? "Working offline" : status === "error" ? "Live updates interrupted" : "Connecting…"}
      </span>

      <span className="text-current/80">
        {offline
          ? queuedCount > 0
            ? `${queuedCount} change${queuedCount === 1 ? "" : "s"} saved here and syncing when you reconnect.`
            : "Your reminders are readable and editable. Changes are saved on this device."
          : queuedCount > 0
            ? `${queuedCount} change${queuedCount === 1 ? "" : "s"} waiting to sync.`
            : "Live updates are reconnecting."}
      </span>

      {(offline || status === "error") && queuedCount > 0 ? (
        <Button variant="outline" size="xs" onClick={onRetry} className="ml-auto">
          Retry now
        </Button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scope grouping — personal vs each project
// ---------------------------------------------------------------------------

/**
 * Groups into one "Personal" section plus one per project, each keeping its
 * project's own ordering.
 *
 * Uses `sortReminders` inside every bucket so a project's rows stay in the
 * urgency order the list view would have given them, rather than inheriting
 * whatever order the filter happened to leave them in.
 */
function groupByScope(reminders: ReminderListItem[]) {
  const personal: ReminderListItem[] = [];
  const byProject = new Map<string, { label: string; items: ReminderListItem[] }>();

  for (const reminder of reminders) {
    if (!reminder.project_id) {
      personal.push(reminder);
      continue;
    }
    const bucket = byProject.get(reminder.project_id) ?? {
      label: reminder.project_name ?? "Project",
      items: [],
    };
    bucket.items.push(reminder);
    byProject.set(reminder.project_id, bucket);
  }

  const groups = [];
  if (personal.length > 0) {
    groups.push({ id: "personal", label: "Personal", items: sortRemindersLocal(personal) });
  }
  for (const [id, bucket] of byProject) {
    groups.push({ id: `project:${id}`, label: bucket.label, items: sortRemindersLocal(bucket.items) });
  }
  return groups;
}

/** Local re-export so this file does not import a sort it does not own. */
function sortRemindersLocal(reminders: ReminderListItem[]): ReminderListItem[] {
  return [...reminders].sort((a, b) => {
    const aLive = isLive(a) ? 0 : 1;
    const bLive = isLive(b) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    if (aLive === 0 && a.remind_at !== b.remind_at) {
      return a.remind_at.localeCompare(b.remind_at);
    }
    const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as Record<string, number>;
    const diff = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title);
  });
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
    <div
      role="group"
      aria-label="Repeat"
      className="flex items-center gap-0.5 rounded-lg border p-0.5"
    >
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
  menuOpen,
  onMenuOpenChange,
  rescheduleAt,
  onRescheduleChange,
  onReschedule,
  onSnooze,
  onSnoozeTomorrow,
  onPriority,
  onComplete,
  onReopen,
  onMute,
  onUnmute,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  rescheduleAt: string;
  onRescheduleChange: (value: string) => void;
  onReschedule: () => void;
  onSnooze: (minutes: number) => void;
  onSnoozeTomorrow: () => void;
  onPriority: (priority: Priority) => void;
  onComplete: () => void;
  onReopen: () => void;
  onMute: () => void;
  onUnmute: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
      <span className="flex items-center gap-2 px-1 text-sm font-medium">{count} selected</span>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" onClick={onComplete} disabled={pending}>
        <CheckCircle2 /> Complete
      </Button>

      {/* Snooze and reschedule both move the time, so they live behind one
          control rather than two adjacent buttons competing for the row. */}
      <ScheduleMenu
        open={menuOpen}
        onOpenChange={onMenuOpenChange}
        pending={pending}
        rescheduleAt={rescheduleAt}
        onRescheduleChange={onRescheduleChange}
        onReschedule={onReschedule}
        onSnooze={onSnooze}
        onSnoozeTomorrow={onSnoozeTomorrow}
        onPriority={onPriority}
      />

      <Button variant="outline" size="sm" onClick={onMute} disabled={pending}>
        Mute
      </Button>
      <Button variant="outline" size="sm" onClick={onUnmute} disabled={pending}>
        Unmute
      </Button>
      <Button variant="ghost" size="sm" onClick={onReopen} disabled={pending}>
        Reopen
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

function ScheduleMenu({
  open,
  onOpenChange,
  pending,
  rescheduleAt,
  onRescheduleChange,
  onReschedule,
  onSnooze,
  onSnoozeTomorrow,
  onPriority,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  rescheduleAt: string;
  onRescheduleChange: (value: string) => void;
  onReschedule: () => void;
  onSnooze: (minutes: number) => void;
  onSnoozeTomorrow: () => void;
  onPriority: (priority: Priority) => void;
}) {
  const presets = SNOOZE_PRESETS.filter((preset) => preset.minutes > 0);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" disabled={pending} className="gap-1.5">
            <CalendarClock /> Reschedule <ChevronRight className="size-3.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-60 p-2">
        <DropdownMenuLabel className="px-1 pb-1 text-xs">Snooze by</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1">
          {presets.map((preset) => (
            <Button
              key={preset.minutes}
              variant="ghost"
              size="xs"
              onClick={() => onSnooze(preset.minutes)}
            >
              {preset.label}
            </Button>
          ))}
          <Button variant="ghost" size="xs" onClick={onSnoozeTomorrow}>
            Tomorrow
          </Button>
        </div>

        <DropdownMenuSeparator className="my-2" />

        <DropdownMenuLabel className="px-1 pb-1 text-xs">Move to a date</DropdownMenuLabel>
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={rescheduleAt}
            onChange={(event) => onRescheduleChange(event.target.value)}
            aria-label="New date and time"
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          />
          <Button size="xs" onClick={onReschedule} disabled={pending || !rescheduleAt}>
            Set
          </Button>
        </div>

        <DropdownMenuSeparator className="my-2" />

        <DropdownMenuLabel className="px-1 pb-1 text-xs">Set priority</DropdownMenuLabel>
        <div className="flex flex-wrap gap-1">
          {PRIORITIES.map((priority) => (
            <Button
              key={priority}
              variant="ghost"
              size="xs"
              onClick={() => onPriority(priority)}
            >
              {PRIORITY_LABEL[priority]}
            </Button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
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
      {groups.map((group) => {
        const isScope = group.id === "personal" || group.id.startsWith("project:");
        return (
          <section key={group.id} className="flex flex-col gap-2">
            <header className="flex items-center gap-2 px-1">
              {!readOnly ? (
                <Checkbox
                  checked={
                    group.items.length > 0 && group.items.every((item) => selected.has(item.id))
                  }
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

              {isScope ? (
                group.id === "personal" ? (
                  <User aria-hidden="true" className="size-3.5 text-muted-foreground" />
                ) : (
                  <FolderKanban aria-hidden="true" className="size-3.5 text-muted-foreground" />
                )
              ) : null}

              <h3
                className={cn(
                  "text-xs font-medium tracking-wide uppercase",
                  group.id === "overdue" && "text-destructive"
                )}
              >
                {group.id === "all"
                  ? group.label
                  : isScope
                    ? group.label
                    : STATE_LABEL[group.id] ?? group.label}
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
        );
      })}
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
              item.is_enabled ? "border-primary" : "border-muted-foreground/40",
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
          {/* Says so plainly rather than letting a pending edit look saved. */}
          {item.pending ? (
            <span className="flex items-center gap-1 text-[11px] text-warning">
              <CloudOff className="size-3" />
              Not synced
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
            <SnoozeMenu
              item={item}
              pending={pending}
              onSnooze={onSnooze}
              onSnoozeTomorrow={onSnoozeTomorrow}
            />
          ) : null}
          {item.status === "snoozed" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onUnsnooze(item)}
              disabled={pending}
            >
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
    ? [
        { label: `${item.snooze_minutes}m`, minutes: item.snooze_minutes },
        ...SNOOZE_PRESETS,
      ]
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
    return [...buckets.entries()].sort(
      (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()
    );
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
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      isDone(item) && "line-through"
                    )}
                  >
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
                      aria-label={
                        item.is_enabled ? `Mute ${item.title}` : `Unmute ${item.title}`
                      }
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