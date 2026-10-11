"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";
import { formatDurationMinutes } from "@/lib/format";
import {
  AlarmClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  ListChecks,
  Moon,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Sun,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import {
  createPlanningEntryAction,
  deleteDailyNoteAction,
  deletePlanningEntryAction,
  saveDailyNoteAction,
  updatePlanningEntryAction,
} from "@/lib/actions/daily-notes";
import { useDayRollover } from "@/hooks/use-day-rollover";
import {
  blockMinutes,
  describeDuration,
  fillColour,
  formatTimeRange,
  filledSections,
  journalStreak,
  longDayLabel,
  relativeDayLabel,
  shiftDate,
  sortPlanning,
  summariseDay,
  weekDates,
  NOTE_SECTIONS,
  type NoteSectionKey,
} from "@/lib/daily-logic";
import { cn } from "cn";
import type { DailyNote, PlanningEntry, Project } from "@/types";

type DueTask = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  priority: string;
  project_id: string | null;
  project_name: string | null;
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function projectById(projects: Project[]): Map<string, Project> {
  return new Map(projects.map((project) => [project.id, project]));
}

/**
 * Daily planner.
 *
 * The client owns which day is selected, and the URL records it, so a link
 * shares the day and the back button works. Three things follow from that:
 *
 *  - The page follows midnight. When the local date changes, the selection
 *    moves with it if the user was on today, and the week strip's "today" ring
 *    moves even if they were not.
 *  - The selected day lives in the URL rather than in local state, so a
 *    refresh, a share and a back navigation all agree.
 *  - The route fetched a week either side, so crossing midnight does not need a
 *    refetch in the common case.
 */
export function DailyPlannerWorkspace({
  projects,
  dailyNotes,
  planning,
  weekTasks,
  serverDate,
}: {
  projects: Project[];
  dailyNotes: DailyNote[];
  planning: PlanningEntry[];
  weekTasks: DueTask[];
  /** What the server computed. Seeds the server snapshot; the browser takes over. */
  serverDate: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { today, rolloverCount, msUntilNext } = useDayRollover(serverDate);

  const urlDate = searchParams.get("date");
  const date = urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) ? urlDate : today;

  const [projectId, setProjectId] = React.useState<string>("");
  const [editingNote, setEditingNote] = React.useState<DailyNote | null>(null);
  const [delNote, setDelNote] = React.useState<DailyNote | null>(null);
  const [editingEntry, setEditingEntry] = React.useState<PlanningEntry | null>(null);
  const [delEntry, setDelEntry] = React.useState<PlanningEntry | null>(null);
  const [rolling, setRolling] = React.useState(false);

  const projectMap = React.useMemo(() => projectById(projects), [projects]);

  // Default to the first project once, without a synchronous setState in an
  // effect. Until the user picks one, the journal row follows the first project
  // and the select shows it.
  const activeProjectId = projectId || projects[0]?.id || "";
  const activeProject = activeProjectId ? projectMap.get(activeProjectId) : undefined;

  const dateNotes = React.useMemo(
    () => dailyNotes.filter((note) => note.note_date === date),
    [dailyNotes, date]
  );
  const datePlanning = React.useMemo(
    () => sortPlanning(planning.filter((entry) => entry.plan_date === date)),
    [planning, date]
  );

  const summary = React.useMemo(
    () => summariseDay(date, dailyNotes, planning),
    [dailyNotes, date, planning]
  );

  const streak = React.useMemo(
    () => journalStreak(dailyNotes.map((note) => note.note_date), today),
    [dailyNotes, today]
  );

  const week = React.useMemo(() => weekDates(date), [date]);

  const noteDates = React.useMemo(
    () => new Set(dailyNotes.map((note) => note.note_date)),
    [dailyNotes]
  );
  const planDates = React.useMemo(
    () => new Set(planning.map((entry) => entry.plan_date)),
    [planning]
  );
  const taskDates = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of weekTasks) {
      if (!task.due_date) continue;
      counts.set(task.due_date, (counts.get(task.due_date) ?? 0) + 1);
    }
    return counts;
  }, [weekTasks]);

  const weekTasksForDate = React.useMemo(
    () => weekTasks.filter((task) => task.due_date === date),
    [date, weekTasks]
  );

  const plannedMinutes = summary.plannedMinutes;

  /**
   * Day rollover.
   *
   * When the local date changes:
   *
   *  - the selection follows only if the user was on today, so someone reading
   *    yesterday's entry stays where they are;
   *  - the card glows either way, because the part that must be noticed is that
   *    the page kept up with the clock at all.
   *
   * `previousToday` is the last day this component observed. Comparing against
   * it is what makes "was the user on today?" answerable — comparing against
   * the rollover count would not.
   */
  const previousToday = React.useRef(today);

  React.useEffect(() => {
    const previous = previousToday.current;
    if (previous === today) return;
    previousToday.current = today;

    setRolling(true);
    const glow = window.setTimeout(() => setRolling(false), 1500);

    if (date !== previous) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("date", today);
    router.replace(`${pathname}?${params.toString()}`);

    return () => window.clearTimeout(glow);
  }, [date, pathname, rolloverCount, router, searchParams, today]);

  function goToDate(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function goToday() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", today);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const statItems: StatStripItem[] = [
    {
      id: "journal",
      label: "Journal",
      value: summary.hasNote ? 1 : 0,
      icon: NotebookPen,
      tone: summary.hasNote ? "success" : "neutral",
      hint: summary.hasNote
        ? `${summary.sectionsFilled} section${summary.sectionsFilled === 1 ? "" : "s"} filled`
        : "Nothing written yet",
    },
    {
      id: "streak",
      label: "Streak",
      value: streak,
      icon: Flame,
      tone: streak > 0 ? "warning" : "neutral",
      hint: streak > 0 ? "Days in a row" : "Write today to start one",
    },
    {
      id: "planned",
      label: "Planned",
      value: summary.plannedBlocks,
      icon: CalendarDays,
      tone: "info",
      hint: plannedMinutes > 0 ? formatDurationMinutes(plannedMinutes) : "No time blocks",
    },
    {
      id: "due",
      label: "Due",
      value: weekTasksForDate.filter((task) => task.status !== "done").length,
      icon: ListChecks,
      tone:
        weekTasksForDate.some((task) => task.status !== "done") ? "danger" : "success",
      hint: weekTasksForDate.length === 0 ? "Nothing due" : "Tasks due this day",
    },
    {
      id: "notes",
      label: "Notes",
      value: dateNotes.length,
      icon: Target,
      tone: "neutral",
      hint: `${dateNotes.length === 1 ? "1 project" : `${dateNotes.length} projects`} journalled`,
    },
  ];

  const isToday = date === today;

  return (
    <div className="flex flex-col gap-5">
      {/* --- Hero --- */}
      <Card
        className={cn(
          "relative overflow-hidden",
          rolling && "rollover-glow"
        )}
      >
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute -right-10 -top-14 size-48 rounded-full blur-3xl transition-opacity duration-700",
            isToday ? "bg-primary/12 opacity-100" : "opacity-0"
          )}
        />
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {isToday ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
                {relativeDayLabel(date, today)}
              </span>
              <CardTitle className="text-xl tracking-tight">{longDayLabel(date)}</CardTitle>
              {activeProject ? (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: activeProject.color ?? "var(--primary)" }}
                  />
                  {activeProject.name}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <RolloverChip msUntilNext={msUntilNext} isToday={isToday} />
              <div className="flex items-center gap-0.5 rounded-lg border p-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Previous day"
                  onClick={() => goToDate(shiftDate(date, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Pick a date"
                  onClick={goToday}
                  className={cn(isToday && "text-primary")}
                >
                  Today
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Next day"
                  onClick={() => goToDate(shiftDate(date, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(event) => {
                  if (event.target.value) goToDate(event.target.value);
                }}
                aria-label="Jump to a date"
                className="h-8 w-[9.5rem]"
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      <StatStrip items={statItems} />

      {/* --- Week strip --- */}
      <WeekStrip
        week={week}
        date={date}
        today={today}
        noteDates={noteDates}
        planDates={planDates}
        taskDates={taskDates}
        onSelect={goToDate}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* --- Journal --- */}
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <NotebookPen className="size-4 text-muted-foreground" />
                Journal
              </CardTitle>
              {projects.length > 0 ? (
                <select
                  aria-label="Project"
                  value={activeProjectId}
                  onChange={(event) => {
                    setProjectId(event.target.value);
                    setEditingNote(null);
                  }}
                  className="h-8 min-w-0 max-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {dateNotes.length === 0 ? (
              <EmptyState
                icon={NotebookPen}
                title="Nothing journalled yet"
                description="Write what you worked on today. It stays with this project and this date."
                className="py-10"
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {dateNotes.map((note, index) => (
                  <JournalRow
                    key={note.id}
                    note={note}
                    index={index}
                    project={projectMap.get(note.project_id)}
                    onEdit={() => {
                      setEditingNote(note);
                      setProjectId(note.project_id);
                    }}
                    onDelete={() => setDelNote(note)}
                  />
                ))}
              </ul>
            )}

            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Create a project first — a journal entry belongs to one.
              </p>
            ) : (
              <NoteEditor
                key={editingNote?.id ?? `new-${activeProjectId}`}
                projectId={activeProjectId}
                date={date}
                note={editingNote}
                onDone={() => {
                  setEditingNote(null);
                  router.refresh();
                }}
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          {/* --- Plan --- */}
          <Card>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CalendarDays className="size-4 text-muted-foreground" />
                  Plan
                </CardTitle>
                {plannedMinutes > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {datePlanning.length} block{datePlanning.length === 1 ? "" : "s"} ·{" "}
                    {formatDurationMinutes(plannedMinutes)}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <EntryEditor
                key={editingEntry?.id ?? `new-${activeProjectId}`}
                defaultProjectId={editingEntry?.project_id ?? activeProjectId}
                projects={projects}
                date={date}
                entry={editingEntry}
                onDone={() => {
                  setEditingEntry(null);
                  router.refresh();
                }}
              />

              {datePlanning.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  Nothing planned for this day.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {datePlanning.map((entry, index) => (
                    <PlanRow
                      key={entry.id}
                      entry={entry}
                      index={index}
                      project={projectMap.get(entry.project_id)}
                      onEdit={() => setEditingEntry(entry)}
                      onDelete={() => setDelEntry(entry)}
                    />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {/* --- Due today --- */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlarmClock className="size-4 text-muted-foreground" />
                Due {relativeDayLabel(date, today).toLowerCase()}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekTasksForDate.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                  No tasks are due on this day.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {weekTasksForDate.slice(0, 8).map((task, index) => {
                    const done = task.status === "done";
                    return (
                      <li
                        key={task.id}
                        style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
                        className="row-stagger flex items-center gap-2"
                      >
                        {done ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: fillColour(task.priority) }}
                          />
                        )}
                        <Link
                          href={`/tasks/${task.id}`}
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm hover:underline",
                            done && "text-muted-foreground line-through"
                          )}
                        >
                          {task.title}
                        </Link>
                        {task.project_name ? (
                          <span className="max-w-28 shrink-0 truncate text-[11px] text-muted-foreground">
                            {task.project_name}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(delNote)}
        onOpenChange={(open) => {
          if (!open) setDelNote(null);
        }}
        title="Delete this journal entry?"
        description={`${delNote?.note_date ?? ""} — ${projectMap.get(delNote?.project_id ?? "")?.name ?? ""}`}
        confirmLabel="Delete entry"
        onConfirm={async () => {
          if (!delNote) return;
          const result = await deleteDailyNoteAction(delNote.project_id, delNote.note_date);
          setDelNote(null);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Journal entry deleted.");
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(delEntry)}
        onOpenChange={(open) => {
          if (!open) setDelEntry(null);
        }}
        title="Delete this time block?"
        description="This removes it from the plan for this day."
        confirmLabel="Delete block"
        onConfirm={async () => {
          if (!delEntry) return;
          const result = await deletePlanningEntryAction(delEntry.id);
          setDelEntry(null);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Time block deleted.");
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rollover chip
// ---------------------------------------------------------------------------

function RolloverChip({
  msUntilNext,
  isToday,
}: {
  msUntilNext: number;
  isToday: boolean;
}) {
  if (!isToday) {
    return (
      <Badge variant="outline" className="h-8 gap-1.5 px-2.5">
        <Moon className="size-3" />
        Reading another day
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="h-8 gap-1.5 px-2.5" title="This page moves to the next day on its own">
      <span aria-hidden="true" className="live-dot size-1.5 rounded-full bg-primary" />
      <Sparkles className="size-3" />
      Next day in {describeDuration(msUntilNext)}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Week strip
// ---------------------------------------------------------------------------

function WeekStrip({
  week,
  date,
  today,
  noteDates,
  planDates,
  taskDates,
  onSelect,
}: {
  week: string[];
  date: string;
  today: string;
  noteDates: Set<string>;
  planDates: Set<string>;
  taskDates: Map<string, number>;
  onSelect: (date: string) => void;
}) {
  const [weekIndex, setWeekIndex] = React.useState(0);

  // Changing week is a local display concern — the underlying payload already
  // covers a fortnight either side, so no refetch is needed to move along it.
  const shown = React.useMemo(() => {
    const base = parseWeek(week[0]);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(base);
      day.setDate(base.getDate() + weekIndex * 7 + index);
      return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
        day.getDate()
      ).padStart(2, "0")}`;
    });
  }, [week, weekIndex]);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous week"
            onClick={() => setWeekIndex((index) => index - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Week of {longDayLabel(shown[0])}
          </p>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next week"
            onClick={() => setWeekIndex((index) => index + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1">
          {shown.map((day, index) => {
            const active = day === date;
            const isToday = day === today;
            const future = day > today;
            const parsed = new Date(`${day}T00:00:00`);
            const due = taskDates.get(day) ?? 0;

            return (
              <button
                key={day}
                onClick={() => onSelect(day)}
                aria-pressed={active}
                data-today={isToday ? "true" : "false"}
                aria-label={`${longDayLabel(day)}${due ? `, ${due} due` : ""}`}
                className={cn(
                  "day-cell relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition",
                  "hover:bg-accent/60",
                  active && "bg-accent",
                  future && "opacity-45"
                )}
              >
                <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  {WEEKDAY_LABELS[index]}
                </span>
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-sm tabular-nums transition",
                    isToday && "bg-primary font-semibold text-primary-foreground",
                    active && !isToday && "font-semibold ring-1 ring-ring"
                  )}
                >
                  {parsed.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden="true">
                  {noteDates.has(day) ? (
                    <span className="size-1.5 rounded-full bg-primary" />
                  ) : null}
                  {planDates.has(day) ? (
                    <span className="size-1.5 rounded-full bg-sky-500" />
                  ) : null}
                  {due > 0 ? (
                    <span className="size-1.5 rounded-full bg-destructive" />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
          <LegendDot className="bg-primary" label="Journal" />
          <LegendDot className="bg-sky-500" label="Planned" />
          <LegendDot className="bg-destructive" label="Tasks due" />
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function parseWeek(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

// ---------------------------------------------------------------------------
// Journal row
// ---------------------------------------------------------------------------

function JournalRow({
  note,
  index,
  project,
  onEdit,
  onDelete,
}: {
  note: DailyNote;
  index: number;
  project: Project | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sections = filledSections(note);
  const body = note.content.trim();

  return (
    <li
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="row-stagger group rounded-xl border bg-card p-3.5 transition hover:border-primary/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {project ? (
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? "var(--primary)" }}
            />
          ) : null}
          <span className="truncate text-sm font-medium">
            {note.title || project?.name || "Journal"}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Edit journal entry"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete journal entry"
            onClick={onDelete}
            className="hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {body ? (
        <p className="mt-1.5 text-sm whitespace-pre-wrap text-muted-foreground">{body}</p>
      ) : null}

      {sections.length > 0 ? (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {sections.map((section) => (
            <div key={section.key} className="flex flex-col gap-0.5">
              <dt className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {section.label}
              </dt>
              <dd className="text-sm whitespace-pre-wrap">{section.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!body && sections.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted-foreground">Empty entry.</p>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Plan row
// ---------------------------------------------------------------------------

function PlanRow({
  entry,
  index,
  project,
  onEdit,
  onDelete,
}: {
  entry: PlanningEntry;
  index: number;
  project: Project | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const minutes = blockMinutes(entry);

  return (
    <li
      style={{ "--i": Math.min(index, 8) } as React.CSSProperties}
      className="row-stagger group flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2 transition hover:border-primary/30"
    >
      <span className="flex shrink-0 flex-col items-center">
        <span className="text-xs font-medium tabular-nums">
          {formatTimeRange(entry.start_time, entry.end_time).split(" – ")[0]}
        </span>
        {entry.end_time ? (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {formatTimeRange(entry.start_time, entry.end_time).split(" – ")[1]}
          </span>
        ) : null}
      </span>

      <span aria-hidden="true" className="h-8 w-px bg-border" />

      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-sm">{entry.note || project?.name || "Time block"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {project?.name ?? "No project"}
          {minutes > 0 ? ` · ${formatDurationMinutes(minutes)}` : ""}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <Button variant="ghost" size="icon-sm" aria-label="Edit time block" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete time block"
          onClick={onDelete}
          className="hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

function NoteEditor({
  projectId,
  date,
  note,
  onDone,
}: {
  projectId: string;
  date: string;
  note: DailyNote | null;
  onDone: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showSections, setShowSections] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  const editing = note !== null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError(null);
    try {
      const result = await saveDailyNoteAction({}, new FormData(form));
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Journal entry updated." : "Journal entry saved.");
      // Reset only the free-text body; the structured boxes keep what was just
      // written so the row above immediately reflects the new sections.
      form.reset();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!projectId) return null;

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-3.5"
    >
      <input type="hidden" name="note_date" value={date} />
      <input type="hidden" name="project_id" value={projectId} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {editing ? "Editing this day's entry" : `New entry for ${relativeDayLabel(date, "").toLowerCase() || "this day"}`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSections((open) => !open)}
            aria-expanded={showSections}
          >
            {showSections ? (
              <>
                <X /> Fewer
              </>
            ) : (
              <>
                <Sparkles /> Sections
              </>
            )}
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            <Save />
            {saving ? "Saving…" : editing ? "Update" : "Save"}
          </Button>
        </div>
      </div>

      <Input
        name="title"
        defaultValue={note?.title ?? ""}
        placeholder="Title (optional)"
        maxLength={300}
      />
      <Textarea
        name="content"
        defaultValue={note?.content ?? ""}
        rows={3}
        placeholder="What are you working on?"
      />

      {showSections ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {NOTE_SECTIONS.map((section) => (
            <FormBlock
              key={section.key}
              label={section.label}
              placeholder={section.placeholder}
              name={section.key as NoteSectionKey}
              defaultValue={(note?.[section.key] as string | null) ?? ""}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function FormBlock({
  label,
  placeholder,
  name,
  defaultValue,
}: {
  label: string;
  placeholder: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Textarea
        name={name}
        defaultValue={defaultValue}
        rows={2}
        placeholder={placeholder}
        className="text-sm"
      />
    </label>
  );
}

function EntryEditor({
  defaultProjectId,
  projects,
  date,
  entry,
  onDone,
}: {
  defaultProjectId: string;
  projects: Project[];
  date: string;
  entry: PlanningEntry | null;
  onDone: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const editing = entry !== null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError(null);
    try {
      const result = entry
        ? await updatePlanningEntryAction(entry.id, {}, new FormData(form))
        : await createPlanningEntryAction({}, new FormData(form));
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Time block updated." : "Time block added.");
      form.reset();
      onDone();
    } finally {
      setSaving(false);
    }
  }

  if (!defaultProjectId && projects.length === 0) return null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-2.5 rounded-xl border bg-muted/20 p-3.5">
      <input type="hidden" name="plan_date" value={date} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="project_id"
          defaultValue={defaultProjectId}
          aria-label="Project"
          required
          className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        <Input
          type="time"
          name="start_time"
          defaultValue={entry?.start_time?.slice(0, 5) ?? ""}
          aria-label="Start time"
          className="h-8 w-28"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="time"
          name="end_time"
          defaultValue={entry?.end_time?.slice(0, 5) ?? ""}
          aria-label="End time"
          className="h-8 w-28"
        />
        <Button type="submit" size="sm" disabled={saving}>
          {editing ? <Save /> : <Plus />}
          {saving ? "Saving…" : editing ? "Update" : "Add"}
        </Button>
      </div>

      <Input
        name="note"
        defaultValue={entry?.note ?? ""}
        placeholder="What are you planning here? (optional)"
      />

      {editing ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDone}
          className="self-start"
        >
          Cancel edit
        </Button>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
