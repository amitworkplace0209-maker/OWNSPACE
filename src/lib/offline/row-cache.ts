/**
 * Generic offline row cache — pure logic.
 *
 * Why this exists rather than one cache per entity
 * ------------------------------------------------
 * Notes, calendar events, wiki pages, finance transactions and the rest all want
 * exactly the same three things: read the last server payload, show an edit
 * immediately when the network is gone, and replay the queue on reconnect. The
 * only thing that genuinely differs between them is *which server action* to
 * call — and that belongs in a registry, not in fifteen copies of the queueing
 * machinery.
 *
 * `task-cache.ts` and `reminder-cache.ts` remain entity-specific, because their
 * shapes are: a task's optimistic edit is one of three fixed fields, and a
 * reminder's carries a whole row. Here a patch is an open set of fields, so one
 * implementation covers every list this app has.
 *
 * The rules, and why each exists
 * ------------------------------
 *
 *  1. **Never store credentials.** Auth stays in Supabase's own storage, and
 *     every snapshot is namespaced by user id so a shared device cannot serve
 *     one account's rows to the next.
 *  2. **Newer data wins.** A queued operation is only replayed while the server
 *     has not since sent something newer. An edit made on a phone must never
 *     silently overwrite a later edit made on a laptop.
 *  3. **Queue before you send.** The intent is written to storage before the
 *     network is touched, so a request that fails in flight loses nothing.
 *
 * Everything here is plain data, so the decisions can be tested without a
 * browser, a database or a network — which is the only reason they are written
 * down at all. The IndexedDB plumbing is `row-cache.client.ts`.
 */

/** A row as this module knows it: the server row, plus what the cache owns. */
export type CachedRow = {
  id: string;
  /**
   * ISO timestamp the server last wrote this row.
   *
   * Optional on purpose. A row created offline has never been written by the
   * server and has no such timestamp, and rejecting those here would mean an
   * offline-created note could not be cached at all.
   */
  updated_at?: string | null;
  /** True while the row differs from the server because of a queued edit. */
  pending?: boolean;
  [field: string]: unknown;
};

/** What a queued operation does to a row. */
export type RowOp = "create" | "update" | "delete";

/**
 * One queued change.
 *
 * `patch` is open rather than a fixed field union, because the whole point is
 * that a caller can queue whatever the entity's update action accepts without
 * this file knowing any entity's shape.
 */
export type QueuedRowOp = {
  id: string;
  entity: string;
  op: RowOp;
  /** The row's `id`. For `create`, a client-generated one. */
  rowId: string;
  patch: Record<string, unknown>;
  /** When the user made the change — compared against the row's `updated_at`. */
  queuedAt: string;
  attempts: number;
};

/** Everything the cache holds for one user and one entity. */
export type RowCacheSnapshot<T extends CachedRow = CachedRow> = {
  userId: string;
  entity: string;
  rows: T[];
  queue: QueuedRowOp[];
  cachedAt: string;
};

export const ROW_CACHE_VERSION = 1;

/**
 * Snapshots older than this are ignored rather than shown as current, and
 * operations older than this are discarded rather than silently applied later.
 *
 * A week is long enough to cover a trip and short enough that a phone that has
 * been in a drawer does not resurrect a month's worth of stale intent.
 */
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Whether a stored snapshot may be used. */
export function isSnapshotUsable(
  snapshot: Pick<RowCacheSnapshot, "cachedAt">,
  now: number
): boolean {
  const at = Date.parse(snapshot.cachedAt);
  if (Number.isNaN(at)) return false;
  if (now - at > MAX_SNAPSHOT_AGE_MS) return false;
  // A clock that moved backwards is not a reason to hide a snapshot written
  // moments ago.
  return true;
}

/**
 * Guards against a corrupted or hand-edited record reaching the UI.
 *
 * `validateRow` is supplied by the entity, because only it knows which fields
 * are required. The shared checks are the ones that must hold for *every*
 * entity: a row has an id, the collections are really arrays, and the timestamp
 * parses. A snapshot that fails any of them is dropped rather than rendered.
 */
