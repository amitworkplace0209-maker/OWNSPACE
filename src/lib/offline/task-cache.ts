import type { Priority, TaskStatus } from "@/types";

/**
 * Offline task cache — pure logic.
 *
 * The IndexedDB plumbing lives in `task-cache.client.ts`; everything here is
 * plain data so the rules that decide *what* gets stored, replayed and
 * discarded can be unit tested without a browser.
 *
 * Two rules drive the design:
 *
 *  1. Never store credentials. Auth stays in Supabase's own storage; the cache
 *     holds task rows only, and every read is namespaced by user id so a shared
 *     device cannot serve one account's tasks to the next.
 *  2. Newer data wins. Every row carries `updated_at`, so a queued offline
 *     mutation is only replayed when it is newer than what the server last sent
 *     — an edit made on the phone never silently overwrites a newer edit made
 *     on the laptop.
 */

/** A cached task row: the server row plus the fields the cache owns. */
export type CachedTask = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  /**
   * Every task belongs to a project — the DAL reads them through an inner join
   * on `projects` and the create action requires one — so this is not nullable
   * even though the column allows null in the schema.
   */
  project_id: string;
  phase_id: string | null;
  node_id: string | null;
  parent_task_id: string | null;
  status: TaskStatus;
  priority: Priority;
  progress: number;
  start_date: string | null;
  due_date: string | null;
  reminder_at: string | null;
  estimated_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  /** Resolved for display so an offline row still shows its project. */
  project_name: string;
  project_color: string | null;
  tag_names: string[];
  /**
   * Set while the row differs from the server because of a queued offline edit.
   * Cleared once the server confirms it.
   */
  pending?: boolean;
};

/** One queued change, replayed in order when the connection returns. */
export type QueuedMutation = {
  id: string;
  taskId: string;
  /** Which server action to call when replaying. */
  kind: "status" | "priority" | "progress";
  value: string | number;
  /** When the user made the change — compared against the row's `updated_at`. */
  queuedAt: string;
  attempts: number;
};

/**
 * A whole-row write made while offline: create, edit or delete.
 *
 * Field mutations (status/priority/progress) have their own narrow queue above,
 * but a new task, an edited title or a deletion cannot be expressed as one of
 * those. A write carries the complete patch the user intended and the stable id
 * the row will have on the server, which makes replay idempotent: replaying the
 * same create twice upserts the same row instead of duplicating it.
 */
export type QueuedWrite = {
  id: string;
  op: "create" | "update" | "delete";
  taskId: string;
  patch: Partial<CachedTask>;
  queuedAt: string;
  attempts: number;
  /** Last server rejection, surfaced in the sync indicator. */
  lastError?: string;
};

/** Everything the cache holds for one user. */
export type TaskCacheSnapshot = {
  userId: string;
  tasks: CachedTask[];
  queue: QueuedMutation[];
  /** Whole-row writes awaiting replay. Optional for older snapshots. */
  writes?: QueuedWrite[];
  /** When this snapshot was written. */
  cachedAt: string;
};

/** A stable, idempotent key for a whole-row write. */
export function writeId(op: QueuedWrite["op"], taskId: string, queuedAt: string): string {
  return `${op}:${taskId}:${queuedAt}`;
}

export const CACHE_VERSION = 1;

/** Snapshots older than this are ignored rather than shown as current. */
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const STATUS_VALUES: TaskStatus[] = [
  "backlog",
  "todo",
  "in_progress",
  "done",
  "cancelled",
];

export const PRIORITY_VALUES: Priority[] = [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
];

/**
 * Whether a stored snapshot may be used.
 *
 * Age is the only rejection reason: a snapshot from another user is never
 * returned by the reader in the first place, and a structurally invalid one is
 * dropped at read time by the guard below.
 */
export function isSnapshotUsable(
  snapshot: Pick<TaskCacheSnapshot, "cachedAt">,
  now: number
): boolean {
  const at = Date.parse(snapshot.cachedAt);
  if (Number.isNaN(at)) return false;
  if (now - at > MAX_SNAPSHOT_AGE_MS) return false;
  // A clock that moved backwards is not a reason to hide a snapshot that was
  // written moments ago.
  return true;
}

