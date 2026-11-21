"use client";

/**
 * Aggregates the independent offline queues into one report.
 *
 * The caches stay separate — tasks, reminders and generic rows each have their
 * own replay path — but a person should not have to add up three counters to
 * know whether their device still has unsent work.
 */

import { readReminderCache } from "@/lib/offline/reminder-cache.client";
import { readRowQueueSize } from "@/lib/offline/row-cache.client";
import { readTaskCache } from "@/lib/offline/task-cache.client";
import { failedWriteCount } from "@/lib/offline/task-cache";
import type { CachedRow } from "@/lib/offline/row-cache";
import type { SyncReport } from "@/lib/offline/sync-status";

const META_PREFIX = "ownspece:sync-meta:v1";

function key(userId: string, field: string): string {
  return `${META_PREFIX}:${userId}:${field}`;
}

function readMeta(userId: string, field: string): string | null {
  try {
    return window.localStorage.getItem(key(userId, field));
  } catch {
    return null;
  }
}

function writeMeta(userId: string, field: string, value: string): void {
  try {
    window.localStorage.setItem(key(userId, field), value);
  } catch {
    // Metadata is diagnostic only; losing it must never lose a queued write.
  }
}

export function recordSyncSuccess(userId: string, at: string = new Date().toISOString()): void {
  writeMeta(userId, "last-success", at);
  writeMeta(userId, "last-error", "");
}

export function recordSyncError(userId: string, error: string): void {
  writeMeta(userId, "last-error", error.slice(0, 500));
}

export function readSyncMetadata(userId: string): {
  lastSuccessAt: string | null;
  lastError: string | null;
} {
  return {
    lastSuccessAt: readMeta(userId, "last-success"),
    lastError: readMeta(userId, "last-error") || null,
  };
}

export function clearSyncMetadata(userId: string): void {
  try {
    window.localStorage.removeItem(key(userId, "last-success"));
    window.localStorage.removeItem(key(userId, "last-error"));
  } catch {
    // Nothing to clean up.
  }
}

const isCachedRow = (row: unknown): row is CachedRow =>
  Boolean(row && typeof row === "object" && "id" in row);

/** Reads every queue and the local metadata into a single report. */
export async function collectSyncReport(
  userId: string,
  online: boolean,
  syncing: boolean
): Promise<SyncReport> {
  const [tasks, reminders, noteOps] = await Promise.all([
    readTaskCache(userId),
    readReminderCache(userId),
    readRowQueueSize(userId, "notes", isCachedRow),
  ]);

  const taskWrites = tasks?.writes ?? [];
  const failedWrites = failedWriteCount(taskWrites);
  const meta = readSyncMetadata(userId);

  return {
    online,
    syncing,
    pending: (tasks?.queue.length ?? 0) + taskWrites.length + (reminders?.queue.length ?? 0) + noteOps,
    failed: failedWrites + (meta.lastError ? 1 : 0),
    lastSuccessAt: meta.lastSuccessAt,
    lastError: meta.lastError,
  };
}
