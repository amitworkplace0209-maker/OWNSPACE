import { describe, expect, it } from "vitest";
import {
  applyOptimisticOp,
  enqueueRowOp,
  isSnapshotUsable,
  isValidQueuedOp,
  isValidSnapshot,
  mergeServerRows,
  MAX_SNAPSHOT_AGE_MS,
  parseRowCacheKey,
  pruneStaleOps,
  rowCacheKey,
  rowOpId,
  settleOp,
  type CachedRow,
  type QueuedRowOp,
  type RowCacheSnapshot,
} from "@/lib/offline/row-cache";

/**
 * Stands in for a per-entity validator. The point of these tests is the shared
 * machinery, not any one entity's shape.
 */
function isRow(value: unknown): value is CachedRow {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as CachedRow).id === "string" &&
      (value as CachedRow).id
  );
}

function row(over: Partial<CachedRow> & { id: string }): CachedRow {
  return { updated_at: "2026-01-01T00:00:00.000Z", ...over };
}

function op(over: Partial<QueuedRowOp> = {}): QueuedRowOp {
  return {
    id: "notes:update:n1:2026-01-02T00:00:00.000Z",
    entity: "notes",
    op: "update",
    rowId: "n1",
    patch: {},
    queuedAt: "2026-01-02T00:00:00.000Z",
    attempts: 0,
    ...over,
  };
}

describe("rowCacheKey", () => {
  it("round-trips through parse", () => {
    const key = rowCacheKey("user-1", "notes");
    expect(parseRowCacheKey(key)).toEqual({ userId: "user-1", entity: "notes" });
  });

  it("keeps an entity name containing a colon intact", () => {
    // Only the first colon separates; `finance:transactions` is one entity.
    expect(parseRowCacheKey(rowCacheKey("u1", "finance:transactions"))).toEqual({
      userId: "u1",
      entity: "finance:transactions",
    });
  });

  it("gives two accounts two different keys", () => {
    expect(rowCacheKey("a", "notes")).not.toBe(rowCacheKey("b", "notes"));
  });

  it.each(["", ":notes", "user-1:", ":"])("rejects %o as malformed", (key) => {
    expect(parseRowCacheKey(key)).toBeNull();
  });
});

describe("isSnapshotUsable", () => {
  const now = Date.parse("2026-01-10T00:00:00.000Z");

  it("accepts a fresh snapshot", () => {
    expect(isSnapshotUsable({ cachedAt: new Date(now - 1000).toISOString() }, now)).toBe(true);
  });

  it("rejects one older than the retention window", () => {
    expect(
      isSnapshotUsable({ cachedAt: new Date(now - MAX_SNAPSHOT_AGE_MS - 1).toISOString() }, now)
    ).toBe(false);
  });

  it("accepts one exactly at the window, so the boundary is not surprising", () => {
    expect(
      isSnapshotUsable({ cachedAt: new Date(now - MAX_SNAPSHOT_AGE_MS).toISOString() }, now)
    ).toBe(true);
  });

  it("rejects an unparseable timestamp rather than treating it as fresh", () => {
    expect(isSnapshotUsable({ cachedAt: "not a date" }, now)).toBe(false);
  });
});

describe("isValidSnapshot", () => {
  const good: RowCacheSnapshot = {
    userId: "u1",
    entity: "notes",
    rows: [row({ id: "n1" })],
    queue: [],
    cachedAt: "2026-01-01T00:00:00.000Z",
  };

  it("accepts a well-formed snapshot", () => {
    expect(isValidSnapshot(good, isRow)).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "nope"],
    ["a missing userId", { ...good, userId: "" }],
    ["a missing entity", { ...good, entity: undefined }],
    ["non-array rows", { ...good, rows: {} }],
    ["non-array queue", { ...good, queue: null }],
    ["a missing cachedAt", { ...good, cachedAt: undefined }],
  ])("rejects %s", (_label, value) => {
    expect(isValidSnapshot(value, isRow)).toBe(false);
  });

  it("rejects the whole snapshot when one row fails the entity validator", () => {
    expect(isValidSnapshot({ ...good, rows: [row({ id: "n1" }), { id: "" }] }, isRow)).toBe(false);
  });

  it("rejects a queue entry that is not a well-formed operation", () => {
    expect(isValidSnapshot({ ...good, queue: [{ id: "x" }] }, isRow)).toBe(false);
  });

  it("accepts a row with no updated_at, which an offline create produces", () => {
    expect(
      isValidSnapshot({ ...good, rows: [{ id: "n1", title: "Written on a train" }] }, isRow)
    ).toBe(true);
  });
});