/** Guards against a corrupted or hand-edited record reaching the UI. */
export function isValidSnapshot(value: unknown): value is TaskCacheSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<TaskCacheSnapshot>;
  if (typeof snapshot.userId !== "string" || !snapshot.userId) return false;
  if (!Array.isArray(snapshot.tasks)) return false;
  if (!Array.isArray(snapshot.queue)) return false;
  if (typeof snapshot.cachedAt !== "string") return false;
  return snapshot.tasks.every(isValidTask);
}

export function isValidTask(value: unknown): value is CachedTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<CachedTask>;
  if (typeof task.id !== "string" || !task.id) return false;
  if (typeof task.user_id !== "string") return false;
  if (typeof task.title !== "string") return false;
  if (typeof task.project_id !== "string" || !task.project_id) return false;
  if (!STATUS_VALUES.includes(task.status as TaskStatus)) return false;
  if (!PRIORITY_VALUES.includes(task.priority as Priority)) return false;
  if (typeof task.updated_at !== "string") return false;
  if (!Array.isArray(task.tag_names)) return false;
  return true;
}

/**
 * Applies a queued mutation to the cached rows so the UI reflects the edit
 * immediately, without waiting for the network.
 *
 * Returns a new array — the cached snapshot is never mutated in place, because
 * the reader holds a reference to the old one for the current render.
 */
export function applyOptimisticTask(
  tasks: CachedTask[],
  mutation: Pick<QueuedMutation, "taskId" | "kind" | "value">
): CachedTask[] {
  return tasks.map((task) => {
    if (task.id !== mutation.taskId) return task;
    return { ...task, ...patchFor(task, mutation), pending: true };
  });
}

function patchFor(
  task: CachedTask,
  mutation: Pick<QueuedMutation, "kind" | "value">
): Partial<CachedTask> {
  if (mutation.kind === "status") {
    return STATUS_VALUES.includes(mutation.value as TaskStatus)
      ? { status: mutation.value as TaskStatus }
      : {};
  }
  if (mutation.kind === "priority") {
    return PRIORITY_VALUES.includes(mutation.value as Priority)
      ? { priority: mutation.value as Priority }
      : {};
  }
  const progress = Number(mutation.value);
  return Number.isFinite(progress)
    ? { progress: Math.max(0, Math.min(100, progress)) }
    : {};
}

/**
 * Drops a replayed mutation from the queue and clears the pending flag on any
 * row it no longer covers.
 *
 * A row stays `pending` while another queued edit still targets it — otherwise
 * replaying a status change would make a queued priority change look saved
 * when it has not been sent yet.
 */
export function settleMutation(
  tasks: CachedTask[],
  queue: QueuedMutation[],
  mutationId: string
): { tasks: CachedTask[]; queue: QueuedMutation[] } {
  const settled = queue.find((entry) => entry.id === mutationId);
  const nextQueue = queue.filter((entry) => entry.id !== mutationId);

  if (!settled) return { tasks, queue: nextQueue };

  const stillQueued = nextQueue.some((entry) => entry.taskId === settled.taskId);
  if (stillQueued) return { tasks, queue: nextQueue };

  return {
    tasks: tasks.map((task) =>
      task.id === settled.taskId && task.pending
        ? { ...task, pending: false }
        : task
    ),
    queue: nextQueue,
  };
}

/**
 * Decides which queued mutations are still worth sending.
 *
 * A mutation is stale — and silently dropped rather than replayed — when the
 * server has since sent a row that is newer than the edit. That is the "newer
 * data wins" rule: an offline edit must never clobber a change made later on
 * another device.
 */
