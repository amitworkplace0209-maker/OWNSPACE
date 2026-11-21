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
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { OfflineTaskWrite } from "@/hooks/use-tasks-live";
import type { CachedTask } from "@/lib/offline/task-cache";
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
  onOfflineSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  phases: ProjectPhase[];
  task?: Task | null;
  defaultProjectId?: string | null;
  /** Provided by the workspace: queues a write in IndexedDB when offline. */
  onOfflineSave?: (input: OfflineTaskWrite) => Promise<string | null>;
}) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [projectId, setProjectId] = useState(task?.project_id ?? defaultProjectId ?? projects[0]?.id ?? "");
  const [localError, setLocalError] = useState<string | undefined>();
  const [savingOffline, setSavingOffline] = useState(false);

  const action = task ? updateTaskAction.bind(null, task.id) : createTaskAction;
  const [state, formAction, pending] = useActionState(action, { error: undefined });
  const error = localError ?? state.error;
  const busy = pending || savingOffline;

  async function saveOffline(fd: FormData) {
    if (!onOfflineSave) return;
    const title = String(fd.get("title") ?? "").trim();
    if (!title) {
      setLocalError("Enter a title.");
      return;
    }
    if (!projectId) {
      setLocalError("Select a project.");
      return;
    }

    const project = projects.find((candidate) => candidate.id === projectId);
    const patch: Partial<CachedTask> = {
      title,
      description: String(fd.get("description") ?? "") || null,
      project_id: projectId,
      project_name: project?.name ?? "Project",
      project_color: project?.color ?? null,
      phase_id: String(fd.get("phase_id") ?? "") || null,
      status: String(fd.get("status") ?? "todo") as CachedTask["status"],
      priority: String(fd.get("priority") ?? "none") as CachedTask["priority"],
      progress: task?.progress ?? 0,
      start_date: task?.start_date ?? null,
      due_date: String(fd.get("due_date") ?? "") || null,
      reminder_at: String(fd.get("reminder_at") ?? "") || null,
      estimated_minutes: task?.estimated_minutes ?? null,
      sort_order: task?.sort_order ?? 0,
    };

    setSavingOffline(true);
    const id = await onOfflineSave({
      op: task ? "update" : "create",
      taskId: task?.id ?? "",
      patch,
    });
    setSavingOffline(false);
    if (id) {
      setLocalError(undefined);
      onOpenChange(false);
      router.refresh();
    } else {
      setLocalError("Could not save this task on the device.");
    }
  }

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  const phaseOptions = phases.filter((p) => p.project_id === projectId);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setLocalError(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {task ? "Update the task details below." : "Create a task and assign it to a project."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            if (!online) {
              // No request leaves the device: the row and the intent to sync it
              // are both in IndexedDB before this form closes.
              void saveOffline(fd);
              return;
            }
            const normalized = new FormData();
            for (const [key, value] of fd.entries()) normalized.append(key, value);
            normalized.set("reminder_at", toIsoSubmit(String(fd.get("reminder_at") ?? "")));
            formAction(normalized);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Title" htmlFor="task-title" error={error}>
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
            <Button type="submit" disabled={busy}>
              {busy
                ? "Saving…"
                : online
                  ? task
                    ? "Save changes"
                    : "Create task"
                  : task
                    ? "Save on device"
                    : "Create on device"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}