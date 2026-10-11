import { describe, expect, it } from "vitest";
import {
  applyOptimisticTask,
  CACHE_VERSION,
  enqueueMutation,
  isSnapshotUsable,
  isValidSnapshot,
  MAX_SNAPSHOT_AGE_MS,
  mergeServerTasks,
  mutationId,
  pruneStaleMutations,
  settleMutation,
  type CachedTask,
  type QueuedMutation,
} from "@/lib/offline/task-cache";

const NOW = Date.parse("2026-03-01T12:00:00.000Z");

function task(overrides: Partial<CachedTask> = {}): CachedTask {
  return {
    id: "t1",
    user_id: "u1",
    title: "Write the spec",
    description: null,
    project_id: "p1",
    phase_id: null,
    node_id: null,
    parent_task_id: null,
    status: "todo",
    priority: "medium",
    progress: 0,
    start_date: null,
    due_date: "2026-03-05",
    reminder_at: null,
    estimated_minutes: null,
    sort_order: 0,
    created_at: "2026-02-01T00:00:00.000Z",
    updated_at: "2026-02-20T00:00:00.000Z",
    project_name: "Apollo",
    project_color: "#6366f1",
    tag_names: [],
    ...overrides,
  };
}

function mutation(overrides: Partial<QueuedMutation> = {}): QueuedMutation {
  return {
    id: "m1",
    taskId: "t1",
    kind: "status",
    value: "done",
    queuedAt: "2026-02-28T00:00:00.000Z",
    attempts: 0,
    ...overrides,
  };
}

describe("isValidSnapshot", () => {
  it("accepts a well-formed snapshot", () => {
    expect(
      isValidSnapshot({
        userId: "u1",
        tasks: [task()],
        queue: [mutation()],
        cachedAt: "2026-03-01T00:00:00.000Z",
      })
    ).toBe(true);
  });

  it("rejects a snapshot with no user id", () => {
    expect(
      isValidSnapshot({
        userId: "",
        tasks: [],
        queue: [],
        cachedAt: "2026-03-01T00:00:00.000Z",
      })
    ).toBe(false);
  });

  it("rejects a row whose status is not a known one", () => {
    const broken = { ...task(), status: "nonsense" as CachedTask["status"] };
    expect(
      isValidSnapshot({
        userId: "u1",
        tasks: [broken],
        queue: [],
        cachedAt: "2026-03-01T00:00:00.000Z",
      })
    ).toBe(false);
  });

  it("rejects a row with no project, which the DAL never returns", () => {
    const broken = { ...task(), project_id: "" };
    expect(isValidSnapshot({ userId: "u1", tasks: [broken], queue: [], cachedAt: "now" })).toBe(
      false
    );
  });

  it("rejects non-objects", () => {
    expect(isValidSnapshot(null)).toBe(false);
    expect(isValidSnapshot("nope")).toBe(false);
  });
});

describe("isSnapshotUsable", () => {
  it("accepts a snapshot written moments ago", () => {
    const cachedAt = new Date(NOW - 60_000).toISOString();
    expect(isSnapshotUsable({ cachedAt }, NOW)).toBe(true);
  });

  it("rejects a snapshot older than the retention window", () => {
    const cachedAt = new Date(NOW - MAX_SNAPSHOT_AGE_MS - 1).toISOString();
    expect(isSnapshotUsable({ cachedAt }, NOW)).toBe(false);
  });

  it("accepts a snapshot written by a clock that moved backwards", () => {
    const cachedAt = new Date(NOW + 60_000).toISOString();
    expect(isSnapshotUsable({ cachedAt }, NOW)).toBe(true);
  });

  it("rejects an unparseable timestamp", () => {
    expect(isSnapshotUsable({ cachedAt: "not-a-date" }, NOW)).toBe(false);
  });
});

describe("applyOptimisticTask", () => {
  it("patches only the targeted row", () => {
    const rows = [task(), task({ id: "t2" })];
    const next = applyOptimisticTask(rows, { taskId: "t2", kind: "status", value: "done" });

    expect(next[0].status).toBe("todo");
    expect(next[1].status).toBe("done");
  });

  it("marks the row pending and never mutates the input", () => {
    const rows = [task()];
    const next = applyOptimisticTask(rows, { taskId: "t1", kind: "status", value: "done" });

    expect(next[0].pending).toBe(true);
    expect(rows[0].pending).toBeUndefined();
    expect(rows[0].status).toBe("todo");
  });

  it("ignores an invalid status rather than writing it", () => {
    const next = applyOptimisticTask([task()], {
      taskId: "t1",
      kind: "status",
      value: "sideways",
    });
    expect(next[0].status).toBe("todo");
  });

  it("clamps progress into 0..100", () => {
    expect(
      applyOptimisticTask([task()], { taskId: "t1", kind: "progress", value: 180 })[0].progress
    ).toBe(100);
    expect(
      applyOptimisticTask([task()], { taskId: "t1", kind: "progress", value: -5 })[0].progress
    ).toBe(0);
  });
});

