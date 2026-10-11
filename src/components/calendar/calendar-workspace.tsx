"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  ListTodo,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar } from "@/components/shared/workspace-toolbar";
import { ColorSelector } from "@/components/project-creator/color-selector";
import {
  AgendaView,
  DayView,
  MonthView,
  WeekView,
} from "@/components/calendar/calendar-views";
import {
  EVENT_TYPE_COLORS,
  SOURCE_STYLES,
  itemColor,
  shiftDays,
  shiftMonths,
  startOfWeek,
  type CalendarFilterState,
} from "@/lib/calendar-logic";
import { createEventAction, deleteEventAction, updateEventAction } from "@/lib/actions/calendar";
import { formatTime, toIsoSubmit } from "@/lib/format";
import { EVENT_TYPES, type CalendarEvent, type Project } from "@/types";
import type { CalendarBundle, CalendarItem, CalendarSource } from "@/lib/dal/calendar-bundle";
import { cn } from "cn";

type EventFormState = { error?: string; data?: { id: string } };

const EVENT_TYPE_LABELS: Record<string, string> = {
  event: "Event",
  meeting: "Meeting",
  appointment: "Appointment",
  personal: "Personal",
};

const SOURCE_ICONS: Record<CalendarSource, typeof ListTodo> = {
  event: CalendarDays,
  task: ListTodo,
  reminder: CalendarClock,
  milestone: Flag,
};

const SOURCE_ORDER: CalendarSource[] = ["event", "task", "reminder", "milestone"];

type ViewMode = "month" | "week" | "day" | "agenda";

const VIEW_OPTIONS: Array<{ value: ViewMode; label: string; icon: React.ReactNode }> = [
  { value: "month", label: "Month", icon: <CalendarDays className="size-4" /> },
  { value: "week", label: "Week", icon: <CalendarRange className="size-4" /> },
  { value: "day", label: "Day", icon: <Clock className="size-4" /> },
  { value: "agenda", label: "Agenda", icon: <ListTodo className="size-4" /> },
];

/**
 * Calendar.
 *
 * Reads one `CalendarBundle` — events, task deadlines, reminders and milestones
 * projected into a single list — so all four views agree about what is on a
 * day. The old version queried only `calendar_events`, which meant a task due
 * today simply did not appear on the calendar at all.
 */