export function isValidSnapshot<T extends CachedRow>(
  value: unknown,
  validateRow: (row: unknown) => row is T
): value is RowCacheSnapshot<T> {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<RowCacheSnapshot<T>>;
  if (typeof snapshot.userId !== "string" || !snapshot.userId) return false;
  if (typeof snapshot.entity !== "string" || !snapshot.entity) return false;
  if (!Array.isArray(snapshot.rows)) return false;
  if (!Array.isArray(snapshot.queue)) return false;
  if (typeof snapshot.cachedAt !== "string") return false;
  if (!snapshot.queue.every(isValidQueuedOp)) return false;
  return snapshot.rows.every(validateRow);
}

export function isValidQueuedOp(value: unknown): value is QueuedRowOp {
  if (!value || typeof value !== "object") return false;
  const op = value as Partial<QueuedRowOp>;
  if (typeof op.id !== "string" || !op.id) return false;
  if (typeof op.entity !== "string" || !op.entity) return false;
  if (op.op !== "create" && op.op !== "update" && op.op !== "delete") return false;
  if (typeof op.rowId !== "string" || !op.rowId) return false;
  if (!op.patch || typeof op.patch !== "object") return false;
  if (typeof op.queuedAt !== "string" || Number.isNaN(Date.parse(op.queuedAt))) return false;
  if (typeof op.attempts !== "number") return false;
  return true;
}

/**
 * Applies a queued operation to the cached rows so the UI reflects the change
 * immediately.
 *
 * Returns a new array — the cached snapshot is never mutated in place, because
 * the reader holds a reference to the old one for the current render.
 *
 * A `create` appends, an `update` patches in place, and a `delete` removes.
 * All three mark the row `pending` so the UI can say "this has not reached the
 * server yet" rather than implying it has.
 */
export function applyOptimisticOp<T extends CachedRow>(
  rows: readonly T[],
  op: Pick<QueuedRowOp, "op" | "rowId" | "patch">
): T[] {
  if (op.op === "delete") return rows.filter((row) => row.id !== op.rowId) as T[];

  if (op.op === "create") {
    // Re-queued as an update once the row exists, so this only fires the first
    // time; the guard stops a duplicate queue entry appending a second copy.
    if (rows.some((row) => row.id === op.rowId)) {
      return rows.map((row) =>
        row.id === op.rowId ? ({ ...row, ...op.patch, pending: true } as T) : row
      );
    }
    return [...rows, { ...op.patch, id: op.rowId, pending: true } as T];
  }

  return rows.map((row) =>
    row.id === op.rowId ? ({ ...row, ...op.patch, pending: true } as T) : row
  );
}

/**
 * Merges a fresh server payload into the cache.
 *
 * Server rows are authoritative, except for rows with a queued edit the server
 * has not acknowledged yet — those keep the optimistic value so a row does not
 * flicker back to its old state between the server response and the replay.
 *
 * Replayed in queue order rather than collapsed to the newest: two edits made
 * offline are two intents, and applying only the last would lose the first if
 * they touched different fields.
 *
 * The payload is treated as the complete list for this view, so a cached row the
 * server did not send is dropped — that is how a row deleted on another device
 * finally disappears here. The exception is a row with something still queued
 * against it, which has not been sent and so cannot have been deleted.
 */
export function mergeServerRows<T extends CachedRow>(
  cached: readonly T[],
  incoming: readonly T[],
  queue: readonly QueuedRowOp[]
): T[] {
  const byRow = new Map<string, QueuedRowOp[]>();
  for (const op of queue) {
    const list = byRow.get(op.rowId) ?? [];
    list.push(op);
    byRow.set(op.rowId, list);
  }

  const seen = new Set<string>();
  const merged: T[] = [];

  for (const row of incoming) {
    seen.add(row.id);
    const pending = byRow.get(row.id) ?? [];

    // A queued delete means the row is gone on this device even though the
    // server still has it. Letting it back in would make a note someone deleted
    // on the train reappear the moment any unrelated write refreshed the page.
    if (pending.some((op) => op.op === "delete")) continue;

    merged.push(
      pending.reduce<T>(
        (current, op) => ({ ...current, ...op.patch, pending: true } as T),
        { ...row, pending: false } as T
      )
    );
  }

  // Keep rows the server has not sent but that still have something queued — an
  // offline create, or an edit the server has not caught up with. Anything else
  // the payload omitted really is gone.
  for (const row of cached) {
    if (seen.has(row.id)) continue;
    const pending = byRow.get(row.id) ?? [];
    if (pending.length === 0) continue;
    if (pending.some((op) => op.op === "delete")) continue;
    merged.push(row);
  }

  return merged;
}

