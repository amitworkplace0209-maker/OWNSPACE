"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { createTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import { TASK_STATUSES, PRIORITIES } from "@/types";
import { toIsoSubmit } from "@/lib/format";
import type { ProjectPhase, Task } from "@/types";
import type { Project } from "@/types";

const statusLabel: Record<string, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

const priorityLabel: Record<string, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function TaskFormDialog({
  open,
  onOpenChange,
  projects,
  phases,
  task,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  phases: ProjectPhase[];
  task?: Task | null;
  defaultProjectId?: string | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(task?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "");

  const action = task ? updateTaskAction.bind(null, task.id) : createTaskAction;
  const [state, formAction, pending] = useActionState(action, { error: undefined });

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  const phaseOptions = phases.filter((p) => p.project_id === projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update the task details below." : "Create a task and assign it to a project."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            const normalized = new FormData();
            for (const [key, value] of fd.entries()) normalized.append(key, value);
            normalized.set("reminder_at", toIsoSubmit(String(fd.get("reminder_at") ?? "")));
            formAction(normalized);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Title" htmlFor="task-title" error={state.error}>
            <Input
              id="task-title"
              name="title"
              defaultValue={task?.title ?? ""}
              placeholder="e.g. Design the landing page"
              required
            />
          </FormField>

          <FormField label="Description" htmlFor="task-description">
            <Textarea
              id="task-description"
              name="description"
              defaultValue={task?.description ?? ""}
              rows={3}
              placeholder="Add task details…"
            />
          </FormField>

          <FormField label="Project" htmlFor="task-project">
            <select
              id="task-project"
              name="project_id"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              required
            >
              {projects.length === 0 ? (
                <option value="">No projects available</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))
              )}
            </select>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Status">
              <select
                name="status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                defaultValue={task?.status ?? "todo"}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel[s]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Priority">
              <select
                name="priority"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                defaultValue={task?.priority ?? "none"}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabel[p]}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Due date">
              <Input
                type="date"
                name="due_date"
                defaultValue={task?.due_date?.slice(0, 10) ?? ""}
              />
            </FormField>
            <FormField label="Reminder" hint="Optional — receive an in-app reminder.">
              <Input
                type="datetime-local"
                name="reminder_at"
                defaultValue={task?.reminder_at?.slice(0, 16) ?? ""}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phase" hint="Optional — assign to a project phase.">
              <select
                name="phase_id"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                defaultValue={task?.phase_id ?? ""}
              >
                <option value="">No phase</option>
                {phaseOptions.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : task ? "Save changes" : "Create task"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}