"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarClock, Check, Repeat } from "lucide-react";
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
import { createReminderAction, updateReminderAction, type ReminderFormState } from "@/lib/actions/calendar";
import {
  ADVANCE_PRESETS,
  CHANNEL_OPTIONS,
  REPEAT_LABEL,
  defaultRemindAt,
  snoozeLabel,
} from "@/lib/reminder-logic";
import { toIsoSubmit } from "@/lib/format";
import { cn } from "cn";
import {
  PRIORITIES,
  REMINDER_REPEATS,
  type NotificationChannel,
  type Priority,
  type Project,
  type Reminder,
  type ReminderRepeat,
} from "@/types";
import type { AttachTarget } from "@/lib/dal/reminders";

const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAY_FULL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const PRIORITY_LABEL: Record<Priority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Critical",
};

/**
 * Create / edit form for a reminder.
 *
 * Every scheduling column migration 017 added is editable here. They are
 * grouped behind `advanced` rather than always shown, because the common case
 * is "remind me at 3pm" and thirteen extra fields on every open makes the form
 * unusable.
 */
export function ReminderFormDialog({
  open,
  onOpenChange,
  projects,
  tasks,
  nodes,
  notes,
  reminder,
  defaultProjectId = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  tasks: AttachTarget[];
  nodes: AttachTarget[];
  notes: AttachTarget[];
  reminder: Reminder | null;
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const action = reminder
    ? updateReminderAction.bind(null, reminder.id)
    : createReminderAction;
  const [state, formAction, pending] = useActionState<ReminderFormState, FormData>(action, {
    error: undefined,
  });

  const [advanced, setAdvanced] = React.useState(false);
  const [projectId, setProjectId] = React.useState(
    reminder?.project_id ?? defaultProjectId
  );
  const [repeatRule, setRepeatRule] = React.useState<ReminderRepeat>(
    reminder?.repeat_rule ?? "none"
  );
  const [repeatDays, setRepeatDays] = React.useState<number[]>(reminder?.repeat_days ?? []);
  const [channels, setChannels] = React.useState<NotificationChannel[]>(
    reminder?.notification_channels?.length
      ? reminder.notification_channels
      : ["in_app"]
  );
  const [priority, setPriority] = React.useState<Priority>(reminder?.priority ?? "none");
  const [advance, setAdvance] = React.useState<number>(reminder?.advance_minutes ?? 0);
  const [enabled, setEnabled] = React.useState(reminder?.is_enabled ?? true);

  // Editing a repeating reminder should reveal its own settings immediately,
  // otherwise the fields are hidden behind a toggle that is already on.
  const effectiveAdvanced = advanced || reminder?.repeat_rule !== "none";

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  function toggleDay(day: number) {
    setRepeatDays((current) =>
      current.includes(day) ? current.filter((entry) => entry !== day) : [...current, day]
    );
  }

  function toggleChannel(channel: NotificationChannel) {
    setChannels((current) =>
      current.includes(channel)
        ? current.filter((entry) => entry !== channel)
        : [...current, channel]
    );
  }

  // Only offer targets from the chosen project — attaching a task from an
  // unrelated project is almost never what was meant.
  const scopedTasks = projectId ? tasks.filter((task) => task.project_id === projectId) : [];
  const scopedNodes = projectId ? nodes.filter((node) => node.project_id === projectId) : [];
  const scopedNotes = projectId ? notes.filter((note) => note.project_id === projectId) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{reminder ? "Edit reminder" : "New reminder"}</DialogTitle>
          <DialogDescription>
            Personal reminders live on their own; attach one to a project to see it there too.
          </DialogDescription>
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
            <Input
              id="reminder-title"
              name="title"
              defaultValue={reminder?.title ?? ""}
              placeholder="e.g. Submit the Q3 report"
              required
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Remind at">
              <Input
                type="datetime-local"
                name="remind_at"
                defaultValue={
                  reminder ? reminder.remind_at.slice(0, 16) : defaultRemindAt()
                }
                required
              />
            </FormField>

            <FormField
              label="Priority"
              hint={priority === "urgent" ? "Sorted above everything else" : undefined}
            >
              <select
                name="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as Priority)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                {PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {PRIORITY_LABEL[value]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            label="Project"
            hint="Leave as personal to keep it out of every project."
          >
            <select
              name="project_id"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
            >
              <option value="">Personal — no project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </FormField>

          {projectId ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Task">
                <select
                  name="task_id"
                  defaultValue={reminder?.task_id ?? ""}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
                >
                  <option value="">No task</option>
                  {scopedTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Section">
                <select
                  name="node_id"
                  defaultValue={reminder?.node_id ?? ""}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
                >
                  <option value="">No section</option>
                  {scopedNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label="Note">
                <select
                  name="note_id"
                  defaultValue={reminder?.note_id ?? ""}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
                >
                  <option value="">No note</option>
                  {scopedNotes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.title}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          ) : null}

          <FormField label="Note">
            <Textarea
              name="note"
              defaultValue={reminder?.note ?? ""}
              rows={2}
              placeholder="Optional details"
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="accent-primary"
            />
            Enabled
            <input type="hidden" name="is_enabled" value={enabled ? "on" : "off"} />
            <span className="text-xs text-muted-foreground">
              A muted reminder stays in your list but never fires.
            </span>
          </label>

          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            aria-expanded={effectiveAdvanced}
            className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm font-medium transition hover:bg-accent/50"
          >
            <span className="flex items-center gap-2">
              <Repeat className="size-4" />
              Repeat & notifications
            </span>
            <span className="text-xs text-muted-foreground">
              {effectiveAdvanced ? "Hide" : "Show"}
            </span>
          </button>

          {effectiveAdvanced ? (
            <div className="flex flex-col gap-4 rounded-lg border border-dashed p-3">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Repeats">
                  <select
                    name="repeat_rule"
                    value={repeatRule}
                    onChange={(event) => setRepeatRule(event.target.value as ReminderRepeat)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
                  >
                    {REMINDER_REPEATS.map((value) => (
                      <option key={value} value={value}>
                        {REPEAT_LABEL[value]}
                      </option>
                    ))}
                  </select>
                </FormField>

                {repeatRule !== "none" && repeatRule !== "custom" ? (
                  <FormField label="Every">
                    <Input
                      type="number"
                      name="repeat_interval"
                      min={1}
                      max={365}
                      defaultValue={reminder?.repeat_interval ?? 1}
                    />
                  </FormField>
                ) : null}
              </div>

              {repeatRule === "custom" ? (
                <FormField
                  label="On these days"
                  error={repeatDays.length === 0 ? "Pick at least one day" : undefined}
                >
                  <div className="flex gap-1">
                    {WEEKDAY_SHORT.map((label, day) => {
                      const active = repeatDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          aria-pressed={active}
                          aria-label={WEEKDAY_FULL[day]}
                          className={cn(
                            "size-8 rounded-lg border text-xs font-medium transition",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {/* Checkbox inputs, not just the visual buttons, so the
                      selected days actually reach the server action. */}
                  {repeatDays.map((day) => (
                    <input key={day} type="hidden" name="repeat_days" value={day} />
                  ))}
                </FormField>
              ) : null}

              {repeatRule !== "none" ? (
                <FormField label="Repeat until" hint="Optional — stops repeating after this date.">
                  <Input
                    type="date"
                    name="repeat_until"
                    defaultValue={reminder?.repeat_until ?? ""}
                  />
                </FormField>
              ) : null}

              <FormField
                label="Remind me early"
                hint="Fires before the time above without changing it."
              >
                <select
                  name="advance_minutes"
                  value={advance}
                  onChange={(event) => setAdvance(Number(event.target.value))}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
                >
                  {ADVANCE_PRESETS.map((preset) => (
                    <option key={preset.minutes} value={preset.minutes}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="Notify me via"
                hint="In-app is the only channel this app can deliver today."
              >
                <div className="flex flex-wrap gap-1.5">
                  {CHANNEL_OPTIONS.map(([channel, label]) => {
                    const active = channels.includes(channel);
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => toggleChannel(channel)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
                          active
                            ? "border-primary/40 bg-primary/5"
                            : "text-muted-foreground opacity-60"
                        )}
                      >
                        {active ? <Check className="size-3" /> : null}
                        {label}
                      </button>
                    );
                  })}
                </div>
                {channels.map((channel) => (
                  <input
                    key={channel}
                    type="hidden"
                    name="notification_channels"
                    value={channel}
                  />
                ))}
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Default snooze"
                  hint={
                    reminder?.snooze_minutes
                      ? `Currently ${snoozeLabel(reminder.snooze_minutes)}`
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    name="snooze_minutes"
                    min={1}
                    max={10080}
                    defaultValue={reminder?.snooze_minutes ?? ""}
                    placeholder="Minutes"
                  />
                </FormField>

                <FormField label="Sound" hint="Optional label for a future channel.">
                  <Input name="sound" defaultValue={reminder?.sound ?? ""} placeholder="chime" />
                </FormField>
              </div>

              <FormField label="Description" hint="Shown in the notification itself.">
                <Textarea name="description" defaultValue={reminder?.description ?? ""} rows={2} />
              </FormField>
            </div>
          ) : (
            // Keep the schema's defaults present even while the panel is closed.
            <>
              <input type="hidden" name="repeat_rule" value="none" />
              <input type="hidden" name="notification_channels" value="in_app" />
            </>
          )}

          {state.error && !effectiveAdvanced ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : reminder ? "Save changes" : "Create reminder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One-line summary of a reminder's schedule, used in the list rows. */
export function ScheduleSummary({
  remindAt,
  advanceMinutes,
  repeat,
  isEnabled,
}: {
  remindAt: string;
  advanceMinutes: number;
  repeat: string | null;
  isEnabled: boolean;
}) {
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <CalendarClock className="size-3" />
        {remindAt}
      </span>
      {advanceMinutes > 0 ? (
        <span className="rounded bg-warning/12 px-1.5 py-0.5 text-warning">
          {snoozeLabel(advanceMinutes)} early
        </span>
      ) : null}
      {repeat ? (
        <span className="flex items-center gap-1">
          <Repeat className="size-3" />
          {repeat}
        </span>
      ) : null}
      {!isEnabled ? (
        <span className="flex items-center gap-1 text-muted-foreground">
          <Bell className="size-3" />
          Muted
        </span>
      ) : null}
    </span>
  );
}