export function pruneStaleMutations(
  tasks: CachedTask[],
  queue: QueuedMutation[],
  now: number
): { queue: QueuedMutation[]; dropped: QueuedMutation[] } {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const kept: QueuedMutation[] = [];
  const dropped: QueuedMutation[] = [];

  for (const mutation of queue) {
    const task = byId.get(mutation.taskId);
    if (task && Date.parse(task.updated_at) > Date.parse(mutation.queuedAt)) {
      dropped.push(mutation);
    } else if (now - Date.parse(mutation.queuedAt) > MAX_SNAPSHOT_AGE_MS) {
      // A week-old intent is not something to silently apply on reconnect.
      dropped.push(mutation);
    } else {
      kept.push(mutation);
    }
  }

  return { queue: kept, dropped };
}

/**
 * Merges a fresh server payload into the cache.
 *
 * Server rows are authoritative, except for rows with a queued edit that the
 * server has not acknowledged yet — those keep the optimistic value so the row
 * does not flicker back to its old state between the server response and the
 * replay.
 *
 * The payload is treated as the complete list for this view, so a cached row the
 * server did not send is dropped; that is how a task deleted on another device
 * finally disappears here. Only rows with something still queued are kept.
 */
export function mergeServerTasks(
  cached: CachedTask[],
  incoming: CachedTask[],
  queue: QueuedMutation[]
): CachedTask[] {
  const queuedByTask = new Map<string, QueuedMutation[]>();
  for (const mutation of queue) {
    const list = queuedByTask.get(mutation.taskId) ?? [];
    list.push(mutation);
    queuedByTask.set(mutation.taskId, list);
  }

  const seen = new Set<string>();
  const merged: CachedTask[] = incoming.map((task) => {
    seen.add(task.id);
    const pending = queuedByTask.get(task.id);
    if (!pending || pending.length === 0) return { ...task, pending: false };

    // Replay the queued edits on top of the server row so the optimistic value
    // survives, using the newest edit last.
    return pending.reduce<CachedTask>(
      (current, mutation) => ({ ...current, ...patchFor(current, mutation), pending: true }),
      { ...task }
    );
  });

  // Keep rows the server has not sent yet but that still have something queued —
  // they are offline writes the server has not seen. Anything else the payload
  // omitted is genuinely gone.
  for (const task of cached) {
    if (seen.has(task.id)) continue;
    if (queuedByTask.has(task.id)) merged.push(task);
  }

  return merged;
}

/** A stable id for a mutation, so a retried replay is not enqueued twice. */
export function mutationId(taskId: string, kind: string, queuedAt: string): string {
  return `${taskId}:${kind}:${queuedAt}`;
}

/**
 * Appends a mutation, collapsing an identical one that is already queued.
 *
 * Toggling a task's checkbox five times while offline should send one write,
 * not five — but toggling back and forth should send the *last* value, not the
 * first, so only a consecutive duplicate is collapsed.
 */
export function enqueueMutation(
  queue: QueuedMutation[],
  mutation: QueuedMutation
): QueuedMutation[] {
  const previous = queue[queue.length - 1];
  if (
    previous &&
    previous.taskId === mutation.taskId &&
    previous.kind === mutation.kind &&
    previous.value === mutation.value
  ) {
    return queue;
  }
  return [...queue, mutation];
}

/**
 * Applies a whole-row write to the cached list immediately.
 *
 * A create appends a local row with the id that will be used on the server; an
 * update patches the matching row; a delete removes it. Rows touched by an
 * unreplayed write are marked `pending` so the UI can say they are not synced.
 */
export function applyOptimisticWrite(
  tasks: CachedTask[],
  write: Pick<QueuedWrite, "op" | "taskId" | "patch">
): CachedTask[] {
  if (write.op === "delete") {
    return tasks.filter((task) => task.id !== write.taskId);
  }

  if (write.op === "create") {
    if (tasks.some((task) => task.id === write.taskId)) return tasks;
    return [...tasks, { ...(write.patch as CachedTask), pending: true }];
  }

  return tasks.map((task) =>
    task.id === write.taskId ? { ...task, ...write.patch, pending: true } : task
  );
}

