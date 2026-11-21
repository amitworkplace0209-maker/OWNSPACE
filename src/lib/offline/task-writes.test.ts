import { describe, expect, it } from "vitest";
import {
  applyOptimisticWrite,
  failedWriteCount,
  localTaskFromPatch,
  mergeServerTaskWrites,
  pruneStaleWrites,
  settleWrite,
  writeId,
  type CachedTask,
  type QueuedWrite,
} from "@/lib/offline/task-cache";
import { deriveSyncPhase, formatLastSync } from "@/lib/offline/sync-status";

const NOW = "2026-01-01T12:00:00.000Z";

function task(id: string, updatedAt = "2026-01-01T11:00:00.000Z"): CachedTask {
  return {
    id,
    user_id: "user-1",
    title: `Task ${id}`,
    description: null,
    project_id: "project-1",
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
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: updatedAt,
    project_name: "Project",
    project_color: null,
    tag_names: [],
  };
}

function write(op: QueuedWrite["op"], taskId: string, patch: Partial<CachedTask> = {}, at = NOW): QueuedWrite {
  return { id: writeId(op, taskId, at), op, taskId, patch, queuedAt: at, attempts: 0 };
}

describe("whole-row offline task writes", () => {
  it("creates a local row with the permanent server id", () => {
    const created = localTaskFromPatch("user-1", "local-id", { title: "Offline task" }, NOW);
    expect(created.id).toBe("local-id");
    expect(created.user_id).toBe("user-1");
    expect(created.title).toBe("Offline task");
    expect(created.status).toBe("todo");
    expect(created.pending).toBe(true);
  });

  it("applies create, update and delete to the cached list", () => {
    const existing = [task("a")];
    expect(applyOptimisticWrite(existing, { op: "create", taskId: "b", patch: task("b") })).toHaveLength(2);
    expect(
      applyOptimisticWrite(existing, { op: "update", taskId: "a", patch: { title: "Renamed" } })[0].title
    ).toBe("Renamed");
    expect(applyOptimisticWrite(existing, { op: "delete", taskId: "a", patch: {} })).toHaveLength(0);
  });

  it("keeps a row pending until every write targeting it is settled", () => {
    const writes = [
      write("update", "a", { title: "First" }),
      write("update", "a", { title: "Second" }, "2026-01-01T12:00:01.000Z"),
    ];
    const rows = [task("a")].map((row) =>
      applyOptimisticWrite([row], writes[0])[0]
    );

    const first = settleWrite(rows, writes, writes[0].id);
    expect(first.writes).toHaveLength(1);
    expect(first.tasks[0].pending).toBe(true);

    const second = settleWrite(first.tasks, first.writes, writes[1].id);
    expect(second.writes).toHaveLength(0);
    expect(second.tasks[0].pending).toBe(false);
  });

  it("drops an edit the server has already overtaken but keeps an offline create", () => {
    const writes = [write("update", "a", { title: "Old" }), write("create", "b", task("b"))];
    const serverRows = [task("a", "2026-01-01T13:00:00.000Z")];
    const result = pruneStaleWrites(serverRows, writes, Date.parse("2026-01-01T14:00:00.000Z"));

    expect(result.dropped.map((entry) => entry.op)).toEqual(["update"]);
    expect(result.writes.map((entry) => entry.op)).toEqual(["create"]);
  });

  it("retains a locally created row until its create is acknowledged", () => {
    const created = localTaskFromPatch("user-1", "local-id", { title: "Offline" }, NOW);
    const pending = [write("create", "local-id", created)];
    const merged = mergeServerTaskWrites([created], [], pending);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("Offline");

    expect(mergeServerTaskWrites([created], [], [])).toHaveLength(0);
  });

  it("counts only writes the server rejected", () => {
    const writes = [write("create", "a"), { ...write("create", "b"), lastError: "Rejected" }];
    expect(failedWriteCount(writes)).toBe(1);
  });

  it("uses a stable id so a retried replay is not enqueued twice", () => {
    expect(writeId("create", "same", NOW)).toBe(writeId("create", "same", NOW));
    expect(writeId("create", "same", NOW)).not.toBe(writeId("update", "same", NOW));
  });
});

describe("sync phase", () => {
  const base = {
    online: true,
    syncing: false,
    pending: 0,
    failed: 0,
    lastSuccessAt: null,
    lastError: null,
  };

  it("reports offline first, then failures, then pending work", () => {
    expect(deriveSyncPhase({ ...base, online: false, pending: 3 })).toBe("offline");
    expect(deriveSyncPhase({ ...base, failed: 1, pending: 2 })).toBe("error");
    expect(deriveSyncPhase({ ...base, pending: 2 })).toBe("pending");
    expect(deriveSyncPhase({ ...base, syncing: true, pending: 1 })).toBe("syncing");
    expect(deriveSyncPhase({ ...base, lastSuccessAt: NOW })).toBe("synced");
    expect(deriveSyncPhase(base)).toBe("online");
  });

  it("formats a last-sync time without ever returning a raw timestamp", () => {
    expect(formatLastSync(null)).toBeNull();
    expect(formatLastSync("not-a-date")).toBeNull();
    expect(formatLastSync(NOW, Date.parse(NOW) + 5 * 60_000)).toBe("5m ago");
    expect(formatLastSync(NOW, Date.parse(NOW) + 2 * 60 * 60_000)).toBe("2h ago");
  });
});
