import type { Project, Reminder } from "@/types";

/**
 * Offline reminder cache — pure logic.
 *
 * Follows the same three rules as `task-cache.ts`, deliberately:
 *
 *  1. **Never store credentials.** Auth stays in Supabase's own storage; this
 *     cache holds reminder and project rows only, namespaced by user id.
 *  2. **Newer data wins.** Every row carries `updated_at`, so a queued offline
 *     edit is dropped rather than replayed when the server has since sent a
 *     newer version — an edit made on the phone never clobbers a newer edit
 *     made on the laptop.
 *  3. **Projects ride along.** A reminder row is not useful offline without its
 *     project name and colour, so the snapshot stores the projects the user can
 *     filter by rather than making the offline page fetch them.
 *
 * The IndexedDB plumbing lives in `reminder-cache.client.ts`.
 */

/** A reminder plus the joined project fields the list renders. */
export type CachedReminder = Reminder & {
  project_name: string | null;
  project_color: string | null;
  /**
   * Set while the row differs from the server because of a queued offline edit.
   * Cleared once the server confirms it.
   */
  pending?: boolean;
};

/** The slice of a project the reminders list needs to render offline. */
export type CachedProject = Pick<
  Project,
  "id" | "name" | "color" | "status" | "icon" | "is_pinned" | "is_favorite"
>;

/**
 * Queued offline edits.
 *
 * `create` carries the whole row because there is no server row to patch yet;
 * every other kind is a field change against an existing id.
 */
export type QueuedReminderMutation = {
  id: string;
  reminderId: string;
  kind: "complete" | "snooze" | "unsnooze" | "enabled" | "delete" | "create" | "update";
  /** A field value for most kinds; the full row for `create`. */
  value: string | number | boolean | Partial<CachedReminder>;
  /** When the user made the change — compared against the row's `updated_at`. */
  queuedAt: string;
  attempts: number;
};

export type ReminderCacheSnapshot = {
  userId: string;
  reminders: CachedReminder[];
  projects: CachedProject[];
  queue: QueuedReminderMutation[];
  cachedAt: string;
};

export const REMINDER_CACHE_VERSION = 1;

/** Snapshots older than this are ignored rather than shown as current. */
export const MAX_SNAPSHOT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const REMINDER_STATUSES = ["pending", "triggered", "dismissed", "snoozed"] as const;
const PRIORITY_VALUES = ["none", "low", "medium", "high", "urgent"] as const;

export function isSnapshotUsable(
  snapshot: Pick<ReminderCacheSnapshot, "cachedAt">,
  now: number
): boolean {
  const at = Date.parse(snapshot.cachedAt);
  if (Number.isNaN(at)) return false;
  if (now - at > MAX_SNAPSHOT_AGE_MS) return false;
  return true;
}

/** Guards against a corrupted or hand-edited record reaching the UI. */
export function isValidSnapshot(value: unknown): value is ReminderCacheSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ReminderCacheSnapshot>;
  if (typeof snapshot.userId !== "string" || !snapshot.userId) return false;
  if (!Array.isArray(snapshot.reminders)) return false;
  if (!Array.isArray(snapshot.queue)) return false;
  if (typeof snapshot.cachedAt !== "string") return false;
  if (snapshot.projects !== undefined && !Array.isArray(snapshot.projects)) return false;
  return snapshot.reminders.every(isValidReminder);
}

export function isValidReminder(value: unknown): value is CachedReminder {
  if (!value || typeof value !== "object") return false;
  const reminder = value as Partial<CachedReminder>;
  if (typeof reminder.id !== "string" || !reminder.id) return false;
  if (typeof reminder.title !== "string") return false;
  if (typeof reminder.remind_at !== "string") return false;
  if (typeof reminder.updated_at !== "string") return false;
  if (typeof reminder.is_enabled !== "boolean") return false;
  if (!REMINDER_STATUSES.includes(reminder.status as (typeof REMINDER_STATUSES)[number])) {
    return false;
  }
  if (!PRIORITY_VALUES.includes(reminder.priority as (typeof PRIORITY_VALUES)[number])) {
    return false;
  }
  if (!Array.isArray(reminder.notification_channels)) return false;
  if (!Array.isArray(reminder.repeat_days)) return false;
  return true;
}

/** Statuses a completed/reopened cycle can move between. */
const DONE_STATUS: Record<"complete", CachedReminder["status"]> = {
  complete: "dismissed",
};

/**
 * Applies a queued mutation to cached rows.
 *
 * `delete` removes the row outright rather than flagging it, because a deleted
 * reminder that is still rendered with a "deleting" badge is worse than one
 * that is simply gone until the server confirms.
 */
export function applyOptimisticReminder(
  reminders: CachedReminder[],
  mutation: Pick<QueuedReminderMutation, "reminderId" | "kind" | "value">
): CachedReminder[] {
  if (mutation.kind === "delete") {
    return reminders.filter((reminder) => reminder.id !== mutation.reminderId);
  }

  if (mutation.kind === "create") {
    const row = mutation.value as CachedReminder;
    if (!row || typeof row.id !== "string") return reminders;
    return [{ ...row, pending: true }, ...reminders.filter((r) => r.id !== row.id)];
  }

  return reminders.map((reminder) => {
    if (reminder.id !== mutation.reminderId) return reminder;
    return { ...reminder, ...patchFor(reminder, mutation), pending: true };
  });
}

