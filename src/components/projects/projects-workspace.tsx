"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useTransition, useState } from "react";
import { Search, MoreHorizontal, Pencil, Trash2, FolderPlus, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectWizard } from "@/components/project-creator/project-wizard";
import type { WizardFile } from "@/components/project-creator/wizard-step-finance";
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

const sortOptions: Array<{ value: "recent" | "name" | "due" | "priority"; label: string }> = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
];

const priorityRank: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

function ProjectActions({
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
  );
}

function ProjectIcon({ project }: { project: ProjectWithTags }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-medium text-white"
      style={{ backgroundColor: project.color ?? "var(--primary)" }}
    >
      {project.icon ?? project.name.slice(0, 2)}
    </span>
  );
}

function DueLabel({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-xs text-muted-foreground">No due date</span>;
  const overdue = dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
      {overdue ? "Overdue " : "Due "}
      {new Date(dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
    </span>
  );
}

function ProjectCard({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTags;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <Card className="group/card relative flex flex-col gap-3 p-4 transition hover:border-primary/40 hover:shadow-md">
      {/* Stretched link: the whole card is the hit target for the project. */}
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="sr-only">Open {project.name}</span>
      </Link>

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProjectIcon project={project} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium group-hover/card:underline">
              {project.name}
            </span>
            <DueLabel dueDate={project.due_date} />
          </div>
        </div>

        <div className="pointer-events-auto">
          <ProjectActions project={project} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>

      {project.description ? (
        <p className="pointer-events-none relative z-10 line-clamp-2 text-sm text-muted-foreground">
          {project.description}
        </p>
      ) : null}

      {project.tag_names.length > 0 ? (
        <div className="pointer-events-none relative z-10 flex flex-wrap gap-1">
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

      <div className="pointer-events-none relative z-10 mt-auto flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="tabular-nums">{project.progress ?? 0}%</span>
        </div>
        <Progress value={project.progress ?? 0} className="h-1.5" />
      </div>

      <div className="pointer-events-none relative z-10 flex flex-wrap items-center gap-1.5 pt-1">
        <ProjectStatusBadge status={project.status} />
        <PriorityBadge priority={project.priority} />
      </div>
    </Card>
  );
}

function ProjectListRow({
  project,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTags;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <li className="group/row relative">
      <div className="flex items-center gap-3 border-b border-border/50 px-1 py-2.5 transition-colors last:border-0 group-hover/row:bg-accent/30">
        <Link
          href={`/projects/${project.id}`}
          className="absolute inset-0 z-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="sr-only">Open {project.name}</span>
        </Link>

        <div className="pointer-events-none relative z-10 shrink-0">
          <ProjectIcon project={project} />
        </div>
        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium group-hover/row:underline">
            {project.name}
          </span>
          {project.description ? (
            <p className="truncate text-xs text-muted-foreground">{project.description}</p>
          ) : null}
        </div>

        {project.tag_names.length > 0 ? (
          <span className="pointer-events-none relative z-10 hidden max-w-40 truncate text-xs text-muted-foreground md:block">
            {project.tag_names.join(" · ")}
          </span>
        ) : null}

        <div className="pointer-events-none relative z-10 hidden w-28 shrink-0 flex-col gap-1 sm:flex">
          <Progress value={project.progress ?? 0} className="h-1.5" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="tabular-nums">{project.progress ?? 0}%</span>
          </div>
        </div>

        <div className="pointer-events-none relative z-10 flex shrink-0 flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <ProjectStatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
          </div>
          <DueLabel dueDate={project.due_date} />
        </div>

        <div className="pointer-events-auto relative z-10 shrink-0">
          <ProjectActions project={project} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    </li>
  );
}

export function ProjectsWorkspace({
  projects,
  tags,
  files,
  initialStatus,
  openWizard = false,
}: {
  projects: ProjectWithTags[];
  tags: Tag[];
  files: WizardFile[];
  initialStatus: string;
  /** Opens the 12-step wizard straight away (the ?new=1 shortcut). */
  openWizard?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [tagId, setTagId] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [sort, setSort] = useState<"recent" | "name" | "due" | "priority">("recent");
  const [wizardOpen, setWizardOpen] = useState(openWizard);
  const [editing, setEditing] = useState<Project | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<Project | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:projects:view");
    if (saved === "list" || saved === "grid") {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  function changeView(next: "grid" | "list") {
    setView(next);
    window.localStorage.setItem("ownspece:projects:view", next);
  }

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

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: projects.length };
    for (const p of projects) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [projects]);

  const filtered = useMemo(() => {
    const list = projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (tagId && !p.tag_ids.includes(tagId)) return false;
      if (query.trim() && !p.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
      return true;
    });

    if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "due") list.sort((a, b) => (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99"));
    else if (sort === "priority") list.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);

    return list;
  }, [projects, status, tagId, query, sort]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatus(tab.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition",
                status === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  status === tab.value
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts[tab.value] ?? 0}
              </span>
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

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
          aria-label="Sort projects"
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Grid view"
            aria-pressed={view === "grid"}
            className={cn(view === "grid" && "bg-accent text-foreground")}
            onClick={() => changeView("grid")}
          >
            <LayoutGrid className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="List view"
            aria-pressed={view === "list"}
            className={cn(view === "list" && "bg-accent text-foreground")}
            onClick={() => changeView("list")}
          >
            <List className="size-4" />
          </Button>
        </div>

        <Button onClick={() => setWizardOpen(true)}>
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
              <Button onClick={() => setWizardOpen(true)}>
                <FolderPlus /> Create a project
              </Button>
            ) : undefined
          }
        />
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(p) => { setEditing(p); setEditOpen(true); }}
              onDelete={(p) => setDeleting(p)}
            />
          ))}
        </div>
      ) : (
        <ul className="rounded-xl border bg-card px-3">
          {filtered.map((project) => (
            <ProjectListRow
              key={project.id}
              project={project}
              onEdit={(p) => { setEditing(p); setEditOpen(true); }}
              onDelete={(p) => setDeleting(p)}
            />
          ))}
        </ul>
      )}

      <ProjectWizard open={wizardOpen} onOpenChange={setWizardOpen} files={files} />

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
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