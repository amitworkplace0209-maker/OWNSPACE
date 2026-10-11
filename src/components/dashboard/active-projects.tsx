import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { ToneBadge } from "@/components/dashboard/tone";
import { HEALTH_LABEL, HEALTH_TONE, countdownLabel } from "@/lib/dashboard-logic";
import {
  getProjectHealthSummaries,
  getProjectSummary,
  type ProjectHealthSummary,
} from "@/lib/dal/projects";

function projectDot(color: string | null): string {
  return color ?? "var(--primary)";
}

/**
 * Active projects with a health state derived by `computeProjectHealth` —
 * overdue work, a stale update or a blocked phase each move the chip, and the
 * rules are documented there rather than here.
 */
export function ActiveProjects({
  projects,
  activeCount,
}: {
  projects: ProjectHealthSummary[];
  activeCount: number;
}) {
  return (
    <SectionShell
      title="Active projects"
      icon={FolderKanban}
      description={
        activeCount > 0
          ? `${activeCount} active · showing ${projects.length}`
          : "Nothing in flight"
      }
      action="All projects"
      actionHref="/projects"
      interactive
    >
      {activeCount === 0 || projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No active projects"
          description="Create your first project."
          className="py-8"
          action={
            <Button render={<Link href="/projects?new=1" />}>
              <Plus /> New project
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => {
            const tone = HEALTH_TONE[project.health];
            const totalTasks = project.openTasks + project.completedTasks;

            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className="group block rounded-xl border p-3 transition hover:border-primary/30 hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: projectDot(project.color) }}
                      />
                      <span className="truncate text-sm font-medium group-hover:underline">
                        {project.name}
                      </span>
                    </span>
                    <ToneBadge tone={tone} dot className="shrink-0">
                      {HEALTH_LABEL[project.health]}
                    </ToneBadge>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="truncate text-xs text-muted-foreground">
                      {project.currentPhase ?? "No phase yet"}
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular-nums">
                      {project.progress}%
                    </span>
                  </div>

                  <Progress
                    value={project.progress}
                    aria-label={`${project.name} progress`}
                    className="mt-1.5 gap-0"
                  />

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {project.completedTasks}/{totalTasks} tasks
                    </span>
                    <span
                      className={cn(
                        "tabular-nums",
                        project.daysLeft !== null && project.daysLeft < 0
                          ? "text-danger"
                          : project.daysLeft !== null && project.daysLeft <= 2
                            ? "text-warning"
                            : undefined
                      )}
                    >
                      {countdownLabel(project.daysLeft)}
                    </span>
                    {project.overdueTasks > 0 ? (
                      <span className="font-medium text-danger">
                        {project.overdueTasks} overdue
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}

/** Fetches active projects with their derived health state and renders them. */
export async function ActiveProjectsSection({ limit = 4 }: { limit?: number }) {
  const [projects, summary] = await Promise.all([
    getProjectHealthSummaries(limit),
    getProjectSummary(),
  ]);
  return <ActiveProjects projects={projects} activeCount={summary.active} />;
}
