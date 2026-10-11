"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  FolderOpen,
  NotebookPen,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar, VIEW_ICONS } from "@/components/shared/workspace-toolbar";
import { ColorSelector } from "@/components/project-creator/color-selector";
import {
  bulkDeleteNotesAction,
  bulkMoveNotesAction,
  bulkSetNotesFavoritedAction,
  bulkSetNotesPinnedAction,
  createNoteAction,
  deleteNoteAction,
  toggleNoteFavoriteAction,
  toggleNotePinAction,
  updateNoteAction,
  type NoteFormState,
} from "@/lib/actions/notes";
import {
  UPDATED_BUCKET_LABEL,
  applyNoteFilters,
  allTags,
  excerpt,
  groupNotes,
  noteSize,
  sortNotes,
  tagHue,
  type NoteGrouping,
  type NoteListItem,
  type NoteStats,
} from "@/lib/note-logic";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import type { Project } from "@/types";

const GROUPINGS = [
  { value: "", label: "None" },
  { value: "project", label: "Project" },
  { value: "tag", label: "Tag" },
  { value: "updated", label: "Last edited" },
];

type ViewMode = "grid" | "list";

/**
 * Notes.
 *
 * Project notes and personal notes live in one grid, because that is how they
 * are actually used — a personal note is just one with no project on it.
 *
 * The previous version hand-rolled its own filter bar instead of the shared
 * `WorkspaceToolbar`, capped the list at 200 rows and then filtered purely on
 * the client, so anything past 200 silently vanished from the results.
 */
