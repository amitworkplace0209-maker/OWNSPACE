"use client";

/**
 * IndexedDB storage for the offline reminder cache.
 *
 * Best-effort by design, exactly like the task cache: a private-mode browser, a
 * device with storage disabled or an exhausted quota must never break the
 * reminders page. Every function resolves to a value instead of throwing, and
 * every failure path simply returns "no cache".
 *
 * Snapshots are keyed by user id. That is the whole of the multi-account story —
 * a shared device must not serve one account's reminder titles to the next, and
 * namespacing the key is what prevents it.
 *
 * Projects are stored in the same record as the reminders rather than a second
 * store, because a reminder without its project name is not renderable offline
 * and the two are always written together.
 */

import {
  applyOptimisticReminder,
  cacheableProjects,
  enqueueMutation,
  isSnapshotUsable,
  isValidSnapshot,
  mergeServerReminders,
  pruneStaleMutations,
  reminderMutationId,
  REMINDER_CACHE_VERSION,
  settleMutation,
  type CachedProject,
  type CachedReminder,
  type QueuedReminderMutation,
  type ReminderCacheSnapshot,
} from "@/lib/offline/reminder-cache";

const DB_NAME = `ownspece-reminders-v${REMINDER_CACHE_VERSION}`;
const DB_VERSION = 1;
const STORE = "snapshots";

const ACTIVE_USER_KEY = "ownspece:offline-reminder-user";
const SYNC_TAG = "ownspece-reminder-sync";

/** The message the worker posts when background sync comes due. */
export const REMINDER_SYNC_MESSAGE = "REMINDER_SYNC_REQUESTED";

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
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function readStore<T>(
  db: IDBDatabase,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
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

async function load(userId: string): Promise<ReminderCacheSnapshot | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const raw = await readStore<ReminderCacheSnapshot>(db, (store) => store.get(userId));
    if (!raw || !isValidSnapshot(raw)) return null;
    if (raw.userId !== userId) return null;
    return raw;
  } finally {
    db.close();
  }
}

async function save(snapshot: ReminderCacheSnapshot): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    rememberActiveReminderUser(snapshot.userId);
    return await writeStore(db, snapshot);
  } finally {
    db.close();
  }
}

/**
 * Reads the cached snapshot, rejecting anything expired.
 *
 * Returns null rather than an empty snapshot so the caller can tell "nothing
 * cached yet" from "cached, and genuinely no reminders".
 */
export async function readReminderCache(
  userId: string
): Promise<ReminderCacheSnapshot | null> {
  const snapshot = await load(userId);
  if (!snapshot || !isSnapshotUsable(snapshot, Date.now())) return null;
  return snapshot;
}

/**
 * Stores a server payload.
 *
 * Rows the server no longer returns are dropped unless a queued write covers
 * them, and queued mutations the server has since overtaken are pruned rather
 * than replayed over newer data.
 */
export async function writeReminderCache(
  userId: string,
  reminders: CachedReminder[],
  projects: CachedProject[] = []
): Promise<ReminderCacheSnapshot | null> {
  const existing = await load(userId);
  const queue = existing?.queue ?? [];
  const { queue: kept } = pruneStaleMutations(reminders, queue, Date.now());

  const merged = mergeServerReminders(existing?.reminders ?? [], reminders, kept);
  const snapshot: ReminderCacheSnapshot = {
    userId,
    reminders: merged,
    projects: cacheableProjects(projects),
    queue: kept,
    cachedAt: new Date().toISOString(),
  };

  await save(snapshot);
  return snapshot;
}

/**
 * Applies an edit locally and queues it for replay.
 *
 * A `create` with no snapshot to patch is allowed through — it seeds the store —
 * because otherwise the very first offline reminder could never be saved.
 */
export async function queueReminderMutation(
  userId: string,
  mutation: Omit<QueuedReminderMutation, "id" | "attempts">
): Promise<{ snapshot: ReminderCacheSnapshot; id: string } | null> {
  const existing = await load(userId);

  const entry: QueuedReminderMutation = {
    ...mutation,
    id: reminderMutationId(mutation.reminderId, mutation.kind, mutation.queuedAt),
    attempts: 0,
  };

  const base: ReminderCacheSnapshot = existing ?? {
    userId,
    reminders: [],
    projects: [],
    queue: [],
    cachedAt: new Date().toISOString(),
  };

  const snapshot: ReminderCacheSnapshot = {
    ...base,
    reminders: applyOptimisticReminder(base.reminders, entry),
    queue: enqueueMutation(base.queue, entry),
  };

  await save(snapshot);
  return { snapshot, id: entry.id };
}

/** Clears the pending flag once the server has confirmed a replayed change. */
export async function settleQueuedReminder(
  userId: string,
  queuedId: string
): Promise<void> {
  const existing = await load(userId);
  if (!existing) return;
  const { reminders, queue } = settleMutation(existing.reminders, existing.queue, queuedId);
  await save({ ...existing, reminders, queue });
}

/** Wipes this user's cache — called on sign-out so nothing is left behind. */
export async function clearReminderCache(userId: string): Promise<void> {
  const db = await openDb();
  try {
    if (readActiveReminderUser() === userId) {
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

/**
 * Which account's snapshot belongs to this device.
 *
 * The route shell renders before any server component has run, so it has no
 * user id from props and cannot ask Supabase synchronously. Remembering the
 * last active account lets the offline shell read the right namespace; the
 * marker only ever holds an opaque id string.
 */
export function rememberActiveReminderUser(userId: string): void {
  try {
    window.localStorage.setItem(ACTIVE_USER_KEY, userId);
  } catch {
    // Storage unavailable; the shell simply falls back to the skeleton.
  }
}

export function readActiveReminderUser(): string | null {
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
export async function requestReminderBackgroundSync(): Promise<void> {
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