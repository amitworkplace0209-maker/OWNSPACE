import Link from "next/link";
import { ArrowUpRight, FileText, ListChecks, Target, Wallet } from "lucide-react";
import { getProject, getProjectTags } from "@/lib/dal/projects";
import { getProjectOverview } from "@/lib/dal/phases-milestones";
import { getProjectChecklists } from "@/lib/dal/checklists";
import { getProjectResources } from "@/lib/dal/project-nodes";
import { getNotes } from "@/lib/dal/notes";
import { getRecentActivity } from "@/lib/dal/calendar";
import { getFiles } from "@/lib/dal/time-files";
import { ProjectProfileSection } from "@/components/projects/project-profile-section";
import { ProjectPhaseDetails } from "@/components/projects/project-phase-details";
import { ProjectResourcesSection } from "@/components/projects/project-resources-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate, formatFileSize } from "@/lib/format";
import { cn } from "cn";

export const metadata = {
  title: "Project",
};

/**
 * Project landing page.
 *
 * A single screen that answers "what is this project, how far along is it and
 * where is everything" — profile, progress, phases with checklists, resources
 * and notes — before the section tabs take over for editing.
 */
export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, tags, overview, checklists, resources, notes, files, activity] =
    await Promise.all([
      getProject(id),
      getProjectTags(id),
      getProjectOverview(id),
      getProjectChecklists(id),
      getProjectResources(id),
      getNotes({ projectId: id, limit: 20 }),
      getFiles({ projectId: id, limit: 8 }),
      getRecentActivity({ projectId: id, limit: 8 }),
    ]);

  // A checklist hangs off a task, and a task carries the phase id, so this is
  // what lets the phase section group checklists under the right phase.
  const taskPhaseById = new Map<string, string | null>(
    overview.tasks.map((task) => [task.id, task.phase_id])
  );

  const completedPhases = overview.phases.filter((phase) => phase.status === "completed").length;
  const completedMilestones = overview.milestones.filter(
    (milestone) => milestone.status === "completed"
  ).length;
  const taskRate = overview.taskTotal
    ? Math.round((overview.taskDone / overview.taskTotal) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-8 py-4">
      <section aria-labelledby="project-progress-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            {project.description ? (
              <p className="max-w-prose text-sm text-muted-foreground">
                {project.description}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Started {formatDate(project.start_date)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={cn(
                  project.due_date && project.due_date < new Date().toISOString().slice(0, 10)
                    ? "text-destructive"
                    : undefined
                )}
              >
                Due {formatDate(project.due_date)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground">Progress</span>
              <span className="text-lg font-semibold tabular-nums">{project.progress}%</span>
            </div>
            <Progress value={project.progress ?? 0} className="h-2 w-32" />
          </div>
        </div>

        <h2 id="project-progress-heading" className="sr-only">
          Progress
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Phases"
            value={overview.phases.length}
            secondary={`${completedPhases} completed`}
            icon={Target}
            href={`/projects/${id}/phases`}
          />
          <MetricCard
            title="Milestones"
            value={overview.milestones.length}
            secondary={`${completedMilestones} completed`}
            icon={ListChecks}
            href={`/projects/${id}/phases`}
          />
          <MetricCard
            title="Total tasks"
            value={overview.taskTotal}
            secondary={`${taskRate}% done`}
            icon={ListChecks}
            href={`/projects/${id}/tasks`}
          />
          <MetricCard
            title="Files"
            value={files.length}
            secondary={formatFileSize(files.reduce((acc, f) => acc + (f.size_bytes ?? 0), 0))}
            icon={FileText}
            href={`/projects/${id}/files`}
          />
        </div>
      </section>

      <ProjectProfileSection project={project} tags={tags} />

      <ProjectPhaseDetails
        projectId={id}
        phases={overview.phases}
        milestones={overview.milestones}
        checklists={checklists}
        taskPhaseById={taskPhaseById}
      />

      <ProjectResourcesSection
        projectId={id}
        resources={resources}
        notes={notes.map((note) => ({
          id: note.id,
          title: note.title,
          content: note.content,
          updated_at: note.updated_at,
        }))}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Recent files</CardTitle>
              <Link
                href={`/projects/${id}/files`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                All <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <EmptyState
                title="No files yet"
                description="Upload files to this project to see them here."
              />
            ) : (
              <ul>
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-2 border-b border-border/50 py-2 last:border-0"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-sm">{file.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {formatFileSize(file.size_bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm">Recent activity</CardTitle>
              <Link
                href={`/projects/${id}/activity`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                All <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                description="Actions you take will appear here."
              />
            ) : (
              <ul>
                {activity.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-2 border-b border-border/50 py-2 text-sm last:border-0"
                  >
                    <span className="min-w-0 truncate text-muted-foreground">
                      {item.summary}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground/70">
                      {formatDate(item.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Link
        href={`/projects/${id}/finance`}
        className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition hover:border-primary/40 hover:shadow-md"
      >
        <span className="flex items-center gap-2 font-medium">
          <Wallet className="size-4 text-muted-foreground" />
          Finance for this project
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground" />
      </Link>
    </div>
  );
}

function MetricCard({
  title,
  value,
  secondary,
  icon: Icon,
  href,
}: {
  title: string;
  value: number;
  secondary: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group/metric flex flex-col gap-1 rounded-xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{secondary}</p>
    </Link>
  );
}