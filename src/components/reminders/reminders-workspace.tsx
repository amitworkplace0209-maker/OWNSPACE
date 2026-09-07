"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Bell, BellOff, PauseCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createReminderAction, updateReminderAction, deleteReminderAction, setReminderStatusAction } from "@/lib/actions/calendar";
import { formatDateTime, toIsoSubmit } from "@/lib/format";
import { cn } from "cn";
import type { Project, Reminder, Task } from "@/types";

type ReminderFormState = { error?: string; data?: { id: string } };

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function RemindersWorkspace({
  reminders,
  projects,
  tasks,
}: {
  reminders: Reminder[];
  projects: Project[];
  tasks: Task[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus /> New reminder</Button>
      </div>

      {reminders.length === 0 ? (
        <EmptyState title="No reminders" description="Create a reminder so you never forget an important deadline." />
      ) : (
        <ul className="flex flex-col gap-3">
          {reminders.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className={cn("mt-1 flex size-8 shrink-0 items-center justify-center rounded-full", r.status === "triggered" ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary")}>
                  {r.status === "triggered" ? <BellOff className="size-4" /> : <Bell className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className={cn("text-sm font-medium", (r.status === "dismissed" || r.status === "triggered") && "text-muted-foreground line-through")}>{r.title}</p>
                  {r.note ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.note}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(r.remind_at)}
                    {r.project_id ? <> · {projects.find((p) => p.id === r.project_id)?.name ?? ""}</> : null}
                    {r.task_id ? <> · task</> : null}
                    {r.status !== "pending" ? <> · <span className="capitalize">{r.status}</span></> : null}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1">
                {r.status === "pending" || r.status === "snoozed" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setReminderStatusAction(r.id, "snoozed", 10).then(() => router.refresh())}
                    >
                      <PauseCircle className="size-3.5" /> Snooze 10m
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void setReminderStatusAction(r.id, "dismissed").then(() => router.refresh())}
                    >
                      Dismiss
                    </Button>
                  </>
                ) : null}
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.title}`} onClick={() => { setEditing(r); setOpen(true); }}>
                  <Pencil className="size-3.5" />
                </Button>
                <DeleteReminderButton reminder={r} onDone={() => router.refresh()} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReminderFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        projects={projects}
        tasks={tasks}
        reminder={editing}
      />
    </div>
  );
}

function DeleteReminderButton({ reminder, onDone }: { reminder: Reminder; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${reminder.title}`} onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this reminder?"
        description={reminder.title}
        confirmLabel="Delete reminder"
        onConfirm={async () => {
          await deleteReminderAction(reminder.id);
          setOpen(false);
          onDone();
        }}
      />
    </>
  );
}

function ReminderFormDialog({
  open,
  onOpenChange,
  projects,
  tasks,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  tasks: Task[];
  reminder: Reminder | null;
}) {
  const router = useRouter();
  const action = reminder ? updateReminderAction.bind(null, reminder.id) : createReminderAction;
  const [state, formAction, pending] = useActionState<ReminderFormState, FormData>(action, { error: undefined });

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
          <DialogDescription>Remind yourself about something important.</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            const normalized = new FormData();
            for (const [key, value] of fd.entries()) normalized.append(key, value);
            normalized.set("remind_at", toIsoSubmit(String(fd.get("remind_at") ?? "")));
            formAction(normalized);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Title" htmlFor="reminder-title" error={state.error}>
            <Input id="reminder-title" name="title" defaultValue={reminder?.title ?? ""} placeholder="e.g. Submit report" required />
          </FormField>
          <FormField label="Remind at">
            <Input type="datetime-local" name="remind_at" defaultValue={toLocalInput(reminder?.remind_at ?? "")} required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Project">
              <select name="project_id" defaultValue={reminder?.project_id ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                <option value="">No project</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </FormField>
            <FormField label="Task">
              <select name="task_id" defaultValue={reminder?.task_id ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                <option value="">No task</option>
                {tasks.map((t) => (<option key={t.id} value={t.id}>{t.title}</option>))}
              </select>
            </FormField>
          </div>
          <FormField label="Note">
            <Textarea name="note" defaultValue={reminder?.note ?? ""} rows={2} placeholder="Optional details" />
          </FormField>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : reminder ? "Save changes" : "Create reminder"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}