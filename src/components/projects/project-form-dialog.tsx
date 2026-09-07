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
import { createProjectAction, updateProjectAction } from "@/lib/actions/projects";
import { PROJECT_STATUSES, PRIORITIES } from "@/types";
import type { Project } from "@/types";

const statusLabel: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const priorityLabel: Record<string, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function StatusSelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  return (
    <select
      name={name}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      defaultValue={defaultValue}
    >
      {PROJECT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel[s]}
        </option>
      ))}
    </select>
  );
}

function PrioritySelect({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue: string;
}) {
  return (
    <select
      name={name}
      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      defaultValue={defaultValue}
    >
      {PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {priorityLabel[p]}
        </option>
      ))}
    </select>
  );
}

export function ProjectFormDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(project?.name ?? "");
  const action = project
    ? updateProjectAction.bind(null, project.id)
    : createProjectAction;

  const [state, formAction, pending] = useActionState(action, {
    error: undefined,
  });

  // Re-sync the dialog heading when switching between create/edit targets.
  const isEdit = Boolean(project);

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the project details below."
              : "Set up a new project to organize tasks, phases and milestones."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="project-name" error={state.error}>
            <Input
              id="project-name"
              name="name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Website redesign"
              required
            />
          </FormField>

          <FormField label="Description" htmlFor="project-description">
            <Textarea
              id="project-description"
              name="description"
              defaultValue={project?.description ?? ""}
              rows={3}
              placeholder="What is this project about?"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Status">
              <StatusSelect
                name="status"
                defaultValue={project?.status ?? "active"}
              />
            </FormField>
            <FormField label="Priority">
              <PrioritySelect name="priority" defaultValue={project?.priority ?? "none"} />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Start date">
              <Input
                type="date"
                name="start_date"
                defaultValue={project?.start_date?.slice(0, 10) ?? ""}
              />
            </FormField>
            <FormField label="Due date">
              <Input
                type="date"
                name="due_date"
                defaultValue={project?.due_date?.slice(0, 10) ?? ""}
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Color" hint="Optional accent color for the project card.">
              <Input
                type="text"
                name="color"
                defaultValue={project?.color ?? ""}
                placeholder="e.g. #7c3aed"
                maxLength={30}
              />
            </FormField>
            <FormField label="Icon" hint="Optional emoji or short label.">
              <Input
                type="text"
                name="icon"
                defaultValue={project?.icon ?? ""}
                placeholder="e.g. 🚀"
                maxLength={50}
              />
            </FormField>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : isEdit ? "Save changes" : "Create project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}