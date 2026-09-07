"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, Pin, Star, Save, History, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VersionHistoryDialog } from "@/components/shared/version-history-dialog";
import { updateNoteAction, deleteNoteAction, toggleNotePinAction, toggleNoteFavoriteAction, setNoteTagsAction, restoreNoteVersionAction } from "@/lib/actions/notes";
import { formatDateTime } from "@/lib/format";
import { cn } from "cn";
import type { NoteWithTagNames } from "@/lib/dal/notes";
import type { NoteVersion, Project, Tag } from "@/types";

export function NoteDetailView({
  note,
  projects,
  tags,
  versions = [],
}: {
  note: NoteWithTagNames;
  projects: Project[];
  tags: Tag[];
  versions?: NoteVersion[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(
    note.tag_names
      .map((name) => tags.find((t) => t.name === name)?.id)
      .filter((id): id is string => Boolean(id))
  );

  function toggleTag(tagId: string, checked: boolean) {
    const next = checked
      ? [...new Set([...selectedTagIds, tagId])]
      : selectedTagIds.filter((id) => id !== tagId);
    setSelectedTagIds(next);
    void setNoteTagsAction({ noteId: note.id, tagIds: next }).then(() => router.refresh());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    setError("");
    try {
      const res = await updateNoteAction(note.id, { error: undefined, data: undefined }, fd);
      if (res.error) setError(res.error);
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <>
      <article className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{note.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">Updated {formatDateTime(note.updated_at)}</p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button onClick={() => void toggleNotePinAction(note.id).then(() => router.refresh())} aria-label="Toggle pin" className={cn("rounded-md p-2 transition hover:bg-accent", note.is_pinned ? "text-amber-500" : "text-muted-foreground")}>
              <Pin className="size-4" />
            </button>
            <button onClick={() => void toggleNoteFavoriteAction(note.id).then(() => router.refresh())} aria-label="Toggle favorite" className={cn("rounded-md p-2 transition hover:bg-accent", note.is_favorited ? "text-yellow-500" : "text-muted-foreground")}>
              <Star className="size-4" />
            </button>
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} aria-label="View version history">
              <History /> History
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil /> Edit</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Delete note" onClick={() => setDeleteOpen(true)}><Trash2 className="size-4" /></Button>
          </div>
        </div>

        {note.project_name ? <p className="text-sm text-muted-foreground">Project: {note.project_name}</p> : null}

        <div className="border-t pt-4">
          {note.content.trim() ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{note.content}</div>
          ) : (
            <p className="text-sm text-muted-foreground">This note has no content yet.</p>
          )}
</div>
      </article>

      <VersionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        versions={versions}
        title="Note version history"
        onRestore={(versionId) => restoreNoteVersionAction(note.id, versionId).then(() => router.refresh())}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this note?"
        description={note.title}
        confirmLabel="Delete note"
        onConfirm={async () => {
          await deleteNoteAction(note.id);
          router.push("/notes");
          router.refresh();
        }}
      />
    </>
  );
}

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <FormField label="Title" htmlFor="note-edit-title" error={error}>
        <Input id="note-edit-title" name="title" defaultValue={note.title} required />
      </FormField>
      <FormField label="Content" htmlFor="note-edit-content">
        <Textarea id="note-edit-content" name="content" defaultValue={note.content} rows={14} />
      </FormField>
      <FormField label="Project">
        <select name="project_id" defaultValue={note.project_id ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
          <option value="">No project</option>
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
        </select>
      </FormField>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
        <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><TagIcon className="size-3.5" /> Tags</p>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags available.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label key={t.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedTagIds.includes(t.id)}
                  onChange={(e) => toggleTag(t.id, e.target.checked)}
                  className="accent-primary"
                />
                <span style={{ color: t.color ?? undefined }}>{t.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        <Button type="submit" disabled={saving}><Save /> {saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}