export function NotesWorkspace({
  notes,
  stats,
  projects,
  tags,
  nodes,
  initialProjectId = "",
  initialTag = "",
  initialQuery = "",
  readOnly = false,
}: {
  notes: NoteListItem[];
  stats: NoteStats;
  projects: Project[];
  tags: Array<{ id: string; name: string; color: string | null }>;
  nodes: Array<{ id: string; title: string; project_id: string | null }>;
  initialProjectId?: string;
  initialTag?: string;
  initialQuery?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [query, setQuery] = React.useState(initialQuery);
  const [groupBy, setGroupBy] = React.useState<NoteGrouping | "">("");
  const [view, setView] = React.useState<ViewMode>("grid");
  const [sort, setSort] = React.useState<"updated" | "created" | "title">("updated");
  const [pinnedOnly, setPinnedOnly] = React.useState(false);
  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<NoteListItem | null>(null);
  const [deleting, setDeleting] = React.useState<NoteListItem | null>(null);
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [pending, startTransition] = useTransition();

  // View preference survives a navigation; read through a rAF rather than
  // setting state straight in the effect body.
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:notes:view");
    if (saved === "grid" || saved === "list") {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  React.useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    router.replace(`${pathname}?${params.toString()}`);
    const id = window.requestAnimationFrame(() => {
      setEditing(null);
      setFormOpen(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchParams, pathname, router]);

  function changeView(next: string) {
    setView(next as ViewMode);
    window.localStorage.setItem("ownspece:notes:view", next);
  }

  function setFilter(param: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all") params.delete(param);
    else params.set(param, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  const filtered = React.useMemo(() => {
    const matched = applyNoteFilters(notes, {
      query,
      projectId: initialProjectId,
      scope: "all",
      pinned: pinnedOnly,
      favorited: favoritesOnly,
      tag: initialTag,
    });
    return sortNotes(matched, sort);
  }, [notes, query, initialProjectId, pinnedOnly, favoritesOnly, initialTag, sort]);

  // Derived selection: anything no longer visible is simply absent, so a bulk
  // action can never target a card that is off screen.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(filtered.map((note) => note.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, filtered]);

  const groups = React.useMemo(() => groupNotes(filtered, groupBy || "none"), [filtered, groupBy]);
  const tagOptions = React.useMemo(() => allTags(notes), [notes]);

  const statItems: StatStripItem[] = [
    {
      id: "all",
      label: "Total notes",
      value: stats.total,
      icon: NotebookPen,
      tone: "neutral",
      hint: `${stats.personal} personal`,
    },
    {
      id: "pinned",
      label: "Pinned",
      value: stats.pinned,
      icon: Pin,
      tone: "info",
      hint: `${stats.favorited} starred`,
    },
    {
      id: "recent",
      label: "Edited this week",
      value: stats.recent,
      icon: Star,
      tone: "warning",
      hint: `${stats.tags} tags in use`,
    },
    {
      id: "empty",
      label: "Empty",
      value: stats.empty,
      icon: NotebookPen,
      tone: stats.empty > 0 ? "warning" : "success",
      hint: stats.empty > 0 ? "Titles with no body" : "All have content",
    },
    {
      id: "curated",
      label: "Curated",
      value: stats.curatedRate,
      icon: Star,
      tone: "success",
      hint: "% pinned or starred",
    },
  ];

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(label: string, action: () => Promise<{ error?: string; affected?: number }>) {
    const ids = [...effectiveSelected];
    if (ids.length === 0) return;

    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const count = result.affected ?? 0;
      toast.success(`${label} ${count} note${count === 1 ? "" : "s"}.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  /** Silent for the per-card toggles — a toast on every pin would be noise. */
  function toggle(id: string, action: () => Promise<{ error?: string }>, fallback: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error ?? fallback);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} activeId={pinnedOnly ? "pinned" : favoritesOnly ? "pinned" : "all"} />

      <WorkspaceToolbar
        filters={[
          {
            param: "project",
            label: "Project",
            value: initialProjectId,
            options: [
              { value: "", label: "All + personal" },
              { value: "personal", label: "Personal only" },
              ...projects.map((project) => ({
                value: project.id,
                label: project.name,
                count: stats.byProject[project.id] ?? 0,
              })),
            ],
          },
          ...(tags.length > 0
            ? [
                {
                  param: "tag",
                  label: "Tag",
                  value: initialTag,
                  options: [
                    { value: "", label: "Any tag" },
                    ...tags.map((tag) => ({
                      value: tag.name,
                      label: tag.name,
                      count: tagOptions.find((entry) => entry.tag === tag.name)?.count ?? 0,
                    })),
                  ],
                },
              ]
            : []),
        ]}
        onFilterChange={setFilter}
        search={{
          value: query,
          onChange: setQuery,
          placeholder: "Search titles, content, tags…",
          label: "Search notes",
        }}
        grouping={{
          value: groupBy,
          onChange: (value) => setGroupBy(value as NoteGrouping | ""),
          options: GROUPINGS,
        }}
        view={{
          value: view,
          onChange: changeView,
          options: [
            { value: "grid", label: "Cards", icon: VIEW_ICONS.grid },
            { value: "list", label: "List", icon: VIEW_ICONS.list },
          ],
        }}
        actions={
          !readOnly ? (
            <>
              <QuickToggles
                pinnedOnly={pinnedOnly}
                favoritesOnly={favoritesOnly}
                onTogglePinned={() => setPinnedOnly((value) => !value)}
                onToggleFavorites={() => setFavoritesOnly((value) => !value)}
                pinnedCount={stats.pinned}
                favoriteCount={stats.favorited}
              />
              <SortSelect value={sort} onChange={setSort} />
              <Button onClick={openCreate}>
                <Plus /> New note
              </Button>
            </>
          ) : null
        }
      />

      {effectiveSelected.size > 0 && !readOnly ? (
        <BulkBar
          count={effectiveSelected.size}
          pending={pending}
          projects={projects}
          onPin={() => run("Pinned", () => bulkSetNotesPinnedAction([...effectiveSelected], true))}
          onUnpin={() => run("Unpinned", () => bulkSetNotesPinnedAction([...effectiveSelected], false))}
          onStar={() => run("Starred", () => bulkSetNotesFavoritedAction([...effectiveSelected], true))}
          onUnstar={() => run("Unstarred", () => bulkSetNotesFavoritedAction([...effectiveSelected], false))}
          onMove={(projectId) => run("Moved", () => bulkMoveNotesAction([...effectiveSelected], projectId))}
          onDelete={() => setBulkDeleting(true)}
          onClear={() => setSelected(new Set())}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={notes.length === 0 ? NotebookPen : Search}
          title={notes.length === 0 ? "No notes yet" : "No matching notes"}
          description={
            notes.length === 0
              ? "Jot something down, or file a note under a project."
              : "Try clearing a filter or searching for something else."
          }
          action={
            notes.length === 0 ? (
              readOnly ? undefined : (
                <Button onClick={openCreate}>
                  <Plus /> Create a note
                </Button>
              )
            ) : (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setPinnedOnly(false);
                  setFavoritesOnly(false);
                  router.push(pathname);
                }}
              >
                Clear filters
              </Button>
            )
          }
        />
      ) : view === "list" ? (
        <ListView
          groups={groups}
          selected={effectiveSelected}
          readOnly={readOnly}
          onToggleSelected={toggleSelected}
          onEdit={(note) => {
            setEditing(note);
            setFormOpen(true);
          }}
          onDelete={(note) => setDeleting(note)}
          onTogglePin={readOnly ? undefined : (note) => toggle(note.id, () => toggleNotePinAction(note.id), "Could not pin the note.")}
          onToggleStar={readOnly ? undefined : (note) => toggle(note.id, () => toggleNoteFavoriteAction(note.id), "Could not star the note.")}
        />
      ) : (
        <GridView
          groups={groups}
          selected={effectiveSelected}
          readOnly={readOnly}
          groupBy={groupBy}
          onToggleSelected={toggleSelected}
          onEdit={(note) => {
            setEditing(note);
            setFormOpen(true);
          }}
          onDelete={(note) => setDeleting(note)}
          onTogglePin={readOnly ? undefined : (note) => toggle(note.id, () => toggleNotePinAction(note.id), "Could not pin the note.")}
          onToggleStar={readOnly ? undefined : (note) => toggle(note.id, () => toggleNoteFavoriteAction(note.id), "Could not star the note.")}
        />
      )}

      <NoteFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        projects={projects}
        nodes={nodes}
        note={editing}
        defaultProjectId={initialProjectId && initialProjectId !== "personal" ? initialProjectId : ""}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="This permanently deletes the note and its version history."
        confirmLabel="Delete note"
        onConfirm={async () => {
          if (!deleting) return;
          startTransition(async () => {
            const result = await deleteNoteAction(deleting.id);
            setDeleting(null);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Note deleted.");
            router.refresh();
          });
        }}
      />

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Delete ${effectiveSelected.size} note${effectiveSelected.size === 1 ? "" : "s"}?`}
        description="This permanently deletes the selected notes and their version history."
        confirmLabel="Delete notes"
        onConfirm={async () => {
          const ids = [...effectiveSelected];
          setBulkDeleting(false);
          startTransition(async () => {
            const result = await bulkDeleteNotesAction(ids);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success(`Deleted ${result.affected ?? 0} notes.`);
            setSelected(new Set());
            router.refresh();
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar extras
// ---------------------------------------------------------------------------

function QuickToggles({
  pinnedOnly,
  favoritesOnly,
  onTogglePinned,
  onToggleFavorites,
  pinnedCount,
  favoriteCount,
}: {
  pinnedOnly: boolean;
  favoritesOnly: boolean;
  onTogglePinned: () => void;
  onToggleFavorites: () => void;
  pinnedCount: number;
  favoriteCount: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onTogglePinned}
        aria-pressed={pinnedOnly}
        className={cn(
          "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
          pinnedOnly
            ? "border-primary/40 bg-primary/5 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        {pinnedOnly ? <PinOff className="size-3" /> : <Pin className="size-3" />}
        <span className="tabular-nums">{pinnedCount}</span>
      </button>

      <button
        type="button"
        onClick={onToggleFavorites}
        aria-pressed={favoritesOnly}
        className={cn(
          "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition",
          favoritesOnly
            ? "border-warning/40 bg-warning/5 text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        <Star className={cn("size-3", favoritesOnly && "fill-warning text-warning")} />
        <span className="tabular-nums">{favoriteCount}</span>
      </button>
    </div>
  );
}

function SortSelect({
  value,
  onChange,
}: {
  value: "updated" | "created" | "title";
  onChange: (value: "updated" | "created" | "title") => void;
}) {
  return (
    <select
      aria-label="Sort notes"
      value={value}
      onChange={(event) => onChange(event.target.value as "updated" | "created" | "title")}
      className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none dark:bg-input/30"
    >
      <option value="updated">Last edited</option>
      <option value="created">Created</option>
      <option value="title">Title</option>
    </select>
  );
}

function BulkBar({
  count,
  pending,
  projects,
  onPin,
  onUnpin,
  onStar,
  onUnstar,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  pending: boolean;
  projects: Project[];
  onPin: () => void;
  onUnpin: () => void;
  onStar: () => void;
  onUnstar: () => void;
  onMove: (projectId: string | null) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
      <span className="flex items-center gap-2 px-1 text-sm font-medium">{count} selected</span>

      <div className="h-4 w-px bg-border" />

      <Button size="sm" variant="outline" onClick={onPin} disabled={pending}>
        <Pin /> Pin
      </Button>
      <Button size="sm" variant="outline" onClick={onUnpin} disabled={pending}>
        <PinOff /> Unpin
      </Button>
      <Button size="sm" variant="outline" onClick={onStar} disabled={pending}>
        <Star /> Star
      </Button>
      <Button size="sm" variant="outline" onClick={onUnstar} disabled={pending}>
        Unstar
      </Button>

      <select
        aria-label="Move to project"
        disabled={pending}
        defaultValue=""
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          onMove(value === "personal" ? null : value);
          event.target.value = "";
        }}
        className="h-7 rounded-md border border-input bg-transparent px-2 text-xs outline-none dark:bg-input/30"
      >
        <option value="">Move to…</option>
        <option value="personal">Personal (no project)</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X /> Clear
        </Button>
        <Button variant="destructive" size="sm" onClick={onDelete} disabled={pending}>
          <Trash2 /> Delete
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function GroupHeading({ id, label, count }: { id: string; label: string; count: number }) {
  return (
    <header className="flex items-center gap-2 px-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {id === "all" || UPDATED_BUCKET_LABEL[id] ? (UPDATED_BUCKET_LABEL[id] ?? label) : label}
      </h3>
      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
        {count}
      </span>
    </header>
  );
}

function TagChips({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => (
        <span
          key={tag}
          className="rounded-md px-1.5 py-0.5 text-[11px]"
          style={{
            backgroundColor: `hsl(${tagHue(tag)} 70% 50% / 0.15)`,
            color: `hsl(${tagHue(tag)} 70% 40%)`,
          }}
        >
          {tag}
        </span>
      ))}
      {tags.length > max ? (
        <span className="text-[11px] text-muted-foreground">+{tags.length - max}</span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid view
// ---------------------------------------------------------------------------

function GridView({
  groups,
  selected,
  readOnly,
  groupBy,
  onToggleSelected,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleStar,
}: {
  groups: ReturnType<typeof groupNotes>;
  selected: Set<string>;
  readOnly: boolean;
  groupBy: NoteGrouping | "";
  onToggleSelected: (id: string) => void;
  onEdit: (note: NoteListItem) => void;
  onDelete: (note: NoteListItem) => void;
  onTogglePin?: (note: NoteListItem) => void;
  onToggleStar?: (note: NoteListItem) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          {groupBy ? <GroupHeading id={group.id} label={group.label} count={group.items.length} /> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                checked={selected.has(note.id)}
                readOnly={readOnly}
                onToggleSelected={() => onToggleSelected(note.id)}
                onEdit={() => onEdit(note)}
                onDelete={() => onDelete(note)}
                onTogglePin={onTogglePin ? () => onTogglePin(note) : undefined}
                onToggleStar={onToggleStar ? () => onToggleStar(note) : undefined}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NoteCard({
  note,
  checked,
  readOnly,
  onToggleSelected,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleStar,
}: {
  note: NoteListItem;
  checked: boolean;
  readOnly: boolean;
  onToggleSelected: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin?: () => void;
  onToggleStar?: () => void;
}) {
  const preview = excerpt(note.content, 160);
  const size = noteSize(note.content);

  return (
    <article
      className={cn(
        "group relative flex flex-col gap-2 rounded-xl border bg-card p-3.5 transition hover:border-primary/40 hover:shadow-md",
        note.is_pinned && "border-primary/40"
      )}
    >
      {note.color ? (
        <span
          aria-hidden="true"
          className="absolute inset-x-3.5 top-0 h-0.5 rounded-b-full"
          style={{ backgroundColor: note.color }}
        />
      ) : null}

      <div className="flex items-start gap-2">
        {!readOnly ? (
          <Checkbox
            checked={checked}
            onCheckedChange={onToggleSelected}
            aria-label={`Select ${note.title}`}
            className="mt-0.5 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
          />
        ) : null}

        <Link
          href={`/notes/${note.id}`}
          className="line-clamp-2 flex-1 text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {note.title}
        </Link>

        <div className="flex shrink-0 items-center gap-0.5">
          {onTogglePin ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={note.is_pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
              onClick={onTogglePin}
            >
              <Pin
                className={cn(
                  "size-3.5",
                  note.is_pinned ? "fill-primary text-primary" : "opacity-0 group-hover:opacity-70"
                )}
              />
            </Button>
          ) : null}
          {onToggleStar ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={note.is_favorited ? `Unstar ${note.title}` : `Star ${note.title}`}
              onClick={onToggleStar}
            >
              <Star
                className={cn(
                  "size-3.5",
                  note.is_favorited
                    ? "fill-warning text-warning"
                    : "opacity-0 group-hover:opacity-70"
                )}
              />
            </Button>
          ) : null}
          {!readOnly ? (
            <>
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${note.title}`} onClick={onEdit}>
                <Pencil className="size-3.5 opacity-0 transition group-hover:opacity-70" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete ${note.title}`}
                onClick={onDelete}
              >
                <Trash2 className="size-3.5 opacity-0 transition group-hover:opacity-70" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {preview ? (
        <p className="line-clamp-3 text-xs text-muted-foreground">{preview}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Empty note</p>
      )}

      <TagChips tags={note.tag_names} />

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {note.project_id ? (
            <>
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ backgroundColor: note.project_color ?? "var(--primary)" }}
              />
              {note.project_name}
            </>
          ) : (
            <>
              <User className="size-3" />
              Personal
            </>
          )}
        </span>

        {note.node_name ? (
          <span className="flex items-center gap-1">
            <FolderOpen className="size-3" />
            {note.node_name}
          </span>
        ) : null}

        <span className="ml-auto">{formatRelativeTime(note.updated_at)}</span>
      </div>

      {size.words > 150 ? (
        <span className="text-[10px] text-muted-foreground">
          {size.words} words · {size.readingMinutes} min read
        </span>
      ) : null}
    </article>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function ListView({
  groups,
  selected,
  readOnly,
  onToggleSelected,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleStar,
}: {
  groups: ReturnType<typeof groupNotes>;
  selected: Set<string>;
  readOnly: boolean;
  onToggleSelected: (id: string) => void;
  onEdit: (note: NoteListItem) => void;
  onDelete: (note: NoteListItem) => void;
  onTogglePin?: (note: NoteListItem) => void;
  onToggleStar?: (note: NoteListItem) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-2">
          {group.id !== "all" ? (
            <GroupHeading id={group.id} label={group.label} count={group.items.length} />
          ) : null}

          <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
            {group.items.map((note) => (
              <li
                key={note.id}
                className="group flex items-start gap-3 border-b border-border/50 p-3 transition last:border-0 hover:bg-accent/30"
              >
                {!readOnly ? (
                  <Checkbox
                    checked={selected.has(note.id)}
                    onCheckedChange={() => onToggleSelected(note.id)}
                    aria-label={`Select ${note.title}`}
                    className="mt-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
                  />
                ) : null}

                <span
                  aria-hidden="true"
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      note.color ?? note.project_color ?? "var(--muted-foreground)",
                  }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link
                      href={`/notes/${note.id}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {note.title}
                    </Link>
                    {note.is_pinned ? <Pin className="size-3 fill-primary text-primary" /> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {note.project_id ? `${note.project_name} · ` : "Personal · "}
                    {formatRelativeTime(note.updated_at)}
                  </p>
                  <div className="mt-1">
                    <TagChips tags={note.tag_names} max={4} />
                  </div>
                </div>

                {!readOnly ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {onTogglePin ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={note.is_pinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
                        onClick={() => onTogglePin(note)}
                      >
                        <Pin className={cn("size-3.5", note.is_pinned && "fill-primary text-primary")} />
                      </Button>
                    ) : null}
                    {onToggleStar ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={note.is_favorited ? `Unstar ${note.title}` : `Star ${note.title}`}
                        onClick={() => onToggleStar(note)}
                      >
                        <Star className={cn("size-3.5", note.is_favorited && "fill-warning text-warning")} />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${note.title}`}
                      onClick={() => onEdit(note)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${note.title}`}
                      onClick={() => onDelete(note)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function NoteFormDialog({
  open,
  onOpenChange,
  projects,
  nodes,
  note,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  nodes: Array<{ id: string; title: string; project_id: string | null }>;
  note: NoteListItem | null;
  defaultProjectId: string;
}) {
  const router = useRouter();
  const action = note ? updateNoteAction.bind(null, note.id) : createNoteAction;
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(action, {
    error: undefined,
  });

  const [projectId, setProjectId] = React.useState(note?.project_id ?? defaultProjectId);
  const [color, setColor] = React.useState(note?.color ?? "");

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  // Sections belong to the project they were created in, so the list follows
  // whichever project is chosen above it.
  const scopedNodes = projectId ? nodes.filter((node) => node.project_id === projectId) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{note ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>
            Personal notes stay out of every project; file one under a project to see it there too.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="note-title" error={state.error}>
            <Input
              id="note-title"
              name="title"
              defaultValue={note?.title ?? ""}
              placeholder="e.g. Sprint retro notes"
              required
              autoFocus
            />
          </FormField>

          <FormField label="Content">
            <Textarea
              name="content"
              defaultValue={note?.content ?? ""}
              rows={8}
              placeholder="Write anything · Markdown works."
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Project">
              <select
                name="project_id"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                <option value="">Personal — no project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Section"
              hint={projectId ? undefined : "Pick a project first."}
            >
              <select
                name="node_id"
                defaultValue={note?.node_id ?? ""}
                disabled={!projectId}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:opacity-50 dark:bg-input/30"
              >
                <option value="">No section</option>
                {scopedNodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {/* A colour you pick, rather than a hex field nobody can recall. */}
          <ColorSelector value={color} onChange={setColor} label="Colour" />
          <input type="hidden" name="color" value={color} />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_pinned"
                checked={note?.is_pinned ?? false}
                className="accent-primary"
              />
              Pin to the top
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="is_favorited"
                checked={note?.is_favorited ?? false}
                className="accent-primary"
              />
              Star
            </label>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : note ? "Save changes" : "Create note"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
