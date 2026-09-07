import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type {
  MilestoneStatus,
  PhaseStatus,
  Priority,
  ProjectStatus,
  TaskStatus,
} from "@/types";

const projectStatusStyles: Record<ProjectStatus, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  on_hold: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  completed: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  archived: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const taskStatusStyles: Record<TaskStatus, string> = {
  backlog: "border-muted-foreground/30 bg-muted text-muted-foreground",
  todo: "border-muted-foreground/30 bg-muted text-muted-foreground",
  in_progress: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

const phaseStatusStyles: Record<PhaseStatus, string> = {
  planned: "border-muted-foreground/30 bg-muted text-muted-foreground",
  in_progress: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  blocked: "border-destructive/30 bg-destructive/10 text-destructive",
};

const milestoneStatusStyles: Record<MilestoneStatus, string> = {
  not_started: "border-muted-foreground/30 bg-muted text-muted-foreground",
  in_progress: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
};

const priorityStyles: Record<Priority, string> = {
  none: "border-transparent bg-transparent text-muted-foreground",
  low: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  high: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  urgent: "border-destructive/30 bg-destructive/10 text-destructive",
};

export const projectStatusLabel: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

export const taskStatusLabel: Record<TaskStatus, string> = {
  backlog: "Backlog",
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

export const phaseStatusLabel: Record<PhaseStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

export const milestoneStatusLabel: Record<MilestoneStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

export const priorityLabel: Record<Priority, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function StyledBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return <Badge variant="secondary" className={cn(className, "border")}>{label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <StyledBadge label={projectStatusLabel[status]} className={projectStatusStyles[status]} />;
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <StyledBadge label={taskStatusLabel[status]} className={taskStatusStyles[status]} />;
}

export function PhaseStatusBadge({ status }: { status: PhaseStatus }) {
  return <StyledBadge label={phaseStatusLabel[status]} className={phaseStatusStyles[status]} />;
}

export function MilestoneStatusBadge({ status }: { status: MilestoneStatus }) {
  return <StyledBadge label={milestoneStatusLabel[status]} className={milestoneStatusStyles[status]} />;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <PriorityBadgeInner
      label={priorityLabel[priority]}
      className={priorityStyles[priority]}
    />
  );
}

function PriorityBadgeInner({ label, className }: { label: string; className: string }) {
  return <StyledBadge label={label} className={className} />;
}

export function appointmentColorClass(color: string | null) {
  if (!color) return "border-border bg-card";
  const map: Record<string, string> = {
    blue: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
    green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    red: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    purple: "border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400",
  };
  return map[color] ?? "border-border bg-card";
}