export function CalendarWorkspace({
  bundle,
  projects,
  initialMonth,
  todayIso,
  focusId,
}: {
  bundle: CalendarBundle;
  projects: Project[];
  initialMonth: string;
  todayIso: string;
  /** Set when the user arrived from a notification, to open one item. */
  focusId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [month, setMonth] = React.useState(initialMonth);
  const [selectedDate, setSelectedDate] = React.useState(todayIso);
  const [view, setView] = React.useState<ViewMode>("month");
  const [query, setQuery] = React.useState("");
  const [sources, setSources] = React.useState<CalendarSource[]>([]);
  const [projectId, setProjectId] = React.useState("");
  const [eventOpen, setEventOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CalendarEvent | null>(null);
  const [detail, setDetail] = React.useState<CalendarItem | null>(() =>
    // Arriving from a notification deep-links one item. The bundle is already
    // resolved on first render, so this resolves at init instead of in an effect.
    bundle.items.find((item) => item.id === focusId) ?? null
  );

  // View preference is read once, after hydration, through a rAF so it never
  // fights React over the server-rendered markup.
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:calendar:view") as ViewMode | null;
    if (saved && VIEW_OPTIONS.some((option) => option.value === saved)) {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  function changeView(next: string) {
    setView(next as ViewMode);
    window.localStorage.setItem("ownspece:calendar:view", next);
  }

  function navigateMonth(next: string) {
    setMonth(next);
    setSelectedDate(`${next}-01`);
    router.push(`${pathname}?month=${next}`);
  }

  function shiftDateBy(delta: number) {
    if (view === "week") {
      setSelectedDate((current) => shiftDays(current, delta * 7));
      return;
    }
    if (view === "day") {
      setSelectedDate((current) => shiftDays(current, delta));
      return;
    }
    navigateMonth(shiftMonths(month, delta));
  }

  function goToday() {
    setMonth(todayIso.slice(0, 7));
    setSelectedDate(todayIso);
    router.push(`${pathname}?month=${todayIso.slice(0, 7)}`);
  }

  function openCreate(date: string) {
    setEditing(null);
    setSelectedDate(date);
    setEventOpen(true);
  }

  // A task/reminder/milestone has no edit form here, so selecting one explains
  // what it is and links to the place that can actually change it, rather than
  // opening a form that would not save.
  function selectItem(item: CalendarBundle["items"][number]) {
    if (item.source === "event") {
      const full = bundle.items.find((entry) => entry.key === item.key);
      if (full) setDetail(full as never);
      return;
    }
    if (item.href) {
      router.push(item.href);
      return;
    }
    setSelectedDate(item.date);
    toast(`${SOURCE_STYLES[item.source].label}: ${item.title}`);
  }

  const filter: CalendarFilterState = { query, sources, projectId, types: [] };

  const statItems: StatStripItem[] = [
    { id: "all", label: "This month", value: bundle.stats.total, icon: CalendarDays, tone: "neutral" },
    { id: "today", label: "Today", value: bundle.stats.today, icon: Clock, tone: "info" },
    { id: "week", label: "This week", value: bundle.stats.thisWeek, icon: CalendarRange, tone: "warning" },
    {
      id: "overdue",
      label: "Overdue",
      value: bundle.stats.overdue,
      icon: TriangleAlert,
      tone: bundle.stats.overdue > 0 ? "danger" : "success",
    },
    {
      id: "allDay",
      label: "All-day",
      value: bundle.stats.allDay,
      icon: Flag,
      tone: "success",
    },
  ];

  const stepLabel =
    view === "month"
      ? new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })
      : view === "week"
        ? rangeLabel(shiftDays(startOfWeek(selectedDate), 0), shiftDays(startOfWeek(selectedDate), 6))
        : view === "day"
          ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
          : "Upcoming";

  const projectOptions = [
    { value: "", label: "All projects" },
    ...projects.map((project) => ({ value: project.id, label: project.name })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} />

      <WorkspaceToolbar
        filters={[
          // Source filtering lives in the SourceToggles chips below: they are
          // real toggles, whereas a <select> can only ever add a source and
          // never remove it again.
          ...(projects.length > 0
            ? [
                {
                  param: "project",
                  label: "Project",
                  value: projectId,
                  options: projectOptions,
                },
              ]
            : []),
        ]}
        onFilterChange={(param, value) => {
          if (param === "project") setProjectId(value);
        }}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search events, tasks, projects…",
          label: "Search the calendar",
        }}
        view={{ value: view, onChange: changeView, options: VIEW_OPTIONS }}
        actions={
          <>
            <SourceToggles
              active={sources}
              counts={bundle.stats.bySource}
              onToggle={(source) =>
                setSources((current) =>
                  current.includes(source)
                    ? current.filter((entry) => entry !== source)
                    : [...current, source]
                )
              }
            />
            <Button onClick={() => openCreate(selectedDate)}>
              <Plus /> New event
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftDateBy(-1)}
            aria-label={`Previous ${view}`}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => shiftDateBy(1)}
            aria-label={`Next ${view}`}
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
          <h2 className="ml-1 text-lg font-semibold tracking-tight">{stepLabel}</h2>
        </div>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => openCreate(selectedDate)}>
            <Plus /> Add on {view === "month" ? "1st" : "this day"}
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <MonthView
          items={bundle.items}
          selectedDate={selectedDate}
          todayIso={todayIso}
          filter={filter}
          onSelectDate={setSelectedDate}
          onSelectItem={selectItem}
        />
      ) : null}

      {view === "week" ? (
        <WeekView
          items={bundle.items}
          selectedDate={selectedDate}
          todayIso={todayIso}
          filter={filter}
          onSelectDate={setSelectedDate}
          onSelectItem={selectItem}
        />
      ) : null}

      {view === "day" ? (
        <DayView
          items={bundle.items}
          selectedDate={selectedDate}
          todayIso={todayIso}
          filter={filter}
          onSelectItem={selectItem}
        />
      ) : null}

      {view === "agenda" ? (
        <AgendaView
          items={bundle.items}
          todayIso={todayIso}
          filter={filter}
          onSelectItem={selectItem}
        />
      ) : null}

      {/* Keyed by target: switching between "new" and "edit" remounts the form
          with fresh state, rather than resyncing state through an effect. */}
      <EventFormDialog
        key={editing?.id ?? "new"}
        open={eventOpen}
        onOpenChange={(open) => {
          setEventOpen(open);
          if (!open) setEditing(null);
        }}
        projects={projects}
        event={editing}
        defaultDate={selectedDate}
      />

      <EventDetailDialog
        key={detail?.key ?? "none"}
        item={detail}
        onClose={() => setDetail(null)}
        onEdit={(event) => {
          setDetail(null);
          setEditing(event);
          setEventOpen(true);
        }}
        onDeleted={() => {
          setDetail(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function SourceToggles({
  active,
  counts,
  onToggle,
}: {
  active: CalendarSource[];
  counts: Record<CalendarSource, number>;
  onToggle: (source: CalendarSource) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {SOURCE_ORDER.map((source) => {
        const Icon = SOURCE_ICONS[source];
        const isActive = active.length === 0 || active.includes(source);

        return (
          <button
            key={source}
            type="button"
            onClick={() => onToggle(source)}
            aria-pressed={isActive}
            title={`${SOURCE_STYLES[source].label}: ${counts[source]}`}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
              isActive
                ? "border-primary/40 bg-primary/5 text-foreground"
                : "text-muted-foreground opacity-50"
            )}
          >
            <Icon className="size-3" />
            <span className="hidden sm:inline">{SOURCE_STYLES[source].label}</span>
            <span className="tabular-nums">{counts[source]}</span>
          </button>
        );
      })}
    </div>
  );
}

function rangeLabel(from: string, to: string): string {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const sameMonth = start.getMonth() === end.getMonth();

  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(
    undefined,
    sameMonth
      ? { day: "numeric", year: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" }
  )}`;
}

// ---------------------------------------------------------------------------
// Detail dialog — only for real events; other sources link to their own page.
// ---------------------------------------------------------------------------

type DetailItem = CalendarItem;

function EventDetailDialog({
  item,
  onClose,
  onEdit,
  onDeleted,
}: {
  item: DetailItem | null;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, startTransition] = useTransition();

  if (!item) return null;

  const event = item as unknown as CalendarEvent;

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full"
                style={{
                  backgroundColor: itemColor(item) ?? EVENT_TYPE_COLORS.event,
                }}
              />
              {item.title}
            </DialogTitle>
            <DialogDescription>
              {EVENT_TYPE_LABELS[event.event_type] ?? "Event"}
              {item.projectName ? ` · ${item.projectName}` : ""}
            </DialogDescription>
          </DialogHeader>

          <dl className="flex flex-col gap-2 text-sm">
            <Row label="When">
              {item.allDay
                ? "All day"
                : `${formatTime(event.starts_at)}${event.ends_at ? ` – ${formatTime(event.ends_at)}` : ""}`}
            </Row>
            <Row label="Date">{new Date(`${item.date}T00:00:00`).toLocaleDateString()}</Row>
            {event.location ? <Row label="Location">{event.location}</Row> : null}
            {event.description ? <Row label="Notes">{event.description}</Row> : null}
          </dl>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirming(true)}
            >
              Delete
            </Button>
            <Button
              onClick={() => {
                onClose();
                onEdit(event);
              }}
            >
              Edit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete "${item.title}"?`}
        description="This permanently removes the event from your calendar."
        confirmLabel="Delete event"
        onConfirm={async () => {
          startTransition(async () => {
            const result = await deleteEventAction(event.id);
            setConfirming(false);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Event deleted.");
            onDeleted();
            router.refresh();
          });
        }}
      />
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

function EventFormDialog({
  open,
  onOpenChange,
  projects,
  event,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  event: CalendarEvent | null;
  defaultDate: string;
}) {
  const router = useRouter();
  const action = event ? updateEventAction.bind(null, event.id) : createEventAction;
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(action, {
    error: undefined,
  });

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  const [allDay, setAllDay] = React.useState(event?.all_day ?? false);
  const [type, setType] = React.useState(event?.event_type ?? "event");
  const [color, setColor] = React.useState(event?.color ?? "");

  const defaultStart = event ? toLocalInput(event.starts_at) : `${defaultDate}T09:00`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Schedule something on your calendar.</DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            const normalized = new FormData();
            for (const [key, value] of fd.entries()) normalized.append(key, value);
            normalized.set("starts_at", toIsoSubmit(String(fd.get("starts_at") ?? "")));
            normalized.set("ends_at", toIsoSubmit(String(fd.get("ends_at") ?? "")));
            formAction(normalized);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Title" htmlFor="event-title" error={state.error}>
            <Input
              id="event-title"
              name="title"
              defaultValue={event?.title ?? ""}
              placeholder="e.g. Design review"
              required
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts">
              <Input
                type="datetime-local"
                name="starts_at"
                defaultValue={defaultStart}
                required
              />
            </FormField>
            <FormField label="Ends" hint={allDay ? "Not used for all-day events" : undefined}>
              <Input
                type="datetime-local"
                name="ends_at"
                defaultValue={toLocalInput(event?.ends_at ?? "")}
                disabled={allDay}
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="all_day"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="accent-primary"
            />
            All-day event
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              <select
                name="event_type"
                value={type}
                onChange={(e) => setType(e.target.value as CalendarEvent["event_type"])}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                {EVENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {EVENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Project">
              <select
                name="project_id"
                defaultValue={event?.project_id ?? ""}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* Picked, not typed — a hex field nobody can fill in from memory. */}
          <ColorSelector
            value={color || EVENT_TYPE_COLORS[type] || "#0ea5e9"}
            onChange={setColor}
            label="Colour"
          />
          <input type="hidden" name="color" value={color} />

          <FormField label="Location">
            <Input
              name="location"
              defaultValue={event?.location ?? ""}
              placeholder="Where?"
            />
          </FormField>

          <FormField label="Description">
            <Textarea name="description" defaultValue={event?.description ?? ""} rows={2} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : event ? "Save changes" : "Create event"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

