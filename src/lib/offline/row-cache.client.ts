"use client";

/**
 * IndexedDB storage for the generic offline row cache.
 *
 * One database, one object store, many entities — keyed by `userId:entity`. That
 * shape is what lets notes, calendar events, wiki pages and transactions share a
 * single implementation instead of each carrying its own copy of the same
 * queueing machinery.
 *
 * Everything is best-effort by design: a browser in private mode, a device with
 * storage disabled, or a quota-exhausted store must never break a page. Every
 * function resolves to a value rather than throwing, and every failure path
 * returns "no cache" — which the caller reads as "this device cannot go
 * offline", not as an error worth interrupting the user for.
 *
 * Snapshots are namespaced by account. That is the whole of the multi-account
 * story: a shared device must not be able to serve one account's notes to the
 * next, and namespacing the key is what prevents it.
 */

import {
  applyOptimisticOp,
  enqueueRowOp,
  isSnapshotUsable,
  isValidSnapshot,
  mergeServerRows,
  pruneStaleOps,
  rowCacheKey,
  rowOpId,
  settleOp,
  ROW_CACHE_VERSION,
  type CachedRow,
  type QueuedRowOp,
  type RowCacheSnapshot,
} from "@/lib/offline/row-cache";

/**
 * Versioned in the database name, so a change to the stored shape abandons the
 * old data rather than handing the reader rows it cannot validate.
 */
const DB_NAME = `ownspece-rows-v${ROW_CACHE_VERSION}`;
const DB_VERSION = 1;
const STORE = "snapshots";

/** Tells the app which account this device last saw, for a pre-hydration read. */
const ACTIVE_USER_KEY = "ownspece:offline-user";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private mode and disabled storage both land here.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function load<T extends CachedRow>(
  userId: string,
  entity: string,
  validateRow: (row: unknown) => row is T
): Promise<RowCacheSnapshot<T> | null> {
  const db = await openDb();
  if (!db) return null;

  try {
    const key = rowCacheKey(userId, entity);
    const raw = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (!raw || !isValidSnapshot(raw, validateRow)) return null;
    // The key is namespaced, so this should be unreachable — but a hand-edited
    // or corrupted entry must not be served just because its shape is valid.
    const snapshot = raw as RowCacheSnapshot<T>;
    if (snapshot.userId !== userId || snapshot.entity !== entity) return null;
    return snapshot;
  } finally {
    db.close();
  }
}

async function save(snapshot: RowCacheSnapshot): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;

  try {
    rememberActiveUser(snapshot.userId);
    return await new Promise<boolean>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ ...snapshot, key: rowCacheKey(snapshot.userId, snapshot.entity) });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } finally {
    db.close();
  }
}

/**
 * Reads the cached snapshot, rejecting anything expired.
 *
 * Returns null rather than an empty snapshot so the caller can tell "nothing
 * cached yet" from "cached, and genuinely nothing" — the difference decides
 * whether the page shows a skeleton or an empty state.
 */
export async function readRowCache<T extends CachedRow>(
  userId: string,
  entity: string,
  validateRow: (row: unknown) => row is T
): Promise<RowCacheSnapshot<T> | null> {
  const snapshot = await load(userId, entity, validateRow);
  if (!snapshot || !isSnapshotUsable(snapshot, Date.now())) return null;
  return snapshot;
}

/**
 * Stores a server payload.
 *
 * Rows the server no longer returns are dropped, except queued offline writes,
 * and queued operations the server has since overtaken are pruned rather than
 * replayed over newer data.
 */
export async function writeRowCache<T extends CachedRow>(
  userId: string,
  entity: string,
  rows: readonly T[],
  validateRow: (row: unknown) => row is T
): Promise<RowCacheSnapshot<T> | null> {
  const existing = await load(userId, entity, validateRow);
  const { queue } = pruneStaleOps(existing?.rows ?? [], existing?.queue ?? [], Date.now());

  const snapshot: RowCacheSnapshot<T> = {
    userId,
    entity,
    rows: mergeServerRows(existing?.rows ?? [], rows, queue),
    queue,
    cachedAt: new Date().toISOString(),
  };

  await save(snapshot);
  return snapshot;
}

/**
 * Applies an operation locally and queues it for replay.
 *
 * Returns null when there is no cache yet. That is not a failure to queue — it
 * means this device has never held this entity's rows, so there is no local
 * list to apply the edit to. The caller falls back to sending it directly.
 */