describe("isValidQueuedOp", () => {
  it("accepts each operation kind", () => {
    for (const kind of ["create", "update", "delete"] as const) {
      expect(isValidQueuedOp(op({ op: kind }))).toBe(true);
    }
  });

  it.each(["patch", "upsert", "", null, undefined])("rejects op %o", (value) => {
    expect(isValidQueuedOp(op({ op: value as QueuedRowOp["op"] }))).toBe(false);
  });

  it("rejects an unparseable queuedAt", () => {
    expect(isValidQueuedOp(op({ queuedAt: "whenever" }))).toBe(false);
  });

  it("rejects a missing attempts counter", () => {
    expect(isValidQueuedOp(op({ attempts: undefined as unknown as number }))).toBe(false);
  });
});

describe("applyOptimisticOp", () => {
  const rows = [row({ id: "n1", title: "Old" })];

  it("patches a row and marks it pending", () => {
    expect(applyOptimisticOp(rows, { op: "update", rowId: "n1", patch: { title: "New" } })).toEqual([
      { id: "n1", title: "New", updated_at: rows[0].updated_at, pending: true },
    ]);
  });

  it("appends a created row rather than dropping it", () => {
    const result = applyOptimisticOp(rows, {
      op: "create",
      rowId: "n2",
      patch: { title: "Written offline" },
    });
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: "n2", title: "Written offline", pending: true });
  });

  it("does not append a second copy when a create is re-queued", () => {
    const once = applyOptimisticOp(rows, { op: "create", rowId: "n2", patch: { title: "A" } });
    const twice = applyOptimisticOp(once, { op: "create", rowId: "n2", patch: { title: "B" } });
    expect(twice).toHaveLength(2);
    expect(twice[1]).toMatchObject({ id: "n2", title: "B" });
  });

  it("removes a deleted row", () => {
    expect(applyOptimisticOp(rows, { op: "delete", rowId: "n1", patch: {} })).toEqual([]);
  });

  it("leaves other rows untouched, by identity", () => {
    const others = [row({ id: "n1" }), row({ id: "n2" })];
    const result = applyOptimisticOp(others, { op: "update", rowId: "n1", patch: { x: 1 } });
    expect(result[1]).toBe(others[1]);
  });

  it("does not mutate the input array", () => {
    const original = [row({ id: "n1", title: "Old" })];
    applyOptimisticOp(original, { op: "update", rowId: "n1", patch: { title: "New" } });
    expect(original[0].title).toBe("Old");
  });
});

describe("mergeServerRows", () => {
  it("takes the server row when nothing is queued for it", () => {
    const result = mergeServerRows([], [row({ id: "n1", title: "Server" })], []);
    expect(result[0]).toMatchObject({ title: "Server", pending: false });
  });

  it("keeps the optimistic value for a row with a queued edit", () => {
    const queued = op({ patch: { title: "Mine" } });
    const result = mergeServerRows([], [row({ id: "n1", title: "Server" })], [queued]);
    // Without this the row flickers back to "Server" between the response and
    // the replay, which reads as the app undoing what the user just typed.
    expect(result[0]).toMatchObject({ title: "Mine", pending: true });
  });

  it("replays several queued edits in order, not just the newest", () => {
    const queue = [op({ patch: { title: "First" } }), op({ patch: { starred: true } })];
    const result = mergeServerRows([], [row({ id: "n1" })], queue);
    expect(result[0]).toMatchObject({ title: "First", starred: true });
  });

  it("keeps a queued offline create the server has not seen", () => {
    const result = mergeServerRows(
      [row({ id: "n2", title: "Offline", pending: true })],
      [row({ id: "n1" })],
      [op({ op: "create", rowId: "n2" })]
    );
    expect(result.map((r) => r.id).sort()).toEqual(["n1", "n2"]);
  });

  it("keeps a cached row the server has not sent while something is still queued", () => {
    const cached = [row({ id: "n9", title: "Written offline", pending: true })];
    const result = mergeServerRows(cached, [row({ id: "n1" })], [op({ rowId: "n9" })]);
    expect(result.map((r) => r.id).sort()).toEqual(["n1", "n9"]);
  });

  it("drops a cached row the server omitted with nothing queued against it", () => {
    // The payload is the complete list for this view. Keeping omitted rows would
    // mean a note deleted on another device lived on this one forever.
    const cached = [row({ id: "n9" })];
    const result = mergeServerRows(cached, [row({ id: "n1" })], []);
    expect(result.map((r) => r.id)).toEqual(["n1"]);
  });

  it("does not re-add a row whose delete is still queued", () => {
    // Without this a note deleted on the train reappears the moment any
    // unrelated write refreshes the page.
    const result = mergeServerRows([], [row({ id: "n1" })], [op({ op: "delete", rowId: "n1" })]);
    expect(result).toEqual([]);
  });
});

