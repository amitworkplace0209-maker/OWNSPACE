import { getProject, getProjectTags } from "@/lib/dal/projects";
import { getProjectOverview } from "@/lib/dal/phases-milestones";
import { getRecentActivity } from "@/lib/dal/calendar";
import { getFiles } from "@/lib/dal/time-files";
import { formatDate, formatFileSize } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ProjectStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { ArrowUpRight, FileText } from "lucide-react";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [project, tags, overview, files, activity] = await Promise.all([
    getProject(id),
    getProjectTags(id),
    getProjectOverview(id),
    getFiles({ projectId: id, limit: 8 }),
    getRecentActivity({ projectId: id, limit: 8 }),
  ]);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          {project.description ? (
            <p className="max-w-prose text-sm text-muted-foreground">{project.description}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.start_date ? (
              <span className="text-xs text-muted-foreground">Started {formatDate(project.start_date)}</span>
            ) : null}
            {project.due_date ? (
              <span className="text-xs text-muted-foreground">· Due {formatDate(project.due_date)}</span>
            ) : null}
          </div>
          {tags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">Progress</span>
            <span className="text-lg font-semibold tabular-nums">{project.progress}%</span>
          </div>
          <Progress value={project.progress ?? 0} className="h-2 w-32" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Phases</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{overview.phases.length}</p>
            <p className="text-xs text-muted-foreground">
              {overview.phases.filter((p) => p.status === "completed").length} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Milestones</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{overview.milestones.length}</p>
            <p className="text-xs text-muted-foreground">
              {overview.milestones.filter((m) => m.status === "completed").length} completed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Total tasks</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{overview.taskTotal}</p>
            <p className="text-xs text-muted-foreground">
              {overview.taskTotal
                ? Math.round((overview.taskDone / overview.taskTotal) * 100)
                : 0}% done
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Files</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{files.length}</p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(files.reduce((acc, f) => acc + (f.size_bytes ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {overview.phases.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Phase progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {overview.phases.map((phase) => (
                <li key={phase.id} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{phase.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{phase.progress}%</span>
                  <Progress value={phase.progress} className="h-1.5 w-24" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent files</CardTitle>
            <Link href={`/files?project=${id}`}>
              <span className="text-xs text-muted-foreground hover:underline flex items-center gap-1">All <ArrowUpRight className="size-3" /></span>
            </Link>
          </CardHeader>
          <CardContent>
            {files.length === 0 ? (
              <EmptyState title="No files yet" description="Upload files to this project to see them here." />
            ) : (
              <ul>
                {files.map((file) => (
                  <li key={file.id} className="flex items-center gap-2 border-b border-border/50 py-2 last:border-0">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate text-sm">{file.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatFileSize(file.size_bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Recent activity</CardTitle>
            <Link href={`/projects/${id}/activity`}>
              <span className="text-xs text-muted-foreground hover:underline flex items-center gap-1">All <ArrowUpRight className="size-3" /></span>
            </Link>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <EmptyState title="No activity yet" description="Actions you take will appear here." />
            ) : (
              <ul>
                {activity.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-2 text-sm last:border-0">
                    <span className="min-w-0 truncate text-muted-foreground">{item.summary}</span>
                    <span className="shrink-0 text-xs text-muted-foreground/70">{formatDate(item.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}