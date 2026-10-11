"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FolderTree,
  Layers,
  Link2,
  Paperclip,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar } from "@/components/shared/workspace-toolbar";
import { AddResourceDialog, KIND_ICONS } from "@/components/resources/add-resource-dialog";
import { deleteResourceAction, getResourceUrlAction } from "@/lib/actions/resources";
import { formatFileSize } from "@/lib/format";
import {
  activeFilterCount,
  EMPTY_RESOURCE_FILTERS,
  filterResources,
  formatBytesShort,
  groupResources,
  kindLabel,
  sourceLabel,
  sortResources,
  summariseResources,
  type ResourceFilterState,
  type ResourceGrouping,
  type ResourceItem,
  type ResourceSort,
} from "@/lib/resources-logic";
import { cn } from "cn";
import type { GDriveConnection } from "@/types";

const GROUPINGS: Array<{ value: ResourceGrouping; label: string }> = [
  { value: "none", label: "None" },
  { value: "project", label: "Project" },
  { value: "source", label: "Source" },
  { value: "kind", label: "Type" },
];

const SORTS: Array<{ value: ResourceSort; label: string }> = [
  { value: "recent", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "name", label: "Name" },
  { value: "size", label: "Size" },
];

const SOURCE_TONE: Record<ResourceItem["source"], string> = {
  supabase: "bg-info/10 text-info border-info/30",
  drive: "bg-warning/10 text-warning border-warning/30",
  link: "bg-primary/10 text-primary border-primary/30",
};

/**
 * Resources â€” every attachment in one place.
 *
 * Supabase objects, Google Drive references and plain links are listed
 * together because from the user's side they are all "the things I attached",
 * but they are never *merged*: each card keeps the source it came from, and
 * that is what a delete routes on. Sizes are reported per source rather than
 * as one total, since a Drive byte and a Storage byte share no quota.
 */
