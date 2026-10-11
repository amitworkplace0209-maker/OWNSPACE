"use client";

import { cn } from "cn";
import { Clock, CheckCircle, AlertTriangle, XCircle, TrendingUp, Target } from "lucide-react";
import { ColorPreview } from "./color-selector";
import { IconPreview } from "./icon-picker";
import type { Project, ProjectStatus, Priority } from "@/types";

interface ProjectPreviewData {
  name: string;
  title?: string;
  description?: string;
  icon?: string;
  color?: string;
  status: ProjectStatus;
  priority: Priority;
  progress: number;
  startDate?: string;
  dueDate?: string;
  totalDays?: number;
  daysRemaining?: number;
  daysElapsed?: number;
  elapsedPercent?: number;
  remainingPercent?: number;
  structureCounts?: {
    phases: number;
    chapters: number;
    lessons: number;
    topics: number;
    collections: number;
  };
  taskCount?: number;
  checklistTotal?: number;
  checklistCompleted?: number;
  reminderCount?: number;
  dailyNotesEnabled?: boolean;
  financeEnabled?: boolean;
  resourceCount?: number;
}

const statusConfig: Record<ProjectStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  active: { label: "Active", color: "bg-emerald-500", icon: CheckCircle },
  on_hold: { label: "On hold", color: "bg-amber-500", icon: AlertTriangle },
  completed: { label: "Completed", color: "bg-sky-500", icon: CheckCircle },
  archived: { label: "Archived", color: "bg-muted-foreground", icon: XCircle },
};

