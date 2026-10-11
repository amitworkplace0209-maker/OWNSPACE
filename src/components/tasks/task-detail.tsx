"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { MessageSquare, ListChecks, GitBranch, Tag as TagIcon, Plus, Trash2, Pencil, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskStatusBadge, PriorityBadge } from "@/components/shared/badges";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { FileManager } from "@/components/files/file-manager";
import { addCommentAction, deleteCommentAction } from "@/lib/actions/comments";
import {
  addChecklistAction,
  addChecklistItemAction,
  toggleChecklistItemAction,
  deleteChecklistAction,
  deleteChecklistItemAction,
} from "@/lib/actions/checklists";
import {
  addTaskDependencyAction,
  removeTaskDependencyAction,
  setTaskStatusAction,
  setTaskProgressAction,
  setTaskPriorityAction,
  setTaskTagsAction,
} from "@/lib/actions/tasks";
import { formatDate, formatRelativeTime, formatDateTime } from "@/lib/format";
import { cn } from "cn";
import type { TaskDetail } from "@/lib/dal/tasks";
import type { ProjectPhase, Tag, TaskComment, Project, StoredFile } from "@/types";

type ActionLike = { error?: string; data?: unknown };

export function TaskDetailView({
  task,
  tags,
  allTasks,
  projects,
  phases,
  files = [],
  readOnly = false,
}: {
  task: TaskDetail;
  tags: Tag[];
  allTasks: { id: string; title: string; status: string }[];
  projects: Project[];
  phases: ProjectPhase[];
  files?: StoredFile[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Arriving with ?edit=1 (the dashboard's "Edit task" action) opens the dialog
  // from the very first render, so there is no flash of the read-only view.
  const [editOpen, setEditOpen] = useState(
    () => searchParams.get("edit") === "1"
  );
  const [commentDraft, setCommentDraft] = useState("");
  const [depSelect, setDepSelect] = useState("");

  const commentAction = addCommentAction.bind(null, task.id);
  const [commentState, commentFormAction, commentPending] = useActionState<ActionLike, FormData>(commentAction as never, {});

  const checklistAction = addChecklistAction.bind(null, task.id);
  const [checklistState, checklistFormAction] = useActionState<ActionLike, FormData>(checklistAction as never, {});

  useEffect(() => {
    if (stateHasResult(commentState) || stateHasResult(checklistState)) router.refresh();
  }, [commentState, checklistState, router]);

  // Clear ?edit=1 so a refresh or a back-navigation doesn't reopen the dialog.
  useEffect(() => {
    if (searchParams.get("edit") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("edit");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }, [searchParams, pathname, router]);

  const canDep = useMemo(() => {
    const exclude = new Set([task.id, ...task.dependencies.map((d) => d.id), ...task.dependents.map((d) => d.id)]);
    return allTasks.filter((t) => !exclude.has(t.id));
  }, [allTasks, task.id, task.dependencies, task.dependents]);

  const selectedTagIds = new Set(task.tag_names);

function toggleTag(tagId: string, checked: boolean) {
  const next = new Set(selectedTagIds);
  if (checked) next.add(tagId);
  else next.delete(tagId);
  void setTaskTagsAction({ taskId: task.id, tagIds: [...next] }).then(() => router.refresh());
}

async function setStatus(status: string) {
  const res = await setTaskStatusAction(task.id, status);
  if (!res.error) router.refresh();
}

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void setStatus(task.status === "done" ? "todo" : "done")}
            disabled={readOnly}
            aria-label={task.status === "done" ? "Mark as not done" : "Mark as done"}
            className="text-muted-foreground transition hover:text-primary disabled:opacity-60"
          >
            {task.status === "done" ? <CheckCircle2 className="size-6 text-emerald-500" /> : <Circle className="size-6" />}
          </button>
          <h1 className={cn("text-xl font-semibold tracking-tight", task.status === "done" && "text-muted-foreground line-through")}>
            {task.title}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <TaskStatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {task.project_name ? (
            <Link href={`/projects/${task.project_id}`} className="text-muted-foreground underline-offset-2 hover:underline">
              {task.project_name}
            </Link>
          ) : null}
          {task.due_date ? <span className="text-muted-foreground">· Due {formatDate(task.due_date)}</span> : null}
          <span className="text-muted-foreground">· Created {formatRelativeTime(task.created_at)}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={task.status}
            onChange={(e) => void setStatus(e.target.value)}
            disabled={readOnly}
            aria-label="Task status"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30 disabled:opacity-60"
          >
            {["backlog", "todo", "in_progress", "done", "cancelled"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
          <select
            value={task.priority}
            onChange={(e) => void setTaskPriorityAction(task.id, e.target.value).then(() => router.refresh())}
            disabled={readOnly}
            aria-label="Priority"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30 disabled:opacity-60"
          >
            {["none", "low", "medium", "high", "urgent"].map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            Progress
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={task.progress}
              disabled={readOnly}
              onChange={(e) => void setTaskProgressAction(task.id, Number(e.target.value))}
              className="w-32 accent-primary disabled:opacity-60"
            />
            <span className="tabular-nums">{task.progress}%</span>
          </label>
          {!readOnly ? (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil /> Edit
            </Button>
          ) : null}
        </div>
      </div>

      {task.description ? (
        <section className="rounded-xl border bg-card p-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{task.description}</p>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks /> Checklists
          </h2>

          {!readOnly ? (
            <>
              <form action={checklistFormAction} className="flex gap-2">
                <Input name="title" placeholder="New checklist title…" required />
                <Button type="submit" variant="outline" size="sm"><Plus /></Button>
              </form>
              {checklistState.error ? <p className="text-sm text-destructive">{checklistState.error}</p> : null}
            </>
          ) : null}

          {task.checklists.length === 0 ? (
            <p className="text-sm text-muted-foreground">No checklists yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {task.checklists.map((cl) => (
                <ChecklistBlock key={cl.id} cl={cl} readOnly={readOnly} onChanged={() => router.refresh()} />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MessageSquare /> Comments
          </h2>

          {!readOnly ? (
            <form action={commentFormAction} className="flex flex-col gap-2">
              <textarea
                name="body"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                rows={3}
                placeholder="Add a comment…"
                required
                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
              />
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={commentPending}>Comment</Button>
              </div>
            </form>
          ) : null}
          {commentState.error ? <p className="text-sm text-destructive">{commentState.error}</p> : null}

          {task.comments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {task.comments.map((c) => (
                <CommentRow key={c.id} comment={c} readOnly={readOnly} onChanged={() => router.refresh()} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <GitBranch /> Dependencies
          </h2>
          <p className="text-xs text-muted-foreground">{task.title} depends on these tasks.</p>

          {task.dependencies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dependencies.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {task.dependencies.map((d) => (
                <li key={d.id} className="group flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <Link href={`/tasks/${d.id}`} className="min-w-0 flex-1 truncate hover:underline">{d.title}</Link>
                  <TaskStatusBadge status={d.status} />
                  {!readOnly ? (
                    <Button variant="ghost" size="icon-sm" aria-label="Remove dependency" onClick={() => void removeTaskDependencyAction(task.id, d.id).then(() => router.refresh())}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          {!readOnly && canDep.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={depSelect}
                onChange={(e) => setDepSelect(e.target.value)}
                aria-label="Add dependency"
                className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30"
              >
                <option value="">Select a task…</option>
                {canDep.map((d) => (
                  <option key={d.id} value={d.id}>{d.title}</option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={!depSelect}
                onClick={async () => {
                  if (!depSelect) return;
                  const res = await addTaskDependencyAction(task.id, depSelect);
                  if (!res.error) {
                    setDepSelect("");
                    router.refresh();
                  } else {
                    alert(res.error);
                  }
                }}
              >
                Add
              </Button>
            </div>
          ) : null}

          {task.dependents.length > 0 ? (
            <>
              <p className="mt-2 text-xs font-medium text-muted-foreground">Blocked by this task:</p>
              <ul className="flex flex-col gap-1.5">
                {task.dependents.map((d) => (
                  <li key={d.id} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                    <Link href={`/tasks/${d.id}`} className="hover:underline">{d.title}</Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TagIcon /> Tags
          </h2>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tags.map((t) => (
                <label key={t.id} className={"flex cursor-pointer items-center gap-2 text-sm" + (readOnly ? " cursor-default" : "")}>
                  <input
                    type="checkbox"
                    checked={selectedTagIds.has(t.name)}
                    onChange={(e) => toggleTag(t.id, e.target.checked)}
                    disabled={readOnly}
                    className="accent-primary"
                  />
                  <span style={{ color: t.color ?? undefined }}>{t.name}</span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Attachments</h2>
        <FileManager projectId={task.project_id} taskId={task.id} files={files} readOnly={readOnly} />
      </section>

      {!readOnly ? (
        <TaskFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          projects={projects}
          phases={phases}
          task={task as never}
          defaultProjectId={task.project_id}
        />
      ) : null}
    </div>
  );
}

function stateHasResult(state: ActionLike): boolean {
  return Boolean(state && (state.data || state.error));
}

function ChecklistBlock({ cl, readOnly, onChanged }: {
  cl: TaskDetail["checklists"][number];
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [newItem, setNewItem] = useState("");

  async function submitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newItem.trim()) return;
    const fd = new FormData();
    fd.set("content", newItem);
    const res = await addChecklistItemAction(cl.id, {} as { error?: string }, fd);
    if (!res.error) {
      setNewItem("");
      onChanged();
    } else {
      alert(res.error);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-sm font-medium">{cl.title}</p>
        {!readOnly ? (
          <button
            onClick={() => void deleteChecklistAction(cl.id).then(onChanged)}
            aria-label={`Delete checklist ${cl.title}`}
            className="text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1">
        {cl.items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2">
            <button
              onClick={() => void toggleChecklistItemAction(item.id).then(onChanged)}
              disabled={readOnly}
              aria-label={item.is_completed ? "Mark incomplete" : "Mark complete"}
              className="text-muted-foreground disabled:opacity-60"
            >
              {item.is_completed ? <CheckCircle2 className="size-4 text-emerald-500" /> : <Circle className="size-4" />}
            </button>
            <span className={cn("flex-1 text-sm", item.is_completed && "text-muted-foreground line-through")}>
              {item.content}
            </span>
            {!readOnly ? (
              <button
                onClick={() => void deleteChecklistItemAction(item.id).then(onChanged)}
                aria-label={`Delete item ${item.content}`}
                className="opacity-0 text-muted-foreground transition group-hover:opacity-100 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <form onSubmit={submitItem} className="flex gap-2">
          <Input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add item…" className="h-7 text-xs" />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Add checklist item"><Plus className="size-3" /></Button>
        </form>
      ) : null}
    </li>
  );
}

function CommentRow({ comment, readOnly, onChanged }: {
  comment: TaskComment;
  readOnly: boolean;
  onChanged: () => void;
}) {
  return (
    <li className="rounded-lg border border-border/60 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 whitespace-pre-wrap text-sm leading-relaxed">{comment.body}</p>
        {!readOnly ? (
          <button
            onClick={() => void deleteCommentAction(comment.id).then(onChanged)}
            aria-label="Delete comment"
            className="text-muted-foreground transition hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
      <time className="mt-1 block text-xs text-muted-foreground">{formatDateTime(comment.created_at)}</time>
    </li>
  );
}