describe("settleMutation", () => {
  it("clears the pending flag once the queue for that task is empty", () => {
    const tasks = [{ ...task(), pending: true }];
    const { tasks: next, queue } = settleMutation(tasks, [mutation()], "m1");

    expect(next[0].pending).toBe(false);
    expect(queue).toHaveLength(0);
  });

  it("keeps the row pending while another queued edit still targets it", () => {
    const tasks = [{ ...task(), pending: true }];
    const queue = [mutation(), mutation({ id: "m2", kind: "priority", value: "high" })];

    const result = settleMutation(tasks, queue, "m1");
    expect(result.tasks[0].pending).toBe(true);
    expect(result.queue).toHaveLength(1);
  });

  it("changes nothing when the id is not in the queue", () => {
    const tasks = [{ ...task(), pending: true }];
    const result = settleMutation(tasks, [mutation()], "nope");
    expect(result.tasks).toBe(tasks);
    expect(result.queue).toHaveLength(1);
  });
});

describe("pruneStaleMutations", () => {
  it("drops a mutation the server has since overtaken", () => {
    const rows = [task({ updated_at: "2026-03-01T00:00:00.000Z" })];
    const { queue, dropped } = pruneStaleMutations(rows, [mutation()], NOW);

    expect(queue).toHaveLength(0);
    expect(dropped).toHaveLength(1);
  });

  it("keeps a mutation newer than the server row", () => {
    const rows = [task({ updated_at: "2026-02-01T00:00:00.000Z" })];
    const { queue } = pruneStaleMutations(rows, [mutation()], NOW);

    expect(queue).toHaveLength(1);
  });

  it("drops a week-old intent rather than replaying it", () => {
    const rows = [task()];
    const stale = mutation({ queuedAt: new Date(NOW - MAX_SNAPSHOT_AGE_MS - 1).toISOString() });
    const { queue } = pruneStaleMutations(rows, [stale], NOW);

    expect(queue).toHaveLength(0);
  });
});

describe("mergeServerTasks", () => {
  it("takes the server value for a row with no queued edit", () => {
    const merged = mergeServerTasks(
      [{ ...task(), status: "done", pending: true }],
      [task({ status: "todo" })],
      []
    );
    expect(merged[0].status).toBe("todo");
    expect(merged[0].pending).toBe(false);
  });

  it("keeps the optimistic value for a row the server has not caught up on", () => {
    const merged = mergeServerTasks(
      [{ ...task(), status: "done", pending: true }],
      [task({ status: "todo" })],
      [mutation()]
    );
    expect(merged[0].status).toBe("done");
    expect(merged[0].pending).toBe(true);
  });

  it("applies queued edits newest-last on top of the server row", () => {
    const merged = mergeServerTasks(
      [],
      [task({ status: "todo", priority: "low" })],
      [
        mutation({ id: "m1", kind: "status", value: "done" }),
        mutation({ id: "m2", kind: "priority", value: "urgent" }),
      ]
    );
    expect(merged[0].status).toBe("done");
    expect(merged[0].priority).toBe("urgent");
  });

  it("keeps a queued row the filtered server payload did not return", () => {
    const merged = mergeServerTasks(
      [task({ id: "offline-only" })],
      [task()],
      [mutation({ taskId: "offline-only" })]
    );
    expect(merged.map((row) => row.id).sort()).toEqual(["offline-only", "t1"]);
  });
});

describe("enqueueMutation", () => {
  it("collapses a consecutive identical edit", () => {
    const queue = [mutation()];
    const next = enqueueMutation(queue, mutation({ id: "m2" }));
    expect(next).toHaveLength(1);
  });

  it("keeps a different value for the same field, because the last one wins", () => {
    const queue = [mutation({ value: "done" })];
    const next = enqueueMutation(queue, mutation({ id: "m2", value: "todo" }));
    expect(next).toHaveLength(2);
    expect(next[1].value).toBe("todo");
  });

  it("appends an edit to a different task", () => {
    const next = enqueueMutation([mutation()], mutation({ id: "m2", taskId: "t2" }));
    expect(next).toHaveLength(2);
  });
});

describe("mutationId", () => {
  it("is stable for the same edit", () => {
    expect(mutationId("t1", "status", "2026-03-01")).toBe(
      mutationId("t1", "status", "2026-03-01")
    );
  });

  it("differs per field and per task", () => {
    expect(mutationId("t1", "status", "x")).not.toBe(mutationId("t1", "priority", "x"));
    expect(mutationId("t1", "status", "x")).not.toBe(mutationId("t2", "status", "x"));
  });
});

describe("CACHE_VERSION", () => {
  it("is bumped whenever the stored shape changes", () => {
    expect(CACHE_VERSION).toBe(1);
  });
});