const priorityConfig: Record<Priority, { label: string; color: string }> = {
  none: { label: "None", color: "bg-muted" },
  low: { label: "Low", color: "bg-sky-500" },
  medium: { label: "Medium", color: "bg-blue-500" },
  high: { label: "High", color: "bg-orange-500" },
  urgent: { label: "Urgent", color: "bg-red-500" },
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function getDaysUntil(dateStr: string | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function ProjectPreview({ data, variant = "card", className }: { data: ProjectPreviewData; variant?: "card" | "detailed" | "compact"; className?: string }) {
  const statusInfo = statusConfig[data.status];
  const priorityInfo = priorityConfig[data.priority];
  const daysLeft = getDaysUntil(data.dueDate);

  const countdownText = daysLeft === null
    ? "No due date"
    : daysLeft < 0
    ? `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? "s" : ""}`
    : daysLeft === 0
    ? "Due today"
    : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} remaining`;

  const countdownColor = daysLeft === null
    ? "text-muted-foreground"
    : daysLeft < 0
    ? "text-destructive"
    : daysLeft <= 3
    ? "text-amber-500"
    : "text-muted-foreground";

  const progressColor = data.progress >= 80 ? "bg-emerald-500" : data.progress >= 50 ? "bg-amber-500" : "bg-blue-500";

  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-3 p-3 rounded-lg border bg-card", className)}>
        <IconPreview icon={data.icon} color={data.color} size="md" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{data.name}</p>
          <p className="text-xs text-muted-foreground truncate">{data.title ?? data.description ?? ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("size-2 rounded-full", statusInfo.color)} />
          <span className="text-xs text-muted-foreground">{data.progress}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border bg-card p-5 transition-all", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <IconPreview icon={data.icon} color={data.color} size="lg" />
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate">{data.name}</h3>
            {data.title && <p className="text-sm text-muted-foreground">{data.title}</p>}
            {data.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{data.description}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={cn("size-2.5 rounded-full", statusInfo.color)} aria-label={statusInfo.label} />
          <span className="text-xs font-medium text-muted-foreground capitalize">{data.status.replace("_", " ")}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", priorityInfo.color, "text-white")}>
          {priorityInfo.label}
        </span>
        {data.dueDate && (
          <span className={cn("rounded-full border px-2 py-0.5 text-xs", countdownColor)}>
            <Clock className="size-3 inline-block align-middle mr-1" />
            {countdownText}
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span>Progress</span>
          <span className="tabular-nums font-medium">{data.progress}%</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all duration-500", progressColor)}
            style={{ width: `${data.progress}%` }}
          />
        </div>

        {variant === "detailed" && (data.startDate || data.dueDate) && (
          <div className="pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Timeline</span>
              <span>{data.elapsedPercent !== undefined ? `${data.elapsedPercent}% elapsed` : ""}</span>
            </div>
            <div className="relative h-1.5 rounded-full bg-muted">
              {data.elapsedPercent !== undefined && data.elapsedPercent > 0 && (
                <div
                  className="h-full rounded-full bg-primary/50"
                  style={{ width: `${Math.min(data.elapsedPercent, 100)}%` }}
                />
              )}
              {data.remainingPercent !== undefined && data.remainingPercent > 0 && (
                <div
                  className="absolute top-0 right-0 h-full rounded-full bg-emerald-500/50"
                  style={{ width: `${Math.min(data.remainingPercent, 100)}%` }}
                />
              )}
              {daysLeft !== null && daysLeft >= 0 && (
                <div
                  className="absolute top-0 h-full w-px bg-primary"
                  style={{ left: `${data.elapsedPercent ?? 0}%` }}
                />
              )}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>{data.startDate ? formatDate(data.startDate) : "Start"}</span>
              <span>{data.dueDate ? formatDate(data.dueDate) : "Due"}</span>
            </div>
          </div>
        )}

        {variant === "detailed" && (
          <>
            {(data.structureCounts || data.taskCount || data.checklistTotal || data.reminderCount) && (
              <div className="pt-3 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                {data.structureCounts && (
                  <>
                    <div>
                      <p className="text-lg font-semibold">{data.structureCounts.phases}</p>
                      <p className="text-xs text-muted-foreground">Phases</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{data.structureCounts.chapters + data.structureCounts.lessons + data.structureCounts.topics}</p>
                      <p className="text-xs text-muted-foreground">Content</p>
                    </div>
                  </>
                )}
                {data.taskCount !== undefined && (
                  <div>
                    <p className="text-lg font-semibold">{data.taskCount}</p>
                    <p className="text-xs text-muted-foreground">Tasks</p>
                  </div>
                )}
                {data.checklistTotal !== undefined && (
                  <div>
                    <p className="text-lg font-semibold">{data.checklistCompleted ?? 0}/{data.checklistTotal}</p>
                    <p className="text-xs text-muted-foreground">Checklist</p>
                  </div>
                )}
                {data.reminderCount !== undefined && (
                  <div>
                    <p className="text-lg font-semibold">{data.reminderCount}</p>
                    <p className="text-xs text-muted-foreground">Reminders</p>
                  </div>
                )}
                {(data.dailyNotesEnabled || data.financeEnabled || data.resourceCount !== undefined) && (
                  <>
                    {data.dailyNotesEnabled && (
                      <div>
                        <p className="text-lg font-semibold text-emerald-500">✓</p>
                        <p className="text-xs text-muted-foreground">Daily Notes</p>
                      </div>
                    )}
                    {data.financeEnabled && (
                      <div>
                        <p className="text-lg font-semibold text-blue-500">$</p>
                        <p className="text-xs text-muted-foreground">Finance</p>
                      </div>
                    )}
                    {data.resourceCount !== undefined && (
                      <div>
                        <p className="text-lg font-semibold">{data.resourceCount}</p>
                        <p className="text-xs text-muted-foreground">Resources</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ProjectPreviewCard({ project, className }: { project: Project; className?: string }) {
  const previewData: ProjectPreviewData = {
    name: project.name,
    description: project.description ?? undefined,
    icon: project.icon ?? undefined,
    color: project.color ?? undefined,
    status: project.status,
    priority: project.priority,
    progress: project.progress ?? 0,
    startDate: project.start_date ?? undefined,
    dueDate: project.due_date ?? undefined,
  };

  return <ProjectPreview data={previewData} variant="card" className={className} />;
}