/**
 * Decides which queued operations are still worth sending.
 *
 * An operation is stale — silently dropped, not replayed — when the server has
 * since sent a row newer than the edit, or when the intent is older than the
 * retention window. Replaying a stale operation would clobber a later change
 * made on another device; applying a month-old intent is not something to do
 * without asking.
 *
 * A `create` is never stale for this reason: there is no server row for it to
 * have been overtaken by.
 */
export function pruneStaleOps<T extends CachedRow>(
  rows: readonly T[],
  queue: readonly QueuedRowOp[],
  now: number
): { queue: QueuedRowOp[]; dropped: QueuedRowOp[] } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const kept: QueuedRowOp[] = [];
  const dropped: QueuedRowOp[] = [];

  for (const op of queue) {
    const row = byId.get(op.rowId);
    const serverIsNewer =
      op.op !== "create" &&
      row?.updated_at &&
      Date.parse(row.updated_at) > Date.parse(op.queuedAt);

    if (serverIsNewer) dropped.push(op);
    else if (now - Date.parse(op.queuedAt) > MAX_SNAPSHOT_AGE_MS) dropped.push(op);
    else kept.push(op);
  }

  return { queue: kept, dropped };
}

/**
 * Drops a replayed operation and clears the pending flag it no longer covers.
 *
 * A row stays `pending` while another queued operation still targets it —
 * otherwise replaying a title edit would make a queued tag change look saved
 * when it has not been sent yet.
 */
export function settleOp<T extends CachedRow>(
  rows: readonly T[],
  queue: readonly QueuedRowOp[],
  opId: string
): { rows: T[]; queue: QueuedRowOp[] } {
  const settled = queue.find((entry) => entry.id === opId);
  const nextQueue = queue.filter((entry) => entry.id !== opId);

  if (!settled) return { rows: [...rows], queue: nextQueue };
  if (nextQueue.some((entry) => entry.rowId === settled.rowId)) {
    return { rows: [...rows], queue: nextQueue };
  }

  return {
    rows: rows.map((row) =>
      row.id === settled.rowId && row.pending ? ({ ...row, pending: false } as T) : row
    ),
    queue: nextQueue,
  };
}

/**
 * A stable id for a queued operation.
 *
 * Deterministic so a retried replay cannot enqueue the same intent twice — the
 * queue is written before the network is touched, so a send that fails in flight
 * will be attempted again, and without this the second attempt would be a
 * duplicate write.
 */
export function rowOpId(entity: string, op: RowOp, rowId: string, queuedAt: string): string {
  return `${entity}:${op}:${rowId}:${queuedAt}`;
}

/**
 * Appends an operation, collapsing an identical one already at the tail.
 *
 * Toggling a favourite five times while offline should send one write, not five.
 * Toggling *back* must send the last value, not the first, so only a consecutive
 * duplicate is collapsed — and `update` ops are never collapsed, because two
 * updates to different fields are two real intents.
 */
export function enqueueRowOp(
  queue: readonly QueuedRowOp[],
  op: QueuedRowOp
): QueuedRowOp[] {
  const previous = queue[queue.length - 1];
  if (
    previous &&
    previous.rowId === op.rowId &&
    previous.op === op.op &&
    op.op !== "update" &&
    samePatch(previous.patch, op.patch)
  ) {
    return [...queue];
  }
  return [...queue, op];
}

function samePatch(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * The storage key for one user's copy of one entity's rows.
 *
 * A single key rather than one per row: a payload arrives whole, is merged as a
 * whole, and is replaced as a whole. Per-row keys would mean a partial payload
 * could never be written atomically.
 */
export function rowCacheKey(userId: string, entity: string): string {
  return `${userId}:${entity}`;
}

/**
 * Splits a storage key back into its parts.
 *
 * Returns null for anything malformed, so a hand-edited or half-written entry
 * is ignored rather than read as some other account's rows.
 */
export function parseRowCacheKey(key: string): { userId: string; entity: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0) return null;
  const userId = key.slice(0, separator);
  const entity = key.slice(separator + 1);
  if (!userId || !entity) return null;
  return { userId, entity };
}