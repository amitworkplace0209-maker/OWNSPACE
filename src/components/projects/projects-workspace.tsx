"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useTransition, useState } from "react";
import {
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  LayoutGrid,
  List,
  CalendarClock,
  ArrowUpDown,
  X,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ProjectFormDialog } from "@/components/projects/project-form-dialog";
import { ProjectWizard } from "@/components/project-creator/project-wizard";
import type { WizardFile } from "@/components/project-creator/wizard-step-finance";
import { projectStatusLabel, priorityLabel } from "@/components/shared/badges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteProjectAction, setProjectStatusAction } from "@/lib/actions/projects";
import { cn } from "cn";
import { daysUntil } from "@/lib/dashboard-logic";
import type { ProjectWithTags } from "@/lib/dal/projects";
import type { Priority, Project, ProjectStatus, Tag } from "@/types";
import { ProjectIcon as ProjectGlyph } from "@/components/project-creator/icon-picker";

const statusTabs: Array<{ label: string; value: ProjectStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "On hold", value: "on_hold" },
  { label: "Completed", value: "completed" },
  { label: "Archived", value: "archived" },
];

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "due", label: "Due date" },
  { value: "priority", label: "Priority" },
];

type SortKey = "recent" | "name" | "due" | "priority";

const priorityRank: Record<string, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

/** Status reads as a dot + word, which is quieter than a filled badge at card size. */
const statusDot: Record<ProjectStatus, string> = {
  active: "bg-success",
  on_hold: "bg-warning",
  completed: "bg-info",
  archived: "bg-muted-foreground/60",
};

const priorityDot: Record<Priority, string> = {
  none: "bg-muted-foreground/40",
  low: "bg-sky-500",
  medium: "bg-warning",
  high: "bg-orange-500",
  urgent: "bg-danger",
};

/** The project colour, falling back to the theme accent so nothing renders blank. */
function accentOf(project: { color: string | null }): string {
  return project.color ?? "var(--primary)";
}

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
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${project.name}`}
            className="-mt-0.5 text-muted-foreground data-[popup-open]:bg-accent"
          >
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

/** Gradient tile so a project reads as its own colour even before the name. */
function ProjectIcon({ project, size = "md" }: { project: ProjectWithTags; size?: "md" | "sm" }) {
  const accent = accentOf(project);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl font-semibold text-white shadow-sm transition-transform duration-200 group-hover/card:scale-[1.03]",
        size === "md" ? "size-10 text-base" : "size-9 text-sm"
      )}
      style={{
        backgroundImage: `linear-gradient(140deg, ${accent}, color-mix(in oklab, ${accent} 72%, #000))`,
      }}
    >
      {/* The tile is this file's; the glyph inside it is the shared one, so a
          project card and a project detail page never disagree about what its
          icon looks like. Falls back to the initial, so never blank. */}
      <ProjectGlyph
        name={project.icon}
        fallbackName={project.name}
        className={size === "md" ? "size-5" : "size-4"}
      />
    </span>
  );
}

/** Countdown phrasing, so every surface says "3d overdue" the same way. */
function dueDays(project: ProjectWithTags): number | null {
  const days = daysUntil(project.due_date);
  if (days === null) return null;
  return days;
}

function DueLabel({ project }: { project: ProjectWithTags }) {
  const days = dueDays(project);

  if (days === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/80">
        <CalendarClock className="size-3" />
        No due date
      </span>
    );
  }

  const overdue = days < 0;
  const soon = days >= 0 && days <= 3;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs whitespace-nowrap",
        overdue
          ? "font-medium text-danger"
          : soon
            ? "font-medium text-warning"
            : "text-muted-foreground"
      )}
      title={`Due ${new Date(project.due_date!).toLocaleDateString(undefined, {
        dateStyle: "medium",
      })}`}
    >
      <CalendarClock className="size-3" />
      {overdue
        ? `${Math.abs(days)}d overdue`
        : days === 0
          ? "Due today"
          : days === 1
            ? "1 day left"
            : `${days} days left`}
    </span>
  );
}

function StatusChip({ status }: { status: ProjectStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", statusDot[status])}
      />
      {projectStatusLabel[status]}
    </span>
  );
}

function PriorityChip({ priority }: { priority: Priority }) {
  if (priority === "none") return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", priorityDot[priority])}
      />
      {priorityLabel[priority]}
    </span>
  );
}

