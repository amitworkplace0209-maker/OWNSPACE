"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Target, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { formatDateShort } from "@/lib/format";
import {
  createPhaseAction,
  updatePhaseAction,
  setPhaseStatusAction,
  deletePhaseAction,
  createMilestoneAction,
  updateMilestoneAction,
  setMilestoneStatusAction,
  deleteMilestoneAction,
} from "@/lib/actions/phases-milestones";
import type { PhaseWithProgress } from "@/lib/dal/phases-milestones";
import type { Milestone, ProjectPhase } from "@/types";
import { cn } from "cn";

const phaseStatuses = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
] as const;

const milestoneStatuses = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
] as const;

type PhaseFormState = { error?: string; data?: { id: string } };
type MilestoneFormState = { error?: string; data?: { id: string } };

export function PhasesMilestonesEditor({
  projectId,
  phases,
  milestones,
  readOnly = false,
}: {
  projectId: string;
  phases: PhaseWithProgress[];
  milestones: Milestone[];
  readOnly?: boolean;
}) {
  const router = useRouter();

  const [phaseOpen, setPhaseOpen] = useState(false);
  const [editingPhase, setEditingPhase] = useState<ProjectPhase | null>(null);
  const [deletingPhase, setDeletingPhase] = useState<ProjectPhase | null>(null);

  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [deletingMilestone, setDeletingMilestone] = useState<Milestone | null>(null);
  const [presetPhaseId, setPresetPhaseId] = useState<string | undefined>(undefined);

  const orphanMilestones = milestones.filter((m) => !m.phase_id);

  function openPhaseCreate() {
    setEditingPhase(null);
    setPhaseOpen(true);
  }
  function openMilestoneCreate(phaseId?: string) {
    setEditingMilestone(null);
    setPresetPhaseId(phaseId);
    setMilestoneOpen(true);
  }

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight">Phases and milestones</h2>
          <p className="text-sm text-muted-foreground">
            Organise your project into phases, each with its own milestones.
          </p>
        </div>
        <div className="flex gap-2">
          {!readOnly ? (
            <>
              <Button variant="outline" onClick={() => openMilestoneCreate()}>
                <Target /> New milestone
              </Button>
              <Button onClick={openPhaseCreate}>
                <Plus /> New phase
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {phases.length === 0 && orphanMilestones.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No phases or milestones"
          description={readOnly ? "This project has no phases." : "Break the project into phases to track progress."}
          action={
            readOnly ? undefined : (
              <Button onClick={openPhaseCreate}>
                <Plus /> Create a phase
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {phases.map((phase) => {
            const phaseMilestones = milestones.filter((m) => m.phase_id === phase.id);
            return (
              <PhaseCard
                key={phase.id}
                phase={phase}
                phaseMilestones={phaseMilestones}
                readOnly={readOnly}
                onEdit={() => { setEditingPhase(phase); setPhaseOpen(true); }}
                onDelete={() => setDeletingPhase(phase)}
                onAddMilestone={() => openMilestoneCreate(phase.id)}
                onEditMilestone={(m) => { setEditingMilestone(m); setPresetPhaseId(m.phase_id ?? undefined); setMilestoneOpen(true); }}
                onDeleteMilestone={(m) => setDeletingMilestone(m)}
              />
            );
          })}

          {orphanMilestones.length > 0 ? (
            <div className="rounded-xl border bg-card p-4 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Flag className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Milestones without a phase</h3>
              </div>
              <ul className="flex flex-col gap-2">
                {orphanMilestones.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    readOnly={readOnly}
                    onEdit={() => { setEditingMilestone(m); setPresetPhaseId(undefined); setMilestoneOpen(true); }}
                    onDelete={() => setDeletingMilestone(m)}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      <PhaseFormDialog
        open={phaseOpen}
        onOpenChange={setPhaseOpen}
        projectId={projectId}
        phase={editingPhase}
      />
      <MilestoneFormDialog
        open={milestoneOpen}
        onOpenChange={setMilestoneOpen}
        projectId={projectId}
        phases={phases}
        milestone={editingMilestone}
        presetPhaseId={presetPhaseId}
      />

      <ConfirmDialog
        open={Boolean(deletingPhase)}
        onOpenChange={(open) => { if (!open) setDeletingPhase(null); }}
        title={`Delete phase "${deletingPhase?.name ?? ""}"?`}
        description="Milestones stay but are unlinked from the phase. Tasks keep their phase reference."
        confirmLabel="Delete phase"
        onConfirm={async () => {
          if (!deletingPhase) return;
          await deletePhaseAction(deletingPhase.id);
          setDeletingPhase(null);
          router.refresh();
        }}
      />
      <ConfirmDialog
        open={Boolean(deletingMilestone)}
        onOpenChange={(open) => { if (!open) setDeletingMilestone(null); }}
        title={`Delete milestone "${deletingMilestone?.title ?? ""}"?`}
        description="This permanently removes the milestone."
        confirmLabel="Delete milestone"
        onConfirm={async () => {
          if (!deletingMilestone) return;
          await deleteMilestoneAction(deletingMilestone.id);
          setDeletingMilestone(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function PhaseCard({
  phase,
  phaseMilestones,
  readOnly,
  onEdit,
  onDelete,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
}: {
  phase: PhaseWithProgress;
  phaseMilestones: Milestone[];
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddMilestone: () => void;
  onEditMilestone: (m: Milestone) => void;
  onDeleteMilestone: (m: Milestone) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{phase.name}</h3>
            <PhaseStatusSelect
              phase={phase}
              readOnly={readOnly}
            />
          </div>
          {phase.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{phase.description}</p>
          ) : null}
          {phase.start_date || phase.due_date ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {phase.start_date ? formatDateShort(phase.start_date) : null}
              {phase.start_date && phase.due_date ? " → " : null}
              {phase.due_date ? formatDateShort(phase.due_date) : null}
            </p>
          ) : null}
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit phase ${phase.name}`} onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete phase ${phase.name}`} onClick={onDelete}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {phase.taskTotal > 0 ? (
        <div className="flex items-center gap-2">
          <Progress value={phase.progress} className="h-1.5 flex-1" />
          <span className="text-xs tabular-nums text-muted-foreground">
            {phase.taskDone}/{phase.taskTotal}
          </span>
        </div>
      ) : null}

      {phaseMilestones.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {phaseMilestones.map((m) => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              readOnly={readOnly}
              onEdit={() => onEditMilestone(m)}
              onDelete={() => onDeleteMilestone(m)}
            />
          ))}
        </ul>
      ) : null}

      {!readOnly ? (
        <Button variant="ghost" size="sm" onClick={onAddMilestone} className="self-start">
          <Plus /> Add milestone
        </Button>
      ) : null}
    </div>
  );
}

function MilestoneRow({
  milestone,
  readOnly,
  onEdit,
  onDelete,
}: {
  milestone: Milestone;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
      <button
        onClick={() => void setMilestoneStatusAction(milestone.id, milestone.status === "completed" ? "not_started" : "completed")}
        disabled={readOnly}
        aria-label="Toggle milestone status"
        className="shrink-0 rounded-full border border-border p-1 text-muted-foreground transition hover:text-primary disabled:cursor-default disabled:opacity-60"
      >
        {milestone.status === "completed" ? (
          <Target className="size-3.5 text-emerald-500" />
        ) : (
          <span className="block size-3 rounded-full border" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm", milestone.status === "completed" && "text-muted-foreground line-through")}>
          {milestone.title}
        </p>
        {milestone.due_date ? (
          <p className="text-xs text-muted-foreground">Due {formatDateShort(milestone.due_date)}</p>
        ) : null}
      </div>
      <select
        value={milestone.status}
        onChange={(e) => void setMilestoneStatusAction(milestone.id, e.target.value)}
        disabled={readOnly}
        aria-label="Milestone status"
        className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none disabled:opacity-60 dark:bg-input/30"
      >
        {milestoneStatuses.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
      {!readOnly ? (
        <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${milestone.title}`} onClick={onEdit}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${milestone.title}`} onClick={onDelete}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function PhaseStatusSelect({ phase, readOnly }: { phase: ProjectPhase; readOnly: boolean }) {
  return (
    <select
      value={phase.status}
      onChange={(e) => void setPhaseStatusAction(phase.id, e.target.value)}
      disabled={readOnly}
      aria-label="Phase status"
      className={cn(
        "h-6 rounded-full border px-2 text-xs font-medium outline-none disabled:opacity-70",
        phase.status === "completed" && "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
        phase.status === "in_progress" && "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-300",
        phase.status === "blocked" && "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300",
        phase.status === "planned" && "border-muted bg-muted text-muted-foreground dark:bg-input/30"
      )}
    >
      {phaseStatuses.map((s) => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  );
}

function PhaseFormDialog({
  open,
  onOpenChange,
  projectId,
  phase,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  phase: ProjectPhase | null;
}) {
  const router = useRouter();
  const action = phase ? updatePhaseAction.bind(null, phase.id) : createPhaseAction.bind(null, projectId);
  const [state, formAction, pending] = useActionState<PhaseFormState, FormData>(action, { error: undefined });

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
          <DialogTitle>{phase ? "Edit phase" : "New phase"}</DialogTitle>
          <DialogDescription>
            Phases group milestones into logical stages of the project.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField label="Name" htmlFor="phase-name" error={state.error}>
            <Input id="phase-name" name="name" defaultValue={phase?.name ?? ""} placeholder="e.g. Strategy" required />
          </FormField>
          <FormField label="Description" htmlFor="phase-description">
            <Textarea id="phase-description" name="description" defaultValue={phase?.description ?? ""} rows={2} placeholder="What is this phase about?" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Status">
              <select name="status" defaultValue={phase?.status ?? "planned"} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                {phaseStatuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </FormField>
            <FormField label="Start date">
              <Input type="date" name="start_date" defaultValue={phase?.start_date?.slice(0, 10) ?? ""} />
            </FormField>
            <FormField label="Due date">
              <Input type="date" name="due_date" defaultValue={phase?.due_date?.slice(0, 10) ?? ""} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : phase ? "Save changes" : "Create phase"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MilestoneFormDialog({
  open,
  onOpenChange,
  projectId,
  phases,
  milestone,
  presetPhaseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  phases: PhaseWithProgress[];
  milestone: Milestone | null;
  presetPhaseId?: string;
}) {
  const router = useRouter();
  const action = milestone ? updateMilestoneAction.bind(null, milestone.id) : createMilestoneAction;
  const [state, formAction, pending] = useActionState<MilestoneFormState, FormData>(action, { error: undefined });

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
          <DialogTitle>{milestone ? "Edit milestone" : "New milestone"}</DialogTitle>
          <DialogDescription>
            A milestone is a key deliverable you want to hit.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="project_id" value={projectId} />
          <FormField label="Title" htmlFor="milestone-title" error={state.error}>
            <Input id="milestone-title" name="title" defaultValue={milestone?.title ?? ""} placeholder="e.g. Launch beta" required />
          </FormField>
          <FormField label="Description" htmlFor="milestone-description">
            <Textarea id="milestone-description" name="description" defaultValue={milestone?.description ?? ""} rows={2} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Phase">
              <select
                name="phase_id"
                defaultValue={milestone?.phase_id ?? presetPhaseId ?? ""}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                <option value="">No phase</option>
                {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
            <FormField label="Due date">
              <Input type="date" name="due_date" defaultValue={milestone?.due_date?.slice(0, 10) ?? ""} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : milestone ? "Save changes" : "Create milestone"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}