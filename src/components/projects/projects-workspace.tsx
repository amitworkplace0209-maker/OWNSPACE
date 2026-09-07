"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition, useState } from "react";
import { Search, MoreHorizontal, Pencil, Trash2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectStatusBadge, PriorityBadge, projectStatusLabel } from "@/components/shared/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProjectAction, setProjectStatusAction } from "@/lib/actions/projects";
import { cn } from "cn";
import type { ProjectWithTags } from "@/lib/dal/projects";
import type { Project, ProjectStatus, Tag } from "@/types";

const statusTabs: Array<{ label: string; value: ProjectStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "On hold", value: "on_hold" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
];

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTags;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(async () => {
      await action();
    });
  }

  return (
    <Card className="group relative flex flex-col gap-3 p-4 transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: project.color ?? "var(--primary)" }}
          >
            {project.icon ?? project.name.slice(0, 2)}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <Link
              href={`/projects/${project.id}`}
              className="truncate text-sm font-medium hover:underline"
            >
              {project.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {project.due_date
                ? `Due ${new Date(project.due_date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                : "No due date"}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${project.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(project)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {project.status !== "active" ? (
              <DropdownMenuItem
                onClick={() => run(() => setProjectStatusAction(project.id, "active"))}
              >
                Mark active
              </DropdownMenuItem>
            ) : null}
            {project.status !== "on_hold" ? (
              <DropdownMenuItem
                onClick={() => run(() => setProjectStatusAction(project.id, "on_hold"))}
              >
                Put on hold
              </DropdownMenuItem>
            ) : null}
            {project.status !== "completed" ? (
              <DropdownMenuItem
                onClick={() => run(() => setProjectStatusAction(project.id, "completed"))}
              >
                Mark completed
              </DropdownMenuItem>
            ) : null}
            {project.status !== "archived" && project.status !== "completed" ? (
              <DropdownMenuItem
                onClick={() => run(() => setProjectStatusAction(project.id, "archived"))}
              >
                Archive
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onClick={() => onDelete(project)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      {project.tag_names.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {project.tag_names.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="tabular-nums">{project.progress}%</span>
        </div>
        <Progress value={project.progress ?? 0} className="h-1.5" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <ProjectStatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
      </div>
    </Card>
  );
}

export function ProjectsWorkspace({
  projects,
  tags,
  initialStatus,
}: {
  projects: ProjectWithTags[];
  tags: Tag[];
  initialStatus: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  function setStatus(status: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") params.delete("status");
    else params.set("status", status);
    router.push(`${pathname}?${params.toString()}`);
  }

  const status: ProjectStatus | "all" =
    initialStatus === "all" || !(initialStatus in projectStatusLabel)
      ? "all"
      : (initialStatus as ProjectStatus);

  const filtered = projects.filter((p) => {
    if (status !== "all" && p.status !== status) return false;
    if (tagId && !p.tag_ids.includes(tagId)) return false;
    if (query.trim() && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition",
                status === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter projects…"
            className="h-8 pl-7"
            aria-label="Filter projects"
          />
        </div>

        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <FolderPlus /> New project
        </Button>
      </div>

      {tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTagId(null)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition",
              tagId === null
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted-foreground/30 text-muted-foreground hover:bg-accent"
            )}
          >
            All tags
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setTagId(tag.id === tagId ? null : tag.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition",
                tagId === tag.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted-foreground/30 text-muted-foreground hover:bg-accent"
              )}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: tag.color ?? "var(--muted-foreground)" }} />
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title={projects.length === 0 ? "No projects yet" : "No matching projects"}
          description={
            projects.length === 0
              ? "Create your first project to start organizing your work."
              : "Try changing the filters above."
          }
          action={
            projects.length === 0 ? (
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <FolderPlus /> Create a project
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(p) => { setEditing(p); setDialogOpen(true); }}
              onDelete={(p) => setDeleting(p)}
            />
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        project={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="This permanently deletes the project and everything inside it — tasks, notes, files, phases and milestones."
        confirmLabel="Delete project"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteProjectAction(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}