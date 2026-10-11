"use client";

/**
 * IndexedDB storage for the offline task cache.
 *
 * Everything is best-effort by design: a browser in private mode, a device with
 * storage disabled, or a quota-exhausted store must never break the tasks page.
 * Every function here resolves to a value rather than throwing, and every
 * failure path simply returns "no cache".
 *
 * Snapshots are keyed by user id. That is the whole of the multi-account story —
 * a shared device must not be able to serve one account's task titles to the
 * next, and namespacing the key is what prevents it.
 */

import {
  applyOptimisticTask,
  CACHE_VERSION,
  enqueueMutation,
  isSnapshotUsable,
  isValidSnapshot,
  mergeServerTasks,
  mutationId,
  pruneStaleMutations,
  settleMutation,
  type CachedTask,
  type QueuedMutation,
  type TaskCacheSnapshot,
} from "@/lib/offline/task-cache";

/** Versioned, so a change to the stored shape abandons the old database
 *  instead of handing the reader rows it cannot validate. */
const DB_NAME = `ownspece-offline-v${CACHE_VERSION}`;
const DB_VERSION = 1;
const STORE = "snapshots";

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
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Private mode and disabled storage both land here.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readStore<T>(db: IDBDatabase, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeStore<T>(db: IDBDatabase, value: T): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

async function load(userId: string): Promise<TaskCacheSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const raw = await readStore<TaskCacheSnapshot>(db, (store) => store.get(userId));
    if (!raw || !isValidSnapshot(raw)) return null;
    if (raw.userId !== userId) return null;
    return raw;
  } finally {
    db.close();
  }
}

async function save(snapshot: TaskCacheSnapshot): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    rememberActiveUser(snapshot.userId);
    return await writeStore(db, snapshot);
  } finally {
    db.close();
  }
}

/**
 * Reads the cached snapshot, rejecting anything expired.
 *
 * Returns null rather than an empty snapshot so the caller can tell "nothing
 * cached yet" from "cached, and genuinely no tasks" — the difference decides
 * whether the page shows a skeleton or an empty state.
 */
export async function readTaskCache(userId: string): Promise<TaskCacheSnapshot | null> {
  const snapshot = await load(userId);
  if (!snapshot || !isSnapshotUsable(snapshot, Date.now())) return null;
  return snapshot;
}

/**
 * Stores a server payload.
 *
 * Rows the server no longer returns are dropped, except queued offline writes,
 * and queued mutations that the server has since overtaken are pruned rather
 * than replayed over newer data.
 */
export async function writeTaskCache(
  userId: string,
  tasks: CachedTask[]
): Promise<TaskCacheSnapshot | null> {
  const existing = await load(userId);
  const queue = existing?.queue ?? [];
  const { queue: kept, dropped } = pruneStaleMutations(tasks, queue, Date.now());

  const merged = mergeServerTasks(existing?.tasks ?? [], tasks, kept);
  const snapshot: TaskCacheSnapshot = {
    userId,
    tasks: merged,
    queue: kept,
    cachedAt: new Date().toISOString(),
  };

  await save(snapshot);
  return dropped.length > 0 ? { ...snapshot, queue: kept } : snapshot;
}

/** Applies an edit locally and queues it for replay. */
export async function queueTaskMutation(
  userId: string,
  mutation: Omit<QueuedMutation, "id" | "attempts">
): Promise<{ snapshot: TaskCacheSnapshot; id: string } | null> {
  const existing = await load(userId);
  if (!existing) return null;

  const entry: QueuedMutation = {
    ...mutation,
    id: mutationId(mutation.taskId, mutation.kind, mutation.queuedAt),
    attempts: 0,
  };

  const queue = enqueueMutation(existing.queue, entry);
  const snapshot: TaskCacheSnapshot = {
    ...existing,
    tasks: applyOptimisticTask(existing.tasks, entry),
    queue,
  };

  await save(snapshot);
  return { snapshot, id: entry.id };
}

/** Clears the pending flag once the server has confirmed a replayed change. */
export async function settleQueuedMutation(
  userId: string,
  queuedId: string
): Promise<void> {
  const existing = await load(userId);
  if (!existing) return;

  const { tasks, queue } = settleMutation(existing.tasks, existing.queue, queuedId);
  await save({ ...existing, tasks, queue });
}

/** Wipes this user's cache — called on sign-out so nothing is left behind. */
export async function clearTaskCache(userId: string): Promise<void> {
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
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(userId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db?.close();
  }
}

const SYNC_TAG = "ownspece-task-sync";

/** The message the worker posts when the OS says a background sync is due. */
export const SYNC_MESSAGE = "TASK_SYNC_REQUESTED";

/**
 * Which account's snapshot belongs to this device.
 *
 * The route shell (`tasks/loading.tsx`) renders before any server component has
 * run, so it has no user id from props and cannot ask Supabase synchronously.
 * Remembering the last active account lets it read the right namespace; the
 * marker only ever holds an opaque id string, and the rows behind it are still
 * namespaced by that id.
 */
const ACTIVE_USER_KEY = "ownspece:offline-user";

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
 * Ask the browser to replay the queue when connectivity returns, even if the
 * tab is closed by then.
 *
 * Background Sync is Chromium-only, so this resolves quietly everywhere else —
 * the tab's own `online` listener already covers those cases.
 */
export async function requestBackgroundSync(): Promise<void> {
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