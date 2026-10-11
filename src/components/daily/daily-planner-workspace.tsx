"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plus, Clock, Pencil, Trash2, NotebookPen, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "cn";
import { saveDailyNoteAction, deleteDailyNoteAction, createPlanningEntryAction, deletePlanningEntryAction } from "@/lib/actions/daily-notes";
import type { DailyNote, PlanningEntry, Project } from "@/types";

function todayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function weekOf(date: string): string[] {
  const d = new Date(`${date}T00:00:00`);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  });
}

function formatHuman(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function DailyPlannerWorkspace({
  projects,
  dailyNotes,
  planning,
  defaultDate,
}: {
  projects: Project[];
  dailyNotes: DailyNote[];
  planning: PlanningEntry[];
  defaultDate: string;
}) {
  const router = useRouter();
  const [date, setDate] = useState(defaultDate);

  const dateNotes = dailyNotes.filter((n) => n.note_date === date);
  const datePlanning = planning.filter((p) => p.plan_date === date);
  const [selectedProject, setSelectedProject] = useState(projects[0]?.id ?? "");
  const [editNote, setEditNote] = useState<DailyNote | null>(null);

  const [delNote, setDelNote] = useState<DailyNote | null>(null);
  const [delEntry, setDelEntry] = useState<PlanningEntry | null>(null);

  const week = weekOf(date);
  const noteDates = new Set(dailyNotes.map((n) => n.note_date));
  const planDates = new Set(planning.map((p) => p.plan_date));
  const plannedMinutes = datePlanning.reduce((acc, p) => {
    if (!p.start_time || !p.end_time) return acc;
    const [sh, sm] = p.start_time.split(":").map(Number);
    const [eh, em] = p.end_time.split(":").map(Number);
    return acc + Math.max(0, eh * 60 + em - (sh * 60 + sm));
  }, 0);
  const plannedLabel =
    plannedMinutes >= 60 ? `${Math.floor(plannedMinutes / 60)}h ${plannedMinutes % 60}m` : `${plannedMinutes}m`;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 lg:col-span-2">
        <div className="flex items-center justify-between">
          <button onClick={() => setDate(shiftDate(date, -7))} aria-label="Previous week" className="rounded p-1 hover:bg-accent"><ChevronLeft className="size-4" /></button>
          <p className="text-xs text-muted-foreground">{formatHuman(week[0])} – {formatHuman(week[6])}</p>
          <button onClick={() => setDate(shiftDate(date, 7))} aria-label="Next week" className="rounded p-1 hover:bg-accent"><ChevronRight className="size-4" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {week.map((ds) => {
            const d = new Date(`${ds}T00:00:00`);
            const active = ds === date;
            const isToday = ds === todayStr();
            return (
              <button
                key={ds}
                onClick={() => setDate(ds)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-1 py-2 transition hover:bg-accent/60",
                  active && "bg-accent/60"
                )}
              >
                <span className="text-[10px] uppercase text-muted-foreground">
                  {d.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className={cn("flex size-6 items-center justify-center rounded-full text-sm", isToday && "bg-primary font-semibold text-primary-foreground", active && !isToday && "font-semibold ring-1 ring-ring")}>
                  {d.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {noteDates.has(ds) ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                  {planDates.has(ds) ? <span className="size-1.5 rounded-full bg-sky-500" /> : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <NotebookPen /> Daily note
          </h2>
          <div className="flex items-center gap-1 rounded-lg border px-2 py-1">
            <button onClick={() => setDate(shiftDate(date, -1))} aria-label="Previous day" className="rounded p-1 hover:bg-accent"><ChevronLeft className="size-4" /></button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              className="bg-transparent text-sm outline-none"
            />
            <button onClick={() => setDate(shiftDate(date, 1))} aria-label="Next day" className="rounded p-1 hover:bg-accent"><ChevronRight className="size-4" /></button>
            {date !== todayStr() ? (
              <button onClick={() => setDate(todayStr())} className="rounded px-1 text-xs text-muted-foreground hover:bg-accent">Today</button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{formatHuman(date)}</p>

        <div className="flex flex-col gap-2">
          {dateNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No daily note for this date yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dateNotes.map((n) => (
                <li key={n.id} className="group rounded-lg border border-border/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{projects.find((p) => p.id === n.project_id)?.name ?? "Project"}</p>
                    <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                      <button onClick={() => { setEditNote(n); setSelectedProject(n.project_id); }} aria-label="Edit daily note" className="text-muted-foreground hover:text-foreground">
                        <Pencil className="size-3.5" />
                      </button>
                      <button onClick={() => setDelNote(n)} aria-label="Delete daily note" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{n.content.trim() || "Empty note."}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Create a project to start journaling.</p>
        ) : (
          <NoteForm
            key={editNote?.id ?? "new-note"}
            projectId={editNote?.project_id ?? selectedProject}
            projects={projects}
            date={date}
            onProjectChange={setSelectedProject}
            onSaved={() => { setEditNote(null); router.refresh(); }}
            editing={Boolean(editNote)}
            initialContent={editNote?.content ?? ""}
            onCancelEdit={() => setEditNote(null)}
          />
        )}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays /> Plan
        </h2>
        {datePlanning.length > 0 ? (
          <p className="-mt-2 text-xs text-muted-foreground">
            {datePlanning.length} block{datePlanning.length === 1 ? "" : "s"}
            {plannedMinutes > 0 ? ` · ${plannedLabel} planned` : ""}
          </p>
        ) : null}

        <EntryForm
          defaultProjectId={selectedProject}
          projects={projects}
          date={date}
          onCreated={() => router.refresh()}
        />

        {datePlanning.length === 0 ? (
          <EmptyState icon={Clock} title="Nothing planned" description="Add time blocks for this day." />
        ) : (
          <ul className="flex flex-col gap-2">
            {datePlanning.map((p) => (
              <li key={p.id} className="group flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.note || projects.find((x) => x.id === p.project_id)?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {projects.find((x) => x.id === p.project_id)?.name ?? "Project"}
                    {p.start_time ? <> · {p.start_time.slice(0, 5)}{p.end_time ? `–${p.end_time.slice(0, 5)}` : ""}</> : null}
                  </p>
                </div>
                <button onClick={() => setDelEntry(p)} aria-label="Delete planning entry" className="opacity-0 text-muted-foreground transition group-hover:opacity-100 hover:text-destructive">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(delNote)}
        onOpenChange={(open) => { if (!open) setDelNote(null); }}
        title="Delete this daily note?"
        description={`${delNote?.note_date ?? ""} — ${projects.find((p) => p.id === delNote?.project_id)?.name ?? ""}`}
        confirmLabel="Delete note"
        onConfirm={async () => {
          if (!delNote) return;
          await deleteDailyNoteAction(delNote.project_id, delNote.note_date);
          setDelNote(null);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(delEntry)}
        onOpenChange={(open) => { if (!open) setDelEntry(null); }}
        title="Delete this planning entry?"
        description="This removes the time block."
        confirmLabel="Delete entry"
        onConfirm={async () => {
          if (!delEntry) return;
          await deletePlanningEntryAction(delEntry.id);
          setDelEntry(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function NoteForm({
  projectId,
  projects,
  date,
  onProjectChange,
  onSaved,
  editing,
  initialContent,
  onCancelEdit,
}: {
  projectId: string;
  projects: Project[];
  date: string;
  onProjectChange: (id: string) => void;
  onSaved: () => void;
  editing: boolean;
  initialContent: string;
  onCancelEdit: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const res = await saveDailyNoteAction({}, fd);
      if (res.error) setError(res.error);
      else {
        onSaved();
        e.currentTarget.reset();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="note_date" value={date} />
      <div className="flex items-center gap-2">
        <select
          name="project_id"
          value={projectId}
          onChange={(e) => onProjectChange(e.target.value)}
          disabled={editing}
          className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:opacity-60 dark:bg-input/30"
          required
        >
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        {editing ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
        ) : null}
        <Button type="submit" size="sm" disabled={saving}><Save /> {saving ? "Saving…" : editing ? "Update" : "Save"}</Button>
      </div>
      <Textarea name="content" defaultValue={initialContent} rows={4} placeholder="What are you working on today?" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

function EntryForm({
  defaultProjectId,
  projects,
  date,
  onCreated,
}: {
  defaultProjectId: string;
  projects: Project[];
  date: string;
  onCreated: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const res = await createPlanningEntryAction({}, fd);
      if (res.error) setError(res.error);
      else {
        onCreated();
        e.currentTarget.reset();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <input type="hidden" name="plan_date" value={date} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="project_id" defaultValue={defaultProjectId} className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30" required>
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
        <Input type="time" name="start_time" aria-label="Start time" className="h-8 w-28" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="time" name="end_time" aria-label="End time" className="h-8 w-28" />
        <Button type="submit" size="sm" disabled={saving}><Plus /> Add</Button>
      </div>
      <Input name="note" placeholder="What are you planning here? (optional)" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}