export async function queueRowOp<T extends CachedRow>(
  userId: string,
  entity: string,
  op: { op: QueuedRowOp["op"]; rowId: string; patch: Record<string, unknown> },
  validateRow: (row: unknown) => row is T
): Promise<{ snapshot: RowCacheSnapshot<T>; id: string } | null> {
  const existing = await load(userId, entity, validateRow);
  if (!existing) return null;

  const queuedAt = new Date().toISOString();
  const entry: QueuedRowOp = {
    id: rowOpId(entity, op.op, op.rowId, queuedAt),
    entity,
    op: op.op,
    rowId: op.rowId,
    patch: op.patch,
    queuedAt,
    attempts: 0,
  };

  const snapshot: RowCacheSnapshot<T> = {
    ...existing,
    rows: applyOptimisticOp(existing.rows, entry),
    queue: enqueueRowOp(existing.queue, entry),
  };

  await save(snapshot);
  return { snapshot, id: entry.id };
}

/** Clears the pending flag once the server has confirmed a replayed operation. */
export async function settleRowOp(
  userId: string,
  entity: string,
  queuedId: string
): Promise<void> {
  const db = await openDb();
  if (!db) return;

  try {
    const key = rowCacheKey(userId, entity);
    const raw = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readonly");
        const request = tx.objectStore(STORE).get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    // Read through the loose check rather than `load`, which needs an entity
    // validator the caller of a settle does not have. The structural guard below
    // is what keeps a corrupt record out of the UI.
    const snapshot = raw as RowCacheSnapshot<CachedRow> | null;
    if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.queue)) return;

    const { rows, queue } = settleOp(snapshot.rows, snapshot.queue, queuedId);
    // `save` writes the key itself, so the `key` the store put there is simply
    // overwritten — no reason to strip it first.
    await save({ ...snapshot, rows, queue });
  } finally {
    db.close();
  }
}

/** How many operations are waiting for this entity. */
export async function readRowQueueSize(
  userId: string,
  entity: string,
  validateRow: (row: unknown) => row is CachedRow
): Promise<number> {
  const snapshot = await readRowCache(userId, entity, validateRow);
  return snapshot?.queue.length ?? 0;
}

/**
 * Which account's rows belong to this device.
 *
 * A route's loading shell renders before any server component has run, so it has
 * no user id from props and cannot ask Supabase synchronously. Remembering the
 * last active account lets it read the right namespace; the marker only ever
 * holds an opaque id string, and the rows behind it are still namespaced by it.
 */
export function rememberActiveUser(userId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_USER_KEY, userId);
  } catch {
    // Storage unavailable; the shell simply falls back to the skeleton.
  }
}

export function readActiveUser(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_USER_KEY);
  } catch {
    return null;
  }
}

/**
 * Wipes one account's rows — called on sign-out so nothing is left behind.
 *
 * Deletes by key prefix rather than by reading every snapshot, so the cost does
 * not grow with how much the user has accumulated.
 */
export async function clearRowCache(userId: string): Promise<void> {
  const db = await openDb();

  try {
    if (readActiveUser() === userId) {
      try {
        window.localStorage.removeItem(ACTIVE_USER_KEY);
      } catch {
        // Nothing to clean up.
      }
    }
    if (!db) return;

    const prefix = `${userId}:`;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const request = store.openKeyCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          if (String(cursor.key).startsWith(prefix)) cursor.delete();
          cursor.continue();
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      }
    });
  } finally {
    db?.close();
  }
}

const SYNC_TAG = "ownspece-row-sync";

/** The message the worker posts when the OS says a background sync is due. */
export const ROW_SYNC_MESSAGE = "ROW_SYNC_REQUESTED";

/**
 * Ask the browser to replay the queue when connectivity returns, even if the tab
 * is closed by then.
 *
 * Background Sync is Chromium-only, so this resolves quietly everywhere else —
 * the tab's own `online` listener already covers those cases.
 */
export async function requestRowBackgroundSync(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const manager = (
      registration as ServiceWorkerRegistration & {
        sync?: { register(tag: string): Promise<void> };
      }
    ).sync;
    if (!manager) return;
    await manager.register(SYNC_TAG);
  } catch {
    // Unsupported, or the page is not controlled by a worker yet.
  }
}