export function ResourcesWorkspace({
  resources,
  projects,
  tasks,
  driveAccounts,
}: {
  resources: ResourceItem[];
  projects: Array<{ id: string; name: string; color: string | null }>;
  tasks: Array<{ id: string; title: string; project_id: string | null }>;
  driveAccounts: GDriveConnection[];
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = React.useState<ResourceFilterState>(EMPTY_RESOURCE_FILTERS);
  const [groupBy, setGroupBy] = React.useState<ResourceGrouping>("none");
  const [sort, setSort] = React.useState<ResourceSort>("recent");
  const [addOpen, setAddOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ResourceItem | null>(null);

  const summary = React.useMemo(() => summariseResources(resources), [resources]);

  const visible = React.useMemo(
    () => sortResources(filterResources(resources, filters), sort),
    [filters, resources, sort]
  );

  const groups = React.useMemo(
    () => groupResources(visible, groupBy),
    [groupBy, visible]
  );

  const activeDriveCount = driveAccounts.filter(
    (account) => account.status === "active"
  ).length;

  const statItems: StatStripItem[] = [
    {
      id: "total",
      label: "Resources",
      value: summary.total,
      icon: Paperclip,
      tone: "neutral",
      hint: `${summary.projectCount} project${summary.projectCount === 1 ? "" : "s"} covered`,
    },
    {
      id: "supabase",
      label: "Stored files",
      value: summary.bySource.supabase,
      icon: Database,
      tone: "info",
      hint: formatBytesShort(summary.bytesBySource.supabase),
    },
    {
      id: "drive",
      label: "Drive files",
      value: summary.bySource.drive,
      icon: Cloud,
      tone: summary.bySource.drive > 0 ? "success" : "neutral",
      hint: `${activeDriveCount} account${activeDriveCount === 1 ? "" : "s"} connected`,
    },
    {
      id: "links",
      label: "Links",
      value: summary.bySource.link,
      icon: Link2,
      tone: "warning",
      hint: `${summary.unattached} not on a project`,
    },
    {
      id: "tasks",
      label: "On tasks",
      value: summary.linkedToTask,
      icon: Layers,
      tone: "neutral",
      hint: `${summary.linkedToNote} on notes`,
    },
  ];

  function toggleSource(source: ResourceItem["source"]) {
    setFilters((current) => ({
      ...current,
      sources: current.sources.includes(source)
        ? current.sources.filter((entry) => entry !== source)
        : [...current.sources, source],
    }));
  }

  function toggleKind(kind: ResourceItem["kind"]) {
    setFilters((current) => ({
      ...current,
      kinds: current.kinds.includes(kind)
        ? current.kinds.filter((entry) => entry !== kind)
        : [...current.kinds, kind],
    }));
  }

  function setProject(value: string) {
    setFilters((current) => ({ ...current, projectId: value || null }));
    router.push(value ? `${pathname}?project=${value}` : pathname);
  }

  async function open(item: ResourceItem) {
    const result = await getResourceUrlAction({
      source: item.source,
      id: item.id,
      kind: item.kind,
    });
    if (result.error || !result.url) {
      toast.error(result.error ?? "Could not open this resource.");
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  const filterCount = activeFilterCount(filters);

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} />

      <StorageSplit summary={summary} />

      <WorkspaceToolbar
        filters={[
          {
            param: "source",
            label: "Source",
            value: filters.sources.length === 1 ? filters.sources[0] : "",
            options: [
              { value: "", label: "Everywhere" },
              { value: "supabase", label: "App storage", count: summary.bySource.supabase },
              { value: "drive", label: "Google Drive", count: summary.bySource.drive },
              { value: "link", label: "Links", count: summary.bySource.link },
            ],
            showValue: true,
          },
          ...(projects.length > 0
            ? [
                {
                  param: "project",
                  label: "Project",
                  value: filters.projectId ?? "",
                  options: [
                    { value: "", label: "All projects" },
                    ...projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    })),
                  ],
                },
              ]
            : []),
        ]}
        onFilterChange={(param, value) => {
          if (param === "source") {
            setFilters((current) => ({ ...current, sources: value ? [value as ResourceItem["source"]] : [] }));
          } else if (param === "project") {
            setProject(value);
          }
        }}
        search={{
          value: filters.query,
          onChange: (value) => setFilters((current) => ({ ...current, query: value })),
          placeholder: "Search names, projects, tasks, tagsâ€¦",
          label: "Search resources",
        }}
        grouping={{ value: groupBy, onChange: (value) => setGroupBy(value as ResourceGrouping), options: GROUPINGS }}
        actions={
          <>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ResourceSort)}
              aria-label="Sort resources"
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring dark:bg-input/30"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button onClick={() => setAddOpen(true)}>
              <Plus /> Add resource
            </Button>
          </>
        }
      />

      <FilterChips
        filters={filters}
        summary={summary}
        onToggleSource={toggleSource}
        onToggleKind={toggleKind}
        onClear={() => setFilters(EMPTY_RESOURCE_FILTERS)}
      />

      {filterCount > 0 && filterCount !== activeFilterCount(EMPTY_RESOURCE_FILTERS) ? (
        <p className="text-xs text-muted-foreground">
          {visible.length} of {resources.length} resources shown.
        </p>
      ) : null}

      {resources.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No resources yet"
          description="Upload a file, link one from Google Drive, or save a URL. Attach anything to a project or a task."
          action={<Button onClick={() => setAddOpen(true)}><Plus /> Add your first resource</Button>}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching resources"
          description="Try a different search, or clear the filters."
          action={
            <Button variant="outline" onClick={() => setFilters(EMPTY_RESOURCE_FILTERS)}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.id} className="flex flex-col gap-2.5">
              {groupBy !== "none" ? (
                <header className="flex items-center gap-2 px-1">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group.label}
                  </h3>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                    {group.items.length}
                  </span>
                  <span className="h-px flex-1 bg-border/60" />
                </header>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item, index) => (
                  <ResourceCard
                    key={item.key}
                    item={item}
                    index={index}
                    onOpen={() => void open(item)}
                    onDelete={() => setDeleting(item)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AddResourceDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={projects}
        tasks={tasks}
        driveAccounts={driveAccounts}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description={
          deleting?.source === "drive"
            ? "This only unlinks the reference. The file stays in your Google Drive."
            : deleting?.source === "link"
              ? "The link is removed. Nothing outside this workspace is touched."
              : "The file and its stored copy are permanently removed."
        }
        confirmLabel="Delete resource"
        onConfirm={async () => {
          if (!deleting) return;
          const result = await deleteResourceAction({
            source: deleting.source,
            id: deleting.id,
          });
          setDeleting(null);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Resource deleted.");
          router.refresh();
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storage split â€” sizes are never summed across providers
// ---------------------------------------------------------------------------

function StorageSplit({ summary }: { summary: ReturnType<typeof summariseResources> }) {
  const rows = [
    {
      key: "supabase" as const,
      label: "App storage",
      count: summary.bySource.supabase,
      bytes: summary.bytesBySource.supabase,
      icon: Database,
      tone: "bg-info",
    },
    {
      key: "drive" as const,
      label: "Google Drive",
      count: summary.bySource.drive,
      bytes: summary.bytesBySource.drive,
      icon: Cloud,
      tone: "bg-warning",
    },
  ];

  const max = Math.max(rows[0].bytes, rows[1].bytes, 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => {
        const Icon = row.icon;
        return (
          <div
            key={row.key}
            className="flex flex-col gap-2 rounded-xl border bg-card p-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="size-4 text-muted-foreground" />
                {row.label}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatBytesShort(row.bytes)}
              </span>
            </div>
            <Progress
              value={Math.round((row.bytes / max) * 100)}
              className="h-1.5"
            />
            <p className="text-xs text-muted-foreground">
              {row.count} {row.count === 1 ? "resource" : "resources"}
              {row.key === "drive" ? " Â· quota is Google's to report" : ""}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

function FilterChips({
  filters,
  summary,
  onToggleSource,
  onToggleKind,
  onClear,
}: {
  filters: ResourceFilterState;
  summary: ReturnType<typeof summariseResources>;
  onToggleSource: (source: ResourceItem["source"]) => void;
  onToggleKind: (kind: ResourceItem["kind"]) => void;
  onClear: () => void;
}) {
  const kinds = Object.entries(summary.byKind).filter(([, count]) => count > 0);
  if (kinds.length === 0) return null;

  const sources: ResourceItem["source"][] = ["supabase", "drive", "link"];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sources
        .filter((source) => summary.bySource[source] > 0)
        .map((source) => (
          <button
            key={source}
            onClick={() => onToggleSource(source)}
            aria-pressed={filters.sources.includes(source)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition",
              filters.sources.includes(source)
                ? "border-primary bg-primary/10 text-primary"
                : "border-muted-foreground/25 text-muted-foreground hover:bg-accent"
            )}
          >
            {sourceLabel(source)} Â· {summary.bySource[source]}
          </button>
        ))}

      <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />

      {kinds.map(([kind, count]) => (
        <button
          key={kind}
          onClick={() => onToggleKind(kind as ResourceItem["kind"])}
          aria-pressed={filters.kinds.includes(kind as ResourceItem["kind"])}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs transition",
            filters.kinds.includes(kind as ResourceItem["kind"])
              ? "border-primary bg-primary/10 text-primary"
              : "border-muted-foreground/25 text-muted-foreground hover:bg-accent"
          )}
        >
          {kindLabel(kind as ResourceItem["kind"])} Â· {count}
        </button>
      ))}

      {activeFilterCount(filters) > 0 ? (
        <button
          onClick={onClear}
          className="rounded-full px-2 py-0.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource card
// ---------------------------------------------------------------------------

function ResourceCard({
  item,
  index,
  onOpen,
  onDelete,
}: {
  item: ResourceItem;
  index: number;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const Icon = KIND_ICONS[item.kind] ?? Paperclip;

  return (
    <article
      style={{ "--i": Math.min(index, 12) } as React.CSSProperties}
      className="row-stagger group relative flex flex-col gap-2.5 rounded-xl border bg-card p-3.5 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
    >
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary">
          <Icon className="size-4" />
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={cn("text-[10px]", SOURCE_TONE[item.source])}>
              {sourceLabel(item.source)}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{kindLabel(item.kind)}</span>
            {item.sizeBytes != null ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Â· {formatFileSize(item.sizeBytes)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Open ${item.name}`}
            onClick={onOpen}
          >
            <ExternalLink className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${item.name}`}
            onClick={onDelete}
            className="hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {item.description ? (
        <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
      ) : null}

      {/* Where it is attached. This is the row's whole point â€” a file with no
          context is indistinguishable from every other one. */}
      <div className="flex flex-col gap-1">
        {item.projectName ? (
          <Link
            href={`/projects/${item.projectId}`}
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: item.projectColor ?? "var(--primary)" }}
            />
            <span className="truncate">{item.projectName}</span>
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
            <FolderTree className="size-3" />
            Not on a project
          </span>
        )}

        {item.taskTitle ? (
          <Link
            href={`/tasks/${item.taskId}`}
            className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <CheckCircle2 className="size-3 shrink-0" />
            <span className="truncate">{item.taskTitle}</span>
          </Link>
        ) : null}

        {item.accountEmail ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Cloud className="size-3 shrink-0" />
            <span className="truncate">{item.accountEmail}</span>
          </span>
        ) : null}
      </div>

      {item.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}