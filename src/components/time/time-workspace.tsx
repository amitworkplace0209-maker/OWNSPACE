"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Square, Timer, Focus, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createTimeEntryAction,
  deleteTimeEntryAction,
  startTimerAction,
  stopTimerAction,
  startPomodoroAction,
  completePomodoroAction,
  cancelPomodoroAction,
} from "@/lib/actions/time";
import { formatDateTimeShort, formatDuration, formatDurationMinutes } from "@/lib/format";
import { cn } from "cn";
import type { PomodoroSession, Project, Task, TimeEntry } from "@/types";

function elapsedLabel(startedAt: string, nowMs: number): string {
  const ms = Math.max(0, nowMs - new Date(startedAt).getTime());
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TimeWorkspace({
  timeEntries,
  running,
  pomodoro,
  projects,
  tasks,
  focusMinutes,
  breakMinutes,
}: {
  timeEntries: TimeEntry[];
  running: { entry: TimeEntry | null; projectName: string | null; taskName: string | null };
  pomodoro: { running: PomodoroSession | null; todayCount: number; recent: PomodoroSession[] };
  projects: Project[];
  tasks: Task[];
  focusMinutes: number;
  breakMinutes: number;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const [startProject, setStartProject] = useState("");
  const [startTask, setStartTask] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const [pomoTask, setPomoTask] = useState("");
  const [error, setError] = useState("");

  async function startTimer() {
    if (!startProject) return setError("Select a project to start the timer.");
    setError("");
    const res = await startTimerAction(startProject, startTask || null);
    if (res.error) setError(res.error);
    router.refresh();
  }

  async function stopTimer() {
    if (!running.entry) return;
    await stopTimerAction(running.entry.id);
    router.refresh();
  }

  async function startPomodoro() {
    if (!pomoTask) return setError("Select a task for the pomodoro session.");
    setError("");
    const res = await startPomodoroAction(pomoTask, focusMinutes, breakMinutes);
    if (res.error) setError(res.error);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Timer className="size-4" /> Timer</CardTitle>
          <CardDescription>Track time on a task with a live timer.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {running.entry ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-6">
              <p className="font-mono text-4xl font-semibold tabular-nums" key={now}>{elapsedLabel(running.entry.started_at, now)}</p>
              <p className="text-sm">{running.projectName}{running.taskName ? ` · ${running.taskName}` : ""}</p>
              <Button onClick={stopTimer}><Square /> Stop timer</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Project">
                  <select name="project_id" value={startProject} onChange={(e) => setStartProject(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30" required>
                    <option value="">Select…</option>
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                </FormField>
                <FormField label="Task (optional)">
                  <select name="task_id" value={startTask} onChange={(e) => setStartTask(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                    <option value="">No task</option>
                    {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
                  </select>
                </FormField>
              </div>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button onClick={startTimer}><Play /> Start timer</Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button variant="outline" size="sm" onClick={() => setManualOpen(true)}><Plus /> Log time manually</Button>
            {manualOpen ? <ManualEntryForm projects={projects} tasks={tasks} onDone={() => { setManualOpen(false); router.refresh(); }} /> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Focus className="size-4" /> Pomodoro</CardTitle>
          <CardDescription>{pomodoro.todayCount} sessions completed today · {focusMinutes}m focus / {breakMinutes}m break</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {pomodoro.running ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-400/40 bg-rose-400/5 p-6">
              <p className="text-sm font-medium">Focus session in progress</p>
              <p className="font-mono text-2xl tabular-nums" key={`pomo-${now}`}>{formatDuration(now - new Date(pomodoro.running.started_at).getTime())}</p>
              <div className="flex gap-2">
                <Button onClick={() => void completePomodoroAction(pomodoro.running!.id).then(() => router.refresh())}>Complete session</Button>
                <Button variant="ghost" onClick={() => void cancelPomodoroAction(pomodoro.running!.id).then(() => router.refresh())}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <FormField label="Task">
                <select name="task_id" value={pomoTask} onChange={(e) => setPomoTask(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30" required>
                  <option value="">Select a task…</option>
                  {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
                </select>
              </FormField>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button onClick={startPomodoro} variant="secondary"><Focus className="size-4" /> Start focus session</Button>
            </div>
          )}

          {pomodoro.recent.length > 0 ? (
            <ul className="flex flex-col gap-1.5 border-t pt-4">
              {pomodoro.recent.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className={cn("capitalize", s.status === "running" && "text-primary")}>{s.status}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTimeShort(s.started_at)}</span>
                  <span className="tabular-nums">{s.focus_duration_minutes}min</span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Time entries</CardTitle>
          <CardDescription>{formatDurationMinutes(timeEntries.reduce((acc, e) => acc + (e.duration_minutes ?? 0), 0))} logged in view</CardDescription>
        </CardHeader>
        <CardContent>
          {timeEntries.length === 0 ? (
            <EmptyState icon={Timer} title="No time logged" description="Start the timer or log time manually." />
          ) : (
            <ul className="flex flex-col">
              {timeEntries.map((e) => (
                <li key={e.id} className="group flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {e.description || e.task_id || "Time entry"}
                      <span className="text-muted-foreground"> · {formatDateTimeShort(e.started_at)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{(e as unknown as { project?: { name?: string } }).project?.name ?? "—"}</p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">{e.duration_minutes}min</span>
                  <div className="flex shrink-0 opacity-0 transition group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" aria-label="Delete entry" onClick={() => setDeleting(e)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title="Delete this time entry?"
        description={`${deleting?.duration_minutes} minutes logged`}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteTimeEntryAction(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function ManualEntryForm({
  projects,
  tasks,
  onDone,
}: {
  projects: Project[];
  tasks: Task[];
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const res = await createTimeEntryAction({}, fd);
      if (res.error) setError(res.error);
      else onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="flex w-full flex-col gap-3 rounded-xl border bg-accent/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium"><Pencil className="size-3.5" /> Log time manually</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Project">
          <select name="project_id" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30" required>
            <option value="">Select…</option>
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
        </FormField>
        <FormField label="Task (optional)">
          <select name="task_id" className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
            <option value="">No task</option>
            {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
          </select>
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Start time">
          <Input type="datetime-local" name="started_at" required />
        </FormField>
        <FormField label="Duration (minutes)">
          <Input type="number" name="duration_minutes" min={1} required />
        </FormField>
      </div>
      <FormField label="Note">
        <Textarea name="description" rows={2} />
      </FormField>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving…" : "Save entry"}</Button>
      </div>
    </form>
  );
}