/** Removes a settled write and clears `pending` once nothing else targets the row. */
export function settleWrite(
  tasks: CachedTask[],
  writes: QueuedWrite[],
  writeIdToSettle: string
): { tasks: CachedTask[]; writes: QueuedWrite[] } {
  const settled = writes.find((write) => write.id === writeIdToSettle);
  const nextWrites = writes.filter((write) => write.id !== writeIdToSettle);
  if (!settled) return { tasks, writes: nextWrites };

  if (nextWrites.some((write) => write.taskId === settled.taskId)) {
    return { tasks, writes: nextWrites };
  }

  return {
    tasks: tasks.map((task) =>
      task.id === settled.taskId && task.pending ? { ...task, pending: false } : task
    ),
    writes: nextWrites,
  };
}

/**
 * Drops writes whose row has since been changed on the server.
 *
 * "Newer data wins" applies to whole-row writes too: if the server sent a row
 * newer than our intent, replaying would clobber that newer version, so the
 * write is discarded rather than silently overwriting it.
 */
export function pruneStaleWrites(
  tasks: CachedTask[],
  writes: QueuedWrite[],
  now: number
): { writes: QueuedWrite[]; dropped: QueuedWrite[] } {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const kept: QueuedWrite[] = [];
  const dropped: QueuedWrite[] = [];

  for (const write of writes) {
    const task = byId.get(write.taskId);
    const queuedAt = Date.parse(write.queuedAt);
    if (Number.isNaN(queuedAt) || now - queuedAt > MAX_SNAPSHOT_AGE_MS) {
      dropped.push(write);
    } else if (write.op !== "create" && task && Date.parse(task.updated_at) > queuedAt) {
      dropped.push(write);
    } else {
      kept.push(write);
    }
  }

  return { writes: kept, dropped };
}

/**
 * Folds a fresh server payload together with outstanding writes.
 *
 * A locally created row is kept until its create is acknowledged; a server row
 * with pending writes keeps the optimistic values layered on top so the UI does
 * not flicker back between a response and the replay.
 */
export function mergeServerTaskWrites(
  cached: CachedTask[],
  incoming: CachedTask[],
  writes: QueuedWrite[]
): CachedTask[] {
  const byId = new Map<string, QueuedWrite[]>();
  for (const write of writes) {
    const list = byId.get(write.taskId) ?? [];
    list.push(write);
    byId.set(write.taskId, list);
  }

  const seen = new Set<string>();
  const merged = incoming.map((task) => {
    seen.add(task.id);
    const pending = byId.get(task.id);
    if (!pending?.length) return { ...task, pending: false };
    return pending.reduce<CachedTask>(
      (current, write) =>
        write.op === "delete" ? current : { ...current, ...write.patch, pending: true },
      { ...task }
    );
  });

  for (const task of cached) {
    if (seen.has(task.id)) continue;
    if (!byId.has(task.id)) continue;
    if (byId.get(task.id)?.some((write) => write.op === "delete")) continue;
    merged.push(task);
  }

  return merged;
}

/** Number of whole-row writes that have failed and still need attention. */
export function failedWriteCount(writes: QueuedWrite[]): number {
  return writes.filter((write) => Boolean(write.lastError)).length;
}

/**
 * Builds the local row for an offline-created task.
 *
 * Every field the server row needs is present so the optimistic row can be
 * rendered, filtered and edited exactly like a server row. The patch supplies
 * the user's values; the rest are safe defaults.
 */
export function localTaskFromPatch(
  userId: string,
  taskId: string,
  patch: Partial<CachedTask>,
  now: string = new Date().toISOString()
): CachedTask {
  return {
    id: taskId,
    user_id: userId,
    title: "",
    description: null,
    project_id: "",
    phase_id: null,
    node_id: null,
    parent_task_id: null,
    status: "todo",
    priority: "none",
    progress: 0,
    start_date: null,
    due_date: null,
    reminder_at: null,
    estimated_minutes: null,
    sort_order: 0,
    created_at: now,
    updated_at: now,
    project_name: "Project",
    project_color: null,
    tag_names: [],
    ...patch,
    pending: true,
  };
}
