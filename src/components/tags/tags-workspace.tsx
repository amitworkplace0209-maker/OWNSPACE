"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Tag as TagIcon, Plus, Pencil, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createTagAction, updateTagAction, deleteTagAction } from "@/lib/actions/tags";
import { formatRelativeTime } from "@/lib/format";
import type { Tag } from "@/types";

type TagWithUsage = Tag & { usage: number };

type TagFormState = { error?: string; data?: { id: string } };

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

export function TagsWorkspace({ tags }: { tags: TagWithUsage[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);

  function done() {
    setCreating(false);
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {!creating ? (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New tag
          </Button>
        ) : (
          <CreateTagForm onDone={done} onCancel={() => setCreating(false)} />
        )}
      </div>

      {tags.length === 0 ? (
        <EmptyState title="No tags yet" description="Create tags to organize projects, tasks, notes and wiki pages." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((tag) =>
            editingId === tag.id ? (
              <li key={tag.id}>
                <EditTagForm tag={tag} onDone={done} onCancel={() => setEditingId(null)} />
              </li>
            ) : (
              <li
                key={tag.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${tag.color ?? "#6b7280"}22`, color: tag.color ?? "#6b7280" }}
                    >
                      <TagIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium" style={{ color: tag.color ?? undefined }}>
                        {tag.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tag.usage} item{tag.usage === 1 ? "" : "s"} · created {formatRelativeTime(tag.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${tag.name}`} onClick={() => setEditingId(tag.id)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${tag.name}`} onClick={() => setDeleting(tag)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {tag.usage > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Used on {tag.usage} project{tag.usage === 1 ? "" : "s"}, task{tag.usage === 1 ? "" : "s"} or notes.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">Not used yet.</p>
                )}
              </li>
            )
          )}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The tag is removed everywhere it was used. Projects, tasks, notes and wiki pages themselves are not deleted."
        confirmLabel="Delete tag"
        onConfirm={async () => {
          if (!deleting) return;
          await deleteTagAction(deleting.id);
          setDeleting(null);
          router.refresh();
        }}
      />
    </div>
  );
}

function CreateTagForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<TagFormState, FormData>(createTagAction, {});
  const [color, setColor] = useState(PRESET_COLORS[5]);

  useEffect(() => {
    if (state.data) onDone();
  }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:min-w-[320px]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">New tag</p>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>
      <FormField label="Name" error={state.error}>
        <Input name="name" placeholder="e.g. Design" required autoFocus maxLength={60} />
      </FormField>
      <ColorPicker value={color} onChange={setColor} />
      <input type="hidden" name="color" value={color} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          <Plus /> {pending ? "Creating…" : "Create tag"}
        </Button>
      </div>
    </form>
  );
}

function EditTagForm({ tag, onDone, onCancel }: { tag: Tag; onDone: () => void; onCancel: () => void }) {
  const [state, formAction, pending] = useActionState<TagFormState, FormData>(
    updateTagAction.bind(null, tag.id),
    {}
  );
  const [color, setColor] = useState(tag.color ?? PRESET_COLORS[5]);

  useEffect(() => {
    if (state.data) onDone();
  }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Edit tag</p>
        <Button variant="ghost" size="icon-sm" aria-label="Cancel" onClick={onCancel}>
          <X className="size-4" />
        </Button>
      </div>
      <FormField label="Name" error={state.error}>
        <Input name="name" defaultValue={tag.name} required autoFocus maxLength={60} />
      </FormField>
      <ColorPicker value={color} onChange={setColor} />
      <input type="hidden" name="color" value={color} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          <Check /> {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (/^#[0-9a-fA-F]{0,6}$/.test(next) || next === "") {
      onChange(next);
    }
  }
  return (
    <FormField label="Color">
      <div className="flex items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use color ${color}`}
              onClick={() => onChange(color)}
              className="size-6 rounded-full border-2 transition"
              style={{
                backgroundColor: color,
                borderColor: value === color ? "var(--foreground)" : "transparent",
              }}
            />
          ))}
        </div>
        <Input
          type="text"
          value={value}
          onChange={handleChange}
          className="h-8 w-28 font-mono text-xs"
          maxLength={7}
        />
      </div>
    </FormField>
  );
}