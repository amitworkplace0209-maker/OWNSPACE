"use client";

/**
 * Which server action to replay a queued operation with.
 *
 * This is the only place that knows an entity's shape. `row-cache.ts` decides
 * *whether* an operation should be replayed; this file decides *what calling it
 * means*. Keeping the two apart is what lets one queueing implementation serve
 * every entity — and it means adding an entity is one entry here, not another
 * copy of the merge/prune/replay machinery.
 *
 * Every replay returns `{ error?: string }`, matching what the app's own actions
 * return. A returned error is a real answer from the server — the row is gone,
 * the value was rejected — so the caller drops the operation instead of retrying
 * it forever. Only a *thrown* error is treated as a network failure, and that
 * leaves the operation queued.
 */

import { setNoteFlagsAction, deleteNoteAction } from "@/lib/actions/notes";
import type { CachedRow, QueuedRowOp, RowOp } from "@/lib/offline/row-cache";

/** What a replay returns. An `error` is a rejection, not a failure to reach. */
export type ReplayResult = { error?: string };

/**
 * Rebuilds a FormData from a patch.
 *
 * The app's update actions were written for `useActionState`, which hands them
 * a whole form — and they parse it with a schema that demands every field. A
 * queued offline edit is a *partial*: someone starred a note without touching
 * its body, and replaying "title: 'asdf'" through a required-field schema would
 * be rejected for a missing content the user never meant to change.
 *
 * So a patch is turned into a FormData over the fields it names, and the
 * action is left to validate whatever it is given. Where an action cannot accept
 * a partial, the entity registers a `create` with the server's own defaults and
 * no entry is added — see `supportsOffline`.
 */
export function patchToFormData(patch: Record<string, unknown>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) {
      // `null` is a real edit — clearing a field — and a form cannot express it.
      // Sent as the empty string, which every field here treats as "cleared".
      form.append(key, "");
      continue;
    }
    if (typeof value === "boolean") {
      form.append(key, value ? "on" : "");
      continue;
    }
    if (Array.isArray(value)) {
      // Multi-value fields (tags) come back from a checkbox group as repeats.
      for (const entry of value) form.append(key, String(entry));
      continue;
    }
    form.append(key, String(value));
  }
  return form;
}

/** Replays one queued operation. */
export type ReplayFn = (op: QueuedRowOp) => Promise<ReplayResult>;

export type EntityReplay = {
  /**
   * Called after the server payload arrives, to fill in the row's fields that
   * the caller does not have — a join, a computed column.
   */
  hydrate?: (row: CachedRow, op: QueuedRowOp) => CachedRow;
  replay: Partial<Record<RowOp, ReplayFn>>;
  /**
   * Operations this entity genuinely supports offline.
   *
   * An empty or partial map is a feature, not a gap. An action that cannot
   * replay a partial edit is left out rather than wired up to something that
   * would silently write the wrong row.
   */
  supportsOffline?: RowOp[];
};

/**
 * The registry.
 *
 * Notes are the reference implementation. Only the two flags are wired, and
 * only because `setNoteFlagsAction` writes an absolute value — a replayed
 * *toggle* would invert whatever the server holds by the time the queue drains,
 * which is a worse outcome than not offering offline pin at all.
 *
 * Everything an app can replay needs that same property: a patch-shaped action
 * that converges. The form-driven editors — note body, wiki body, calendar event
 * fields — are absent on purpose, and adding them means writing that action for
 * each rather than reconstructing a whole form here and risking a stale title
 * over a fresh one.
 */
const REPLAYS: Record<string, EntityReplay> = {
  notes: {
    supportsOffline: ["update", "delete"],
    replay: {
      update: async (op) => {
        // Only the flags are forwarded. Anything else in the patch came from a
        // caller that has not earned an offline path yet, and is refused rather
        // than written blind.
        const flags: { is_pinned?: boolean; is_favorited?: boolean } = {};
        if (typeof op.patch.is_pinned === "boolean") flags.is_pinned = op.patch.is_pinned;
        if (typeof op.patch.is_favorited === "boolean") flags.is_favorited = op.patch.is_favorited;

        if (Object.keys(flags).length === 0) {
          return { error: "That note change cannot be sent while offline." };
        }
        return setNoteFlagsAction(op.rowId, flags);
      },
      delete: (op) => deleteNoteAction(op.rowId),
    },
  },
};

/**
 * Replays one operation, or explains why it cannot.
 *
 * The "not supported" case is reported as an error rather than thrown so the
 * caller drops the operation instead of retrying it forever — a write the app
 * has no way to perform will never become performable.
 */
export async function replayRowOp(op: QueuedRowOp): Promise<ReplayResult> {
  const entity = REPLAYS[op.entity];
  const fn = entity?.replay[op.op];
  if (!fn) {
    return { error: `${op.entity} does not support ${op.op} offline yet.` };
  }
  return fn(op);
}

/** Whether this entity has any offline support at all, for conditional UI. */
export function entitySupportsOffline(entity: string): boolean {
  const ops = REPLAYS[entity]?.supportsOffline ?? [];
  return ops.length > 0;
}