function ProgressBar({ project }: { project: ProjectWithTags }) {
  const value = Math.max(0, Math.min(100, project.progress ?? 0));
  const done = value >= 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Progress</span>
        <span className="font-medium tabular-nums">{value}%</span>
      </div>
      <Progress
        value={value}
        aria-label={`${project.name} progress`}
        className={cn(
          "gap-0 [&_[data-slot=progress-indicator]]:bg-(--accent)",
          done && "[&_[data-slot=progress-indicator]]:bg-success"
        )}
      />
    </div>
  );
}

function TagChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className="max-w-32 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {tag}
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground tabular-nums">
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

function ProjectCard({
  project,
  index,
  onEdit,
  onDelete,
}: {
  project: ProjectWithTags;
  index: number;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  const days = dueDays(project);

  return (
    <Card
      style={{ "--i": Math.min(index, 12), "--accent": accentOf(project) } as React.CSSProperties}
      className={cn(
        "row-stagger group/card relative gap-0 overflow-hidden p-0 transition-all duration-200",
        "hover:-translate-y-0.5 hover:border-(--accent)/40 hover:shadow-lg",
        "focus-within:border-(--accent)/40 focus-within:shadow-lg"
      )}
    >
      {/* Accent rail — the project's own colour, so the grid stays scannable. */}
      <span
        aria-hidden="true"
        className="block h-1 w-full"
        style={{
          backgroundImage: `linear-gradient(90deg, ${accentOf(project)}, color-mix(in oklab, ${accentOf(project)} 25%, transparent))`,
        }}
      />

      {/* Stretched link: the whole card is the hit target for the project. */}
      <Link
        href={`/projects/${project.id}`}
        className="absolute inset-0 z-0 rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="sr-only">Open {project.name}</span>
      </Link>

      <div className="pointer-events-none relative z-10 flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <ProjectIcon project={project} />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-sm font-medium group-hover/card:underline">
                {project.name}
              </span>
              <DueLabel project={project} />
            </div>
          </div>

          <div className="pointer-events-auto">
            <ProjectActions project={project} onEdit={onEdit} onDelete={onDelete} />
          </div>
        </div>

        {project.description ? (
          <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
            {project.description}
          </p>
        ) : (
          <p className="line-clamp-2 text-sm text-muted-foreground/50">
            No description yet
          </p>
        )}

        <TagChips names={project.tag_names} />
      </div>

      {/* Footer keeps the numbers on one baseline across every card in the grid. */}
      <div className="pointer-events-none relative z-10 flex flex-col gap-3 border-t bg-muted/30 px-4 py-3">
        <ProgressBar project={project} />

        <div className="flex items-center justify-between gap-2">
          <StatusChip status={project.status} />
          <div className="flex items-center gap-3">
            <PriorityChip priority={project.priority} />
            {days !== null && days < 0 ? (
              <span className="text-xs font-medium text-danger">Needs attention</span>
            ) : null}
          </div>
        </div>
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
    <li
      style={{ "--i": 0, "--accent": accentOf(project) } as React.CSSProperties}
      className="group/row relative"
    >
      <div className="relative flex items-center gap-3 border-b border-border/50 px-3 py-3 transition-colors last:border-0 hover:bg-accent/30">
        {/* Left rail echoes the card accent so switching views does not re-teach the colour. */}
        <span
          aria-hidden="true"
          className="absolute inset-y-2 left-0 w-0.5 rounded-full opacity-0 transition-opacity group-hover/row:opacity-100"
          style={{ backgroundColor: accentOf(project) }}
        />

        <Link
          href={`/projects/${project.id}`}
          className="absolute inset-0 z-0 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="sr-only">Open {project.name}</span>
        </Link>

        <div className="pointer-events-none relative z-10 shrink-0">
          <ProjectIcon project={project} size="sm" />
        </div>

        <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium group-hover/row:underline">
            {project.name}
          </span>
          <div className="flex items-center gap-3">
            <StatusChip status={project.status} />
            <DueLabel project={project} />
          </div>
        </div>

        {project.tag_names.length > 0 ? (
          <div className="pointer-events-none relative z-10 hidden max-w-48 shrink-0 lg:block">
            <TagChips names={project.tag_names} />
          </div>
        ) : null}

        <div className="pointer-events-none relative z-10 hidden w-32 shrink-0 flex-col gap-1.5 sm:flex">
          <Progress
            value={Math.max(0, Math.min(100, project.progress ?? 0))}
            aria-label={`${project.name} progress`}
            className="gap-0 [&_[data-slot=progress-indicator]]:bg-(--accent)"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium tabular-nums">{project.progress ?? 0}%</span>
          </div>
        </div>

        <div className="pointer-events-none relative z-10 hidden shrink-0 md:block">
          <PriorityChip priority={project.priority} />
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
  const [sort, setSort] = useState<SortKey>("recent");
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

  function clearFilters() {
    setQuery("");
    setTagId(null);
    if (status !== "all") setStatus("all");
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
    else if (sort === "due")
      list.sort((a, b) =>
        (a.due_date ?? "9999-99-99").localeCompare(b.due_date ?? "9999-99-99")
      );
    else if (sort === "priority")
      list.sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]);

    return list;
  }, [projects, status, tagId, query, sort]);

  const filtersActive =
    Boolean(query.trim()) || tagId !== null || status !== "all";

  // One line of real numbers in the header, so the page answers "how am I
  // doing" before the user reads a single card.
  const summary = useMemo(() => {
    if (projects.length === 0) return "Nothing here yet.";
    const active = counts.active ?? 0;
    const overdue = projects.filter((p) => {
      if (p.status === "completed" || p.status === "archived") return false;
      const days = daysUntil(p.due_date);
      return days !== null && days < 0;
    }).length;
    const average = Math.round(
      projects.reduce((sum, p) => sum + (p.progress ?? 0), 0) / projects.length
    );

    const parts = [
      `${projects.length} ${projects.length === 1 ? "project" : "projects"}`,
      `${active} active`,
      `${average}% average progress`,
    ];
    if (overdue > 0) parts.push(`${overdue} overdue`);
    return `${parts.join(" · ")}.`;
  }, [projects, counts]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projects"
        description={summary}
        actions={
          <Button onClick={() => setWizardOpen(true)}>
            <FolderPlus /> New project
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status is the primary axis, so it gets the full-width segmented row. */}
          <div
            role="group"
            aria-label="Filter by status"
            className="flex max-w-full flex-wrap items-center gap-0.5 overflow-x-auto rounded-lg bg-muted/50 p-0.5"
          >
            {statusTabs.map((tab) => {
              const active = status === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setStatus(tab.value)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition",
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-xs tabular-nums",
                      active
                        ? "bg-primary/12 text-primary"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {counts[tab.value] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-40 flex-1 sm:w-56 sm:flex-none">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter projects…"
                className="h-8 bg-muted/50 pl-8 pr-8"
                aria-label="Filter projects"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear filter"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted-foreground transition hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <Select value={sort} onValueChange={(v) => setSort((v ?? "recent") as SortKey)}>
              <SelectTrigger className="w-40" aria-label="Sort projects">
                <ArrowUpDown className="size-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div
              role="group"
              aria-label="View"
              className="flex items-center gap-0.5 rounded-lg border p-0.5"
            >
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
          </div>
        </div>

        {tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
            <Filter aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            <button
              onClick={() => setTagId(null)}
              aria-pressed={tagId === null}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs transition",
                tagId === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              All tags
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setTagId(tag.id === tagId ? null : tag.id)}
                aria-pressed={tag.id === tagId}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition",
                  tag.id === tagId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color ?? "var(--muted-foreground)" }}
                />
                {tag.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {filtered.length > 0 ? (
        <p className="text-xs text-muted-foreground tabular-nums">
          Showing {filtered.length} of {projects.length}
          {filtersActive ? " · filtered" : ""}
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title={projects.length === 0 ? "No projects yet" : "No matching projects"}
          description={
            projects.length === 0
              ? "Create your first project to start organizing your work."
              : "Try a different search, tag or status."
          }
          action={
            projects.length === 0 ? (
              <Button onClick={() => setWizardOpen(true)}>
                <FolderPlus /> Create a project
              </Button>
            ) : (
              <Button variant="outline" onClick={clearFilters}>
                <X /> Clear filters
              </Button>
            )
          }
        />
      ) : view === "grid" ? (
        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={index}
              onEdit={(p) => {
                setEditing(p);
                setEditOpen(true);
              }}
              onDelete={(p) => setDeleting(p)}
            />
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card">
          {filtered.map((project) => (
            <ProjectListRow
              key={project.id}
              project={project}
              onEdit={(p) => {
                setEditing(p);
                setEditOpen(true);
              }}
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
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
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