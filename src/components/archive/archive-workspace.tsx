"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { ArchiveRestore, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { setProjectStatusAction, deleteProjectAction } from "@/lib/actions/projects";
import { formatDate } from "@/lib/format";
import type { Project } from "@/types";
import { useState } from "react";
import { ProjectIcon } from "@/components/project-creator/icon-picker";

export function ArchiveWorkspace({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function restore(project: Project) {
    setError(null);
    startTransition(async () => {
      const res = await setProjectStatusAction(project.id, "active");
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  function permanentDelete(project: Project) {
    setError(null);
    setDeleting(project);
  }

  return (
    <div className="flex flex-col gap-4">
      {projects.length === 0 ? (
        <EmptyState
          title="Nothing archived"
          description="Projects you archive from the Projects page will appear here so you can restore them."
          action={
            <Button render={<Link href="/projects" />}>
              Go to projects <ArrowUpRight className="size-4" />
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: project.color ?? "var(--primary)" }}
                  >
                    <ProjectIcon
                      name={project.icon}
                      fallbackName={project.name}
                      className="text-sm"
                    />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <Link
                      href={`/projects/${project.id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {project.name}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      Archived on {formatDate(project.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
              {project.description ? (
                <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => restore(project)} disabled={pending}>
                  <ArchiveRestore /> Restore
                </Button>
                <Button variant="destructive" size="sm" onClick={() => permanentDelete(project)} disabled={pending}>
                  <Trash2 /> Delete forever
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Permanently delete "${deleting?.name ?? ""}"?`}
        description="This removes the project and everything inside it — tasks, notes, files, phases, milestones and activity. This cannot be undone."
        confirmLabel="Delete forever"
        onConfirm={async () => {
          if (!deleting) return;
          setError(null);
          startTransition(async () => {
            const res = await deleteProjectAction(deleting.id);
            if (res.error) { setError(res.error); return; }
            setDeleting(null);
            router.refresh();
          });
        }}
      />
    </div>
  );
}