function patchFor(
  reminder: CachedReminder,
  mutation: Pick<QueuedReminderMutation, "kind" | "value">
): Partial<CachedReminder> {
  switch (mutation.kind) {
    case "complete":
      return {
        status: DONE_STATUS.complete,
        snoozed_until: null,
      };
    case "snooze": {
      const until = String(mutation.value);
      // Snooze never overwrites `remind_at` — that is what makes "restore"
      // possible — so only the status and the push-out time change.
      return { status: "snoozed", snoozed_until: until };
    }
    case "unsnooze":
      return { status: "pending", snoozed_until: null };
    case "enabled":
      return { is_enabled: Boolean(mutation.value) };
    case "update":
      return mutation.value as Partial<CachedReminder>;
    default:
      return {};
  }
}

/**
 * Drops a replayed mutation from the queue and clears the pending flag.
 *
 * A row stays `pending` while another queued edit still targets it, so
 * replaying a completion does not make a queued snooze look saved.
 */
export function settleMutation(
  reminders: CachedReminder[],
  queue: QueuedReminderMutation[],
  mutationId: string
): { reminders: CachedReminder[]; queue: QueuedReminderMutation[] } {
  const settled = queue.find((entry) => entry.id === mutationId);
  const nextQueue = queue.filter((entry) => entry.id !== mutationId);
  if (!settled) return { reminders, queue: nextQueue };

  const stillQueued = nextQueue.some((entry) => entry.reminderId === settled.reminderId);
  if (stillQueued) return { reminders, queue: nextQueue };

  return {
    reminders: reminders.map((reminder) =>
      reminder.id === settled.reminderId && reminder.pending
        ? { ...reminder, pending: false }
        : reminder
    ),
    queue: nextQueue,
  };
}

/**
 * Decides which queued mutations are still worth sending.
 *
 * A create is never stale — it has no server row to be overtaken by. Everything
 * else is dropped when the server has since sent a newer `updated_at`, which is
 * the "newer data wins" rule.
 */
export function pruneStaleMutations(
  reminders: CachedReminder[],
  queue: QueuedReminderMutation[],
  now: number
): { queue: QueuedReminderMutation[]; dropped: QueuedReminderMutation[] } {
  const byId = new Map(reminders.map((reminder) => [reminder.id, reminder]));
  const kept: QueuedReminderMutation[] = [];
  const dropped: QueuedReminderMutation[] = [];

  for (const mutation of queue) {
    if (mutation.kind === "create") {
      kept.push(mutation);
      continue;
    }
    const reminder = byId.get(mutation.reminderId);
    if (reminder && Date.parse(reminder.updated_at) > Date.parse(mutation.queuedAt)) {
      dropped.push(mutation);
    } else if (now - Date.parse(mutation.queuedAt) > MAX_SNAPSHOT_AGE_MS) {
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
 * Server rows win, except where a queued edit has not been acknowledged yet —
 * those keep the optimistic value so a row does not flicker back to its old
 * state between the server response and the replay. A queued delete keeps the
 * row hidden even though the server still sent it, because the user deleted it
 * and the server simply has not been told yet.
 */
export function mergeServerReminders(
  cached: CachedReminder[],
  incoming: CachedReminder[],
  queue: QueuedReminderMutation[]
): CachedReminder[] {
  const queuedByReminder = new Map<string, QueuedReminderMutation[]>();
  for (const mutation of queue) {
    const list = queuedByReminder.get(mutation.reminderId) ?? [];
    list.push(mutation);
    queuedByReminder.set(mutation.reminderId, list);
  }

  const merged: CachedReminder[] = [];

  for (const reminder of incoming) {
    const pending = queuedByReminder.get(reminder.id) ?? [];

    if (pending.some((mutation) => mutation.kind === "delete")) continue;

    if (pending.length === 0) {
      merged.push({ ...reminder, pending: false });
      continue;
    }

    // Replay the queued edits on top of the server row so the optimistic value
    // survives, with the newest edit applied last.
    merged.push(
      pending.reduce<CachedReminder>(
        (current, mutation) => ({ ...current, ...patchFor(current, mutation), pending: true }),
        { ...reminder }
      )
    );
  }

  // Keep rows the server has not sent yet — queued offline creates, or rows a
  // filter excluded. Dropping them would make a reminder vanish the moment it
  // stopped matching the filter.
  const incomingIds = new Set(incoming.map((reminder) => reminder.id));
  for (const reminder of cached) {
    if (incomingIds.has(reminder.id)) continue;
    const pending = queuedByReminder.get(reminder.id) ?? [];
    if (pending.length === 0) continue;
    if (pending.some((mutation) => mutation.kind === "delete")) continue;
    merged.push(reminder);
  }

  return merged;
}

/** A stable id, so a retried replay is not enqueued twice. */
export function reminderMutationId(
  reminderId: string,
  kind: string,
  queuedAt: string
): string {
  return `${reminderId}:${kind}:${queuedAt}`;
}

/**
 * Appends a mutation, collapsing an identical one that is already queued.
 *
 * Snoozing the same reminder twice offline should send one write; snoozing to
 * two *different* times must keep both, because only the last has meaning but
 * dropping the first would lose the intent if the tab closes in between.
 */
export function enqueueMutation(
  queue: QueuedReminderMutation[],
  mutation: QueuedReminderMutation
): QueuedReminderMutation[] {
  const previous = queue[queue.length - 1];
  if (
    previous &&
    previous.reminderId === mutation.reminderId &&
    previous.kind === mutation.kind &&
    previous.value === mutation.value
  ) {
    return queue;
  }
  return [...queue, mutation];
}

/**
 * Projects that the offline list can still name.
 *
 * Only projects that are safe to show are kept: an archived project is history,
 * and rendering one as a live filter option would be misleading.
 */
export function cacheableProjects(projects: CachedProject[]): CachedProject[] {
  return projects.filter((project) => project.status !== "archived");
}