describe("pruneStaleOps", () => {
  // `now` and every `queuedAt` below sit inside the retention window. An earlier
  // draft spread them eight days apart, which tested the age rule by accident
  // rather than the staleness rule it claimed to.
  const now = Date.parse("2026-01-10T00:00:00.000Z");
  const fresh = "2026-01-09T00:00:00.000Z";
  const older = "2026-01-08T00:00:00.000Z";

  it("keeps an operation the server has not overtaken", () => {
    const rows = [row({ id: "n1", updated_at: older })];
    expect(pruneStaleOps(rows, [op({ queuedAt: fresh })], now).queue).toHaveLength(1);
  });

  it("drops an operation the server has since overtaken", () => {
    const rows = [row({ id: "n1", updated_at: fresh })];
    const result = pruneStaleOps(rows, [op({ queuedAt: older })], now);
    expect(result.queue).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it("keeps an operation at exactly the server's timestamp, treating it as a tie", () => {
    const rows = [row({ id: "n1", updated_at: fresh })];
    expect(pruneStaleOps(rows, [op({ queuedAt: fresh })], now).queue).toHaveLength(1);
  });

  it("never prunes a create, which no server row can overtake", () => {
    const rows = [row({ id: "n2", updated_at: "2030-01-01T00:00:00.000Z" })];
    expect(
      pruneStaleOps(rows, [op({ op: "create", rowId: "n2", queuedAt: older })], now).queue
    ).toHaveLength(1);
  });

  it("discards an intent older than the retention window", () => {
    const stale = new Date(now - MAX_SNAPSHOT_AGE_MS - 1).toISOString();
    expect(pruneStaleOps([], [op({ queuedAt: stale })], now).dropped).toHaveLength(1);
  });

  it("keeps a delete whose row the server has not touched since", () => {
    const rows = [row({ id: "n1", updated_at: older })];
    expect(pruneStaleOps(rows, [op({ op: "delete", queuedAt: fresh })], now).queue).toHaveLength(1);
  });
});

describe("settleOp", () => {
  const rows = [row({ id: "n1", title: "Mine", pending: true })];

  it("clears pending once nothing else targets the row", () => {
    const target = op({ id: "a" });
    const result = settleOp(rows, [target], "a");
    expect(result.rows[0].pending).toBe(false);
    expect(result.queue).toHaveLength(0);
  });

  it("keeps pending while another queued operation still targets the row", () => {
    const queue = [op({ id: "a" }), op({ id: "b" })];
    const result = settleOp(rows, queue, "a");
    expect(result.queue.map((o) => o.id)).toEqual(["b"]);
    expect(result.rows[0].pending).toBe(true);
  });

  it("removes an unknown id without touching the rows", () => {
    const result = settleOp(rows, [op({ id: "a" })], "nope");
    expect(result.queue).toHaveLength(1);
    expect(result.rows[0].pending).toBe(true);
  });

  it("does not mutate the rows it was given", () => {
    const original = [row({ id: "n1", pending: true })];
    settleOp(original, [op({ id: "a" })], "a");
    expect(original[0].pending).toBe(true);
  });
});

describe("enqueueRowOp", () => {
  it("appends", () => {
    expect(enqueueRowOp([], op({ id: "a" }))).toHaveLength(1);
  });

  it("collapses a consecutive identical delete rather than sending it twice", () => {
    const queue = enqueueRowOp([op({ id: "a", op: "delete" })], op({ id: "b", op: "delete" }));
    expect(queue).toHaveLength(1);
  });

  it("never collapses an update, because two edits may touch different fields", () => {
    const first = op({ id: "a", patch: { title: "A" } });
    const second = op({ id: "b", patch: { starred: true } });
    expect(enqueueRowOp([first], second)).toHaveLength(2);
  });

  it("keeps a create when a previous create for the row is still queued", () => {
    const queue = enqueueRowOp(
      [op({ id: "a", op: "create", rowId: "n2", patch: { title: "A" } })],
      op({ id: "b", op: "create", rowId: "n2", patch: { title: "B" } })
    );
    expect(queue).toHaveLength(2);
  });
});

describe("rowOpId", () => {
  it("is deterministic, so a retried replay cannot queue twice", () => {
    const first = rowOpId("notes", "update", "n1", "2026-01-02T00:00:00.000Z");
    const second = rowOpId("notes", "update", "n1", "2026-01-02T00:00:00.000Z");
    expect(first).toBe(second);
  });

  it("differs by entity, operation and row", () => {
    const base = rowOpId("notes", "update", "n1", "t");
    expect(rowOpId("wiki", "update", "n1", "t")).not.toBe(base);
    expect(rowOpId("notes", "delete", "n1", "t")).not.toBe(base);
    expect(rowOpId("notes", "update", "n2", "t")).not.toBe(base);
  });
});