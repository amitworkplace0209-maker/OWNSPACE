"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Pencil, Trash2, Eye, BookOpen, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { VersionHistoryDialog } from "@/components/shared/version-history-dialog";
import { createWikiPageAction, updateWikiPageAction, deleteWikiPageAction, restoreWikiPageVersionAction } from "@/lib/actions/wiki";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import ReactMarkdown from "react-markdown";
import type { WikiPage, WikiVersion } from "@/types";

type WikiFormState = { error?: string; data?: { id: string; slug: string } };

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function ProjectWiki({ projectId, pages, readOnly = false, versionsByPage = {} }: { projectId: string; pages: WikiPage[]; readOnly?: boolean; versionsByPage?: Record<string, WikiVersion[]> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const params = useSearchParams();
  useEffect(() => {
    const slug = new URLSearchParams(params.toString()).get("page");
    const id = pages.find((p) => p.slug === slug)?.id ?? pages[0]?.id ?? null;
    window.requestAnimationFrame(() => setSelectedId(id));
  }, [pages, params]);
  const selected = pages.find((p) => p.id === selectedId) ?? null;
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSlug, setDraftSlug] = useState("");
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (creating) {
    return (
      <CreateForm
        projectId={projectId}
        initialTitle={draftTitle}
        initialSlug={draftSlug}
        onCancel={() => { setCreating(false); setDraftTitle(""); setDraftSlug(""); }}
        onDone={(id) => {
          setCreating(false);
          setDraftTitle("");
          setDraftSlug("");
          setSelectedId(id);
          setEditing(false);
          router.refresh();
        }}
      />
    );
  }

  if (!selected) {
    return (
      <div className="py-8">
        {readOnly ? (
          <EmptyState icon={BookOpen} title="No wiki pages" description="This project has no wiki pages." />
        ) : (
          <EmptyState
            icon={BookOpen}
            title="No wiki pages"
            description="Create a wiki to document this project."
            action={
              <Button onClick={() => { setDraftTitle(""); setDraftSlug(""); setCreating(true); }}>
                <Plus /> New page
              </Button>
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4 py-4 lg:grid-cols-[240px_1fr]">
      <aside className="flex flex-col gap-2 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pages</span>
          {!readOnly ? (
            <Button variant="ghost" size="icon-sm" aria-label="New page" onClick={() => { setDraftTitle(""); setDraftSlug(""); setCreating(true); }}>
              <Plus className="size-4" />
            </Button>
          ) : null}
        </div>
        <ul className="flex flex-col gap-0.5">
          {pages.map((p) => (
            <li key={p.id}>
               <button
                 onClick={() => { router.replace(`?page=${p.slug}`); setEditing(false); }}
                 className={cn(
                   "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                   p.id === selectedId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                 )}
               >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <article className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        {editing ? (
          <EditForm
            page={selected}
            onCancel={() => setEditing(false)}
            onDone={() => { setEditing(false); router.refresh(); }}
          />
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold tracking-tight">{selected.title}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">/{selected.slug}</span>
                </div>
                {selected.updated_at ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">Updated {formatRelativeTime(selected.updated_at)}</p>
                ) : null}
              </div>
              {!readOnly ? (
                <div className="flex shrink-0 gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                    <Pencil /> Edit
                  </Button>
                  <Button variant="outline" size="sm" aria-label="View version history" onClick={() => setHistoryOpen(true)}>
                    <History /> History
                  </Button>
                  <DeleteButton pageId={selected.id} title={selected.title} onDone={() => { setSelectedId(null); router.refresh(); }} />
                </div>
              ) : null}
            </div>
            <div className="max-w-none border-t pt-4 text-sm leading-relaxed text-foreground [&_h1]:text-xl [&_h2]:text-lg [&_h3]:text-base [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:rounded [&_table]:border [&_table]:border-border [&_th]:border-border [&_td]:border-border">
              {selected.content?.trim() ? (
                <ReactMarkdown>{selected.content}</ReactMarkdown>
              ) : (
                <p className="text-muted-foreground">This page has no content yet.</p>
              )}
            </div>
          </>
        )}
      </article>
      <VersionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        versions={versionsByPage[selected.id] ?? []}
        title="Page version history"
        onRestore={(versionId) => restoreWikiPageVersionAction(selected.id, versionId).then(() => router.refresh())}
      />
    </div>
  );
}

function CreateForm({
  projectId,
  initialTitle,
  initialSlug,
  onCancel,
  onDone,
}: {
  projectId: string;
  initialTitle: string;
  initialSlug: string;
  onCancel: () => void;
  onDone: (id: string) => void;
}) {
  const [state, formAction, pending] = useActionState<WikiFormState, FormData>(createWikiPageAction, {});
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);

  useEffect(() => {
    if (state.data) onDone(state.data.id);
  }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="slug" value={slug || slugify(title)} />
      <div className="flex flex-col gap-1">
        <label htmlFor="wiki-new-title" className="text-sm font-medium">Title</label>
        <Input
          id="wiki-new-title"
          name="title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); if (!initialSlug) setSlug(slugify(e.target.value)); }}
          placeholder="Page title"
          autoFocus
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="wiki-new-content" className="text-sm font-medium">Content</label>
        <Textarea id="wiki-new-content" name="content" rows={12} placeholder="Write the page…" />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create page"}</Button>
      </div>
    </form>
  );
}

function EditForm({
  page,
  onCancel,
  onDone,
}: {
  page: WikiPage;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<WikiFormState, FormData>(
    updateWikiPageAction.bind(null, page.id),
    {}
  );
  const [title, setTitle] = useState(page.title);
  const [slug, setSlug] = useState(page.slug);

  useEffect(() => {
    if (state.data) onDone();
  }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <div className="flex flex-col gap-1">
          <label htmlFor="wiki-edit-title" className="text-sm font-medium">Title</label>
          <Input id="wiki-edit-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="wiki-edit-slug" className="text-sm font-medium">Slug</label>
          <Input id="wiki-edit-slug" name="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="wiki-edit-content" className="text-sm font-medium">Content</label>
        <Textarea
          id="wiki-edit-content"
          name="content"
          rows={14}
          defaultValue={page.content}
          placeholder="Write the page…"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          <Eye /> Cancel
        </Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}

function DeleteButton({ pageId, title, onDone }: { pageId: string; title: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${title}`} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete "${title}"?`}
        description="This permanently removes the wiki page and its history."
        confirmLabel="Delete page"
        onConfirm={async () => {
          await deleteWikiPageAction(pageId);
          setOpen(false);
          onDone();
        }}
      />
    </>
  );
}