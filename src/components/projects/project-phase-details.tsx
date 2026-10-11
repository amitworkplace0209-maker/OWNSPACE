import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Flag,
  ListChecks,
  Pencil,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SectionHeader } from "@/components/shared/section-header";
import { EmptyState } from "@/components/shared/empty-state";
import {
  MilestoneStatusBadge,
  PhaseStatusBadge,
} from "@/components/shared/badges";
import { checklistProgress } from "@/lib/dal/checklists";
import { formatDateShort } from "@/lib/format";
import { cn } from "cn";
import type { PhaseWithProgress } from "@/lib/dal/phases-milestones";
import type { ChecklistWithItems } from "@/lib/dal/checklists";
import type { Milestone } from "@/types";

/**
 * Phases with their checklists.
 *
 * A checklist hangs off a task or a structure node, and a task hangs off a
 * phase — so the grouping is done here rather than in the query, and a checklist
 * whose owner is not in this project lands in the "Other checklists" group
 * instead of disappearing.
 */
export function ProjectPhaseDetails({
  projectId,
  phases,
  milestones,
  checklists,
  taskPhaseById,
}: {
  projectId: string;
  phases: PhaseWithProgress[];
  milestones: Milestone[];
  checklists: ChecklistWithItems[];
  /** task id → phase id, used to bucket checklists under their phase. */
  taskPhaseById: Map<string, string | null>;
}) {
  const allItems = checklists.flatMap((checklist) => checklist.items);
  const overall = checklistProgress(allItems);

  const orphanChecklists = checklists.filter((checklist) => {
    if (!checklist.task_id) return false;
    return taskPhaseById.get(checklist.task_id) == null;
  });

  const checklistsByPhase = new Map<string, ChecklistWithItems[]>();
  for (const checklist of checklists) {
    if (!checklist.task_id) continue;
    const phaseId = taskPhaseById.get(checklist.task_id);
    if (!phaseId) continue;
    const list = checklistsByPhase.get(phaseId) ?? [];
    list.push(checklist);
    checklistsByPhase.set(phaseId, list);
  }

  const orphanMilestones = milestones.filter((milestone) => !milestone.phase_id);
  const hasContent =
    phases.length > 0 || orphanMilestones.length > 0 || checklists.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Phase details"
        description="Every phase with its milestones, task progress and the checklists attached to it."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/projects/${projectId}/checklist`} />}
            >
              <ListChecks /> All checklists
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/projects/${projectId}/phases`} />}
            >
              <Pencil /> Manage phases
            </Button>
          </>
        }
      />

      {allItems.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
            <span className="text-sm font-medium">{overall}% complete</span>
          </div>
          <Progress value={overall} className="h-1.5 min-w-32 flex-1" />
          <span className="text-xs text-muted-foreground">
            {allItems.filter((item) => item.is_completed).length} of {allItems.length}{" "}
            items · {checklists.length} {checklists.length === 1 ? "checklist" : "checklists"}
          </span>
        </div>
      ) : null}

      {!hasContent ? (
        <EmptyState
          icon={Target}
          title="No phases yet"
          description="Break the project into phases to track progress, milestones and checklists."
          action={
            <Button render={<Link href={`/projects/${projectId}/phases`} />}>
              <Target /> Add a phase
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {phases.map((phase) => (
            <PhaseDetailCard
              key={phase.id}
              phase={phase}
              milestones={milestones.filter((milestone) => milestone.phase_id === phase.id)}
              checklists={checklistsByPhase.get(phase.id) ?? []}
            />
          ))}

          {orphanMilestones.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Flag className="size-4 text-muted-foreground" />
                  Milestones without a phase
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {orphanMilestones.map((milestone) => (
                    <MilestoneRow key={milestone.id} milestone={milestone} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {orphanChecklists.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ListChecks className="size-4 text-muted-foreground" />
                  Checklists outside a phase
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {orphanChecklists.map((checklist) => (
                  <ChecklistBlock key={checklist.id} checklist={checklist} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}

function PhaseDetailCard({
  phase,
  milestones,
  checklists,
}: {
  phase: PhaseWithProgress;
  milestones: Milestone[];
  checklists: ChecklistWithItems[];
}) {
  const items = checklists.flatMap((checklist) => checklist.items);

  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate text-sm">{phase.name}</CardTitle>
              <PhaseStatusBadge status={phase.status} />
            </div>
            {phase.description ? (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {phase.description}
              </p>
            ) : null}
            {phase.start_date || phase.due_date ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3" />
                {phase.start_date ? formatDateShort(phase.start_date) : "—"}
                {" → "}
                {phase.due_date ? formatDateShort(phase.due_date) : "—"}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="text-sm font-semibold tabular-nums">{phase.progress}%</span>
            <span className="text-xs text-muted-foreground">
              {phase.taskDone}/{phase.taskTotal} tasks
            </span>
          </div>
        </div>
        <Progress value={phase.progress} className="h-1.5" />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div>
          <SectionLabel icon={Target}>Milestones</SectionLabel>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones in this phase.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {milestones.map((milestone) => (
                <MilestoneRow key={milestone.id} milestone={milestone} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel icon={ListChecks}>
            Checklists{items.length > 0 ? ` · ${checklistProgress(items)}%` : ""}
          </SectionLabel>
          {checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No checklists attached to this phase.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {checklists.map((checklist) => (
                <ChecklistBlock key={checklist.id} checklist={checklist} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SectionLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: ReactNode }) {
  return (
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase">
      <Icon className="size-3" />
      {children}
    </p>
  );
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  return (
    <li className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2">
      <span
        aria-hidden="true"
        className={cn(
          "size-3.5 shrink-0 rounded-full",
          milestone.status === "completed" ? "bg-success" : "border"
        )}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            milestone.status === "completed" && "text-muted-foreground line-through"
          )}
        >
          {milestone.title}
        </p>
        {milestone.description ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {milestone.description}
          </p>
        ) : null}
      </div>
      {milestone.due_date ? (
        <span className="shrink-0 text-xs text-muted-foreground">
          due {formatDateShort(milestone.due_date)}
        </span>
      ) : null}
      <MilestoneStatusBadge status={milestone.status} />
    </li>
  );
}

function ChecklistBlock({ checklist }: { checklist: ChecklistWithItems }) {
  const progress = checklistProgress(checklist.items);

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{checklist.title}</p>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{progress}%</span>
      </div>
      {checklist.ownerLabel || checklist.description ? (
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {checklist.ownerLabel ? `Attached to ${checklist.ownerLabel}` : null}
          {checklist.ownerLabel && checklist.description ? " · " : null}
          {checklist.description}
        </p>
      ) : null}
      <Progress value={progress} className="mt-2 h-1.5" />

      {checklist.items.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No items.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {checklist.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 border-b border-border/40 py-1 text-sm last:border-0">
              <span
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 rounded-full",
                  item.is_completed ? "bg-success" : "border"
                )}
              />
              <span className={cn("min-w-0 truncate", item.is_completed && "text-muted-foreground line-through")}>
                {item.content}
              </span>
              {item.due_date ? (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  due {formatDateShort(item.due_date)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}