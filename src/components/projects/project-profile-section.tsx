import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CircleDollarSign,
  Clock3,
  FileText,
  FolderTree,
  Globe,
  Layers,
  Link2,
  Pencil,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { SectionHeader } from "@/components/shared/section-header";
import {
  ProjectStatusBadge,
  PriorityBadge,
  projectStatusLabel,
  priorityLabel,
} from "@/components/shared/badges";
import {
  CATEGORY_LABELS,
  PROJECT_TYPE_LABELS,
} from "@/components/project-creator/wizard-step-basic";
import { formatCurrency, formatDate, formatRelativeTime } from "@/lib/format";
import { daysUntil } from "@/lib/dashboard-logic";
import { cn } from "cn";
import type { Project, Tag } from "@/types";
import { ProjectIcon } from "@/components/project-creator/icon-picker";

/**
 * Project profile.
 *
 * Everything the wizard collected about this project in one place: the plain
 * columns, the long-form `details` blocks, the tech stack and the option
 * toggles. It is read-only on purpose — editing happens in Settings, so this
 * section is a reference rather than a second, divergent copy of the form.
 */
export function ProjectProfileSection({
  project,
  tags,
}: {
  project: Project;
  tags: Tag[];
}) {
  const details = project.details ?? {};
  const options = project.options ?? {};
  const daysLeft = daysUntil(project.due_date);

  const budget = project.budget ?? null;
  const hasBudget = budget !== null && budget !== 0;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Profile"
        description="Basic details, schedule and the notes captured when this project was created."
        actions={
          <Button variant="outline" size="sm" render={<Link href={`/projects/${project.id}/settings`} />}>
            <Pencil /> Edit details
          </Button>
        }
      />

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {project.icon ? (
                  <span
                    aria-hidden="true"
                    className="flex size-8 items-center justify-center rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: project.color ?? "var(--primary)" }}
                  >
                    <ProjectIcon
                      name={project.icon}
                      fallbackName={project.name}
                      className="size-4"
                    />
                  </span>
                ) : null}
                <CardTitle className="truncate text-base">{project.name}</CardTitle>
                <ProjectStatusBadge status={project.status} />
                <PriorityBadge priority={project.priority} />
              </div>
              {project.title ? (
                <p className="text-sm text-muted-foreground">{project.title}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-lg font-semibold tabular-nums">{project.progress}%</span>
            </div>
          </div>
          <Progress value={project.progress ?? 0} className="h-2" />
        </CardHeader>

        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Category" icon={Layers}>
            {project.category ? (CATEGORY_LABELS[project.category] ?? project.category) : "—"}
          </Field>
          <Field label="Project type" icon={FolderTree}>
            {project.project_type
              ? (PROJECT_TYPE_LABELS[project.project_type] ?? project.project_type)
              : "—"}
          </Field>
          <Field label="Status" icon={ShieldCheck}>
            {projectStatusLabel[project.status]}
          </Field>
          <Field label="Priority" icon={Sparkles}>
            {priorityLabel[project.priority]}
          </Field>
          <Field label="Start date" icon={CalendarClock}>
            {formatDate(project.start_date)}
          </Field>
          <Field label="Due date" icon={Clock3}>
            <span className="inline-flex items-center gap-2">
              {formatDate(project.due_date)}
              {daysLeft !== null ? (
                <span
                  className={cn(
                    "text-xs",
                    daysLeft < 0
                      ? "text-destructive"
                      : daysLeft <= 7
                        ? "text-warning"
                        : "text-muted-foreground"
                  )}
                >
                  {daysLeft < 0
                    ? `${Math.abs(daysLeft)}d overdue`
                    : daysLeft === 0
                      ? "due today"
                      : `${daysLeft}d left`}
                </span>
              ) : null}
            </span>
          </Field>
          <Field label="Budget" icon={CircleDollarSign}>
            {hasBudget
              ? formatCurrency(budget, project.currency)
              : "No budget set"}
          </Field>
          <Field label="Currency" icon={CircleDollarSign}>
            {project.currency}
          </Field>
          <Field label="Timezone" icon={Clock3}>
            {project.timezone || "UTC"}
          </Field>
          <Field label="Created" icon={Clock3}>
            {formatDate(project.created_at)}
          </Field>
          <Field label="Last updated" icon={Clock3}>
            {formatRelativeTime(project.updated_at)}
          </Field>
        </CardContent>

        {tags.length > 0 ? (
          <>
            <Separator />
            <CardContent className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Tags</span>
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag.name}
                </span>
              ))}
            </CardContent>
          </>
        ) : null}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <DetailCard
          icon={FileText}
          title="Summary"
          blocks={[
            { label: "Short description", value: project.description },
            { label: "Detailed description", value: details.detailed_description },
          ]}
        />
        <DetailCard
          icon={Target}
          title="Objective & goals"
          blocks={[
            { label: "Objective", value: details.objective },
            { label: "Goals", value: details.goals },
            { label: "Scope", value: details.scope },
          ]}
        />
        <DetailCard
          icon={ShieldCheck}
          title="Requirements"
          blocks={[
            { label: "Requirements", value: details.requirements },
            { label: "Important information", value: details.important_info },
          ]}
        />
        <DetailCard
          icon={Layers}
          title="Tech stack"
          blocks={[
            { label: "Frontend", value: details.tech_frontend },
            { label: "Backend", value: details.tech_backend },
            { label: "Database", value: details.tech_database },
            { label: "Hosting", value: details.tech_hosting },
          ]}
        />
        <DetailCard
          icon={Globe}
          title="Links"
          blocks={[
            { label: "Repository", value: details.repo_url, link: true },
            { label: "Website", value: details.website_url, link: true },
            { label: "Documentation", value: details.docs_url, link: true },
          ]}
        />
        <DetailCard
          icon={Sparkles}
          title="Additional notes"
          blocks={[
            { label: "API details", value: details.api_details },
            { label: "Notes", value: details.additional_notes },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="size-4 text-muted-foreground" />
            Project options
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <OptionChip label="History" on={options.history_enabled !== false} />
          <OptionChip label="Version history" on={options.version_history_enabled === true} />
          <OptionChip label="Daily notes" on={options.daily_notes_enabled !== false} />
          <OptionChip label="Calendar" on={options.calendar_enabled !== false} />
          <OptionChip
            label="Notify on task complete"
            on={options.notify_on_task_complete === true}
          />
          <OptionChip label="Notify on overdue" on={options.notify_on_overdue !== false} />
          <OptionChip
            label="Auto-archive on completion"
            on={options.archive_after_completion === true}
          />
          <OptionChip label="Offline draft" on={options.offline_draft !== false} />
          {options.default_task_priority ? (
            <Badge variant="outline">
              Default task priority: {priorityLabel[options.default_task_priority]}
            </Badge>
          ) : null}
          {options.export_format ? (
            <Badge variant="outline">
              Export: {String(options.export_format).toUpperCase()}
            </Badge>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="truncate text-sm font-medium capitalize">{children}</span>
    </div>
  );
}

function DetailCard({
  icon: Icon,
  title,
  blocks,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  blocks: Array<{ label: string; value: string | undefined | null; link?: boolean }>;
}) {
  const filled = blocks.filter((block) => block.value?.trim());

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {filled.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        ) : (
          filled.map((block) => (
            <div key={block.label} className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">{block.label}</span>
              {block.link ? (
                <a
                  href={block.value as string}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm text-primary hover:underline"
                >
                  <Link2 className="size-3.5 shrink-0" />
                  <span className="truncate">{block.value}</span>
                </a>
              ) : (
                <p className="text-sm whitespace-pre-line">{block.value}</p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function OptionChip({ label, on }: { label: string; on: boolean }) {
  return (
    <Badge variant={on ? "default" : "outline"} className="gap-1.5">
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", on ? "bg-primary-foreground" : "bg-muted-foreground")}
      />
      {label}
    </Badge>
  );
}
