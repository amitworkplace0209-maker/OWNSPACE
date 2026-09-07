"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useActionState, useEffect } from "react";
import { Plus, Pencil, Trash2, Pin, Star, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createNoteAction, updateNoteAction, deleteNoteAction, toggleNotePinAction, toggleNoteFavoriteAction } from "@/lib/actions/notes";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import type { NoteWithTagNames } from "@/lib/dal/notes";
import type { Note, Project } from "@/types";

type NoteFormState = { error?: string; data?: { id: string } };

export function NotesWorkspace({
  notes,
  projects,
}: {
  notes: NoteWithTagNames[];
  projects: Project[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("project") ?? "";

  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);

  function setProjectFilter(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (!id) params.delete("project");
    else params.set("project", id);
    router.push(`${pathname}?${params.toString()}`);
  }

  const filtered = notes.filter((n) => {
    if (projectId && n.project_id !== projectId) return false;
    if (query.trim() && !n.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return a.updated_at < b.updated_at ? 1 : -1;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label="Filter by project"
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter notes…" className="h-8 pl-7" aria-label="Filter notes" />
        </div>
        <Button onClick={() => { setEditing(null); setNewOpen(true); }}><Plus /> New note</Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No notes yet"
          description="Capture ideas and keep them across your projects."
          action={<Button onClick={() => { setEditing(null); setNewOpen(true); }}><Plus /> Create a note</Button>}
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="No matching notes" description="Try changing the filters above." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((note) => (
            <article key={note.id} className="group relative flex flex-col gap-2 rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/notes/${note.id}`} className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold hover:underline">{note.title}</h3>
                </Link>
                <div className="flex shrink-0 gap-0.5">
                  <button onClick={() => void toggleNotePinAction(note.id).then(() => router.refresh())} aria-label="Toggle pin" className={cn("text-muted-foreground transition hover:text-amber-500", note.is_pinned && "text-amber-500")}>
                    <Pin className="size-3.5" />
                  </button>
                  <button onClick={() => void toggleNoteFavoriteAction(note.id).then(() => router.refresh())} aria-label="Toggle favorite" className={cn("text-muted-foreground transition hover:text-yellow-500", note.is_favorited && "text-yellow-500")}>
                    <Star className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {note.content.trim() || "No content yet."}
              </p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                <span>{note.project_name ?? "No project"}</span>
                <time dateTime={note.updated_at}>{formatRelativeTime(note.updated_at)}</time>
              </div>
              <div className="absolute right-2 top-9 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                <button onClick={() => { setEditing(note); }} aria-label={`Edit ${note.title}`} className="rounded-md p-1 hover:bg-accent">
                  <Pencil className="size-3.5" />
                </button>
                <button onClick={() => setDeleting(note)} aria-label={`Delete ${note.title}`} className="rounded-md p-1 hover:bg-accent">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <NoteFormDialog open={newOpen} onOpenChange={setNewOpen} projects={projects} note={editing} defaultProjectId={projectId || undefined} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => { if (!open) setDeleting(null); }}
        title={`Delete "${deleting?.title ?? ""}"?`}
        description="This permanently removes the note."
        confirmLabel="Delete note"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteNoteAction(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function NoteFormDialog({
  open,
  onOpenChange,
  projects,
  note,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  note: Note | null;
  defaultProjectId?: string;
}) {
  const router = useRouter();
  const action = note ? updateNoteAction.bind(null, note.id) : createNoteAction;
  const [state, formAction, pending] = useActionState<NoteFormState, FormData>(action, { error: undefined });

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{note ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>Capture a thought, an idea, or project detail.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4">
          <FormField label="Title" htmlFor="note-title" error={state.error}>
            <Input id="note-title" name="title" defaultValue={note?.title ?? ""} placeholder="Note title" required />
          </FormField>
          <FormField label="Content" htmlFor="note-content">
            <Textarea id="note-content" name="content" defaultValue={note?.content ?? ""} rows={8} placeholder="Write your note…" />
          </FormField>
          <FormField label="Project">
            <select name="project_id" defaultValue={note?.project_id ?? defaultProjectId ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
              <option value="">No project</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
            </select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : note ? "Save changes" : "Create note"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}