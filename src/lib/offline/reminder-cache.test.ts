import { describe, expect, it } from "vitest";
import {
  applyOptimisticReminder,
  cacheableProjects,
  enqueueMutation,
  isSnapshotUsable,
  isValidReminder,
  isValidSnapshot,
  mergeServerReminders,
  pruneStaleMutations,
  reminderMutationId,
  settleMutation,
  type CachedProject,
  type CachedReminder,
  type QueuedReminderMutation,
} from "@/lib/offline/reminder-cache";

const OLD = "2026-03-01T00:00:00.000Z";
const NEW = "2026-03-10T00:00:00.000Z";

function reminder(over: Partial<CachedReminder> = {}): CachedReminder {
  return {
    id: "r1",
    user_id: "u1",
    project_id: null,
    task_id: null,
    node_id: null,
    checklist_id: null,
    note_id: null,
    title: "Ping vendor",
    note: null,
    description: null,
    remind_at: "2026-03-12T09:00:00.000Z",
    snoozed_until: null,
    status: "pending",
    priority: "none",
    repeat_rule: "none",
    repeat_interval: null,
    repeat_until: null,
    repeat_days: [],
    notification_channels: ["in_app"],
    snooze_minutes: null,
    sound: null,
    is_enabled: true,
    advance_minutes: 0,
    created_at: OLD,
    updated_at: OLD,
    project_name: null,
    project_color: null,
    ...over,
  };
}

function mutation(over: Partial<QueuedReminderMutation> = {}): QueuedReminderMutation {
  return {
    id: "m1",
    reminderId: "r1",
    kind: "complete",
    value: "",
    queuedAt: NEW,
    attempts: 0,
    ...over,
  };
}

describe("isValidReminder", () => {
  it("accepts a well-formed row", () => {
    expect(isValidReminder(reminder())).toBe(true);
  });

  it("rejects rows missing the fields the list renders", () => {
    expect(isValidReminder(null)).toBe(false);
    expect(isValidReminder({ ...reminder(), id: "" })).toBe(false);
    expect(isValidReminder({ ...reminder(), remind_at: undefined })).toBe(false);
    expect(isValidReminder({ ...reminder(), updated_at: 123 })).toBe(false);
  });

  it("rejects an unknown status or priority", () => {
    expect(isValidReminder({ ...reminder(), status: "exploded" })).toBe(false);
    expect(isValidReminder({ ...reminder(), priority: "catastrophic" })).toBe(false);
  });
});

describe("isValidSnapshot", () => {
  const snapshot = {
    userId: "u1",
    reminders: [reminder()],
    projects: [],
    queue: [],
    cachedAt: NEW,
  };

  it("accepts a well-formed snapshot", () => {
    expect(isValidSnapshot(snapshot)).toBe(true);
  });

  it("rejects junk and mismatched collections", () => {
    expect(isValidSnapshot(null)).toBe(false);
    expect(isValidSnapshot({ ...snapshot, reminders: "nope" })).toBe(false);
    expect(isValidSnapshot({ ...snapshot, userId: "" })).toBe(false);
    expect(isValidSnapshot({ ...snapshot, reminders: [{}] })).toBe(false);
  });
});

describe("isSnapshotUsable", () => {
  const now = Date.parse(NEW);

  it("accepts a fresh snapshot", () => {
    expect(isSnapshotUsable({ cachedAt: NEW }, now)).toBe(true);
  });

  it("rejects one older than the retention window", () => {
    const old = new Date(now - 8 * 24 * 60 * 60_000).toISOString();
    expect(isSnapshotUsable({ cachedAt: old }, now)).toBe(false);
  });

  it("rejects an unparseable timestamp", () => {
    expect(isSnapshotUsable({ cachedAt: "whenever" }, now)).toBe(false);
  });

  it("does not reject a snapshot written moments ago by a rewound clock", () => {
    const future = new Date(now + 60_000).toISOString();
    expect(isSnapshotUsable({ cachedAt: future }, now)).toBe(true);
  });
});

describe("applyOptimisticReminder", () => {
  it("marks a completion as dismissed and clears the snooze", () => {
    const next = applyOptimisticReminder(
      [reminder({ snoozed_until: "2026-03-12T10:00:00.000Z" })],
      { reminderId: "r1", kind: "complete", value: "" }
    );
    expect(next[0].status).toBe("dismissed");
    expect(next[0].snoozed_until).toBeNull();
    expect(next[0].pending).toBe(true);
  });

  it("snoozes without destroying the original time", () => {
    const original = reminder();
    const next = applyOptimisticReminder([original], {
      reminderId: "r1",
      kind: "snooze",
      value: "2026-03-12T11:00:00.000Z",
    });
    expect(next[0].status).toBe("snoozed");
    expect(next[0].snoozed_until).toBe("2026-03-12T11:00:00.000Z");
    // The whole point of a separate column: restore still knows the original.
    expect(next[0].remind_at).toBe(original.remind_at);
  });

  it("restores a snoozed row to pending", () => {
    const next = applyOptimisticReminder(
      [reminder({ status: "snoozed", snoozed_until: "2026-03-12T11:00:00.000Z" })],
      { reminderId: "r1", kind: "unsnooze", value: "" }
    );
    expect(next[0].status).toBe("pending");
    expect(next[0].snoozed_until).toBeNull();
  });

  it("toggles enabled", () => {
    const next = applyOptimisticReminder([reminder()], {
      reminderId: "r1",
      kind: "enabled",
      value: false,
    });
    expect(next[0].is_enabled).toBe(false);
  });

  it("removes a deleted row outright rather than leaving a ghost", () => {
    const next = applyOptimisticReminder(
      [reminder(), reminder({ id: "r2" })],
      { reminderId: "r1", kind: "delete", value: "" }
    );
    expect(next.map((r) => r.id)).toEqual(["r2"]);
  });

  it("prepends an offline create and marks it pending", () => {
    const created = reminder({ id: "new", title: "Buy milk", pending: undefined });
    const next = applyOptimisticReminder([reminder()], {
      reminderId: "new",
      kind: "create",
      value: created,
    });
    expect(next.map((r) => r.id)).toEqual(["new", "r1"]);
    expect(next[0].pending).toBe(true);
  });

  it("ignores a create whose payload is not a row", () => {
    const rows = [reminder()];
    expect(applyOptimisticReminder(rows, { reminderId: "x", kind: "create", value: {} })).toEqual(rows);
  });

  it("leaves other rows untouched", () => {
    const next = applyOptimisticReminder(
      [reminder(), reminder({ id: "r2", title: "Other" })],
      { reminderId: "r1", kind: "complete", value: "" }
    );
    expect(next[1].title).toBe("Other");
    expect(next[1].pending).toBeUndefined();
  });

  it("does not mutate the input array", () => {
    const rows = [reminder()];
    applyOptimisticReminder(rows, { reminderId: "r1", kind: "complete", value: "" });
    expect(rows[0].status).toBe("pending");
  });
});

describe("settleMutation", () => {
  it("clears the pending flag once the server confirms", () => {
    const rows = [reminder({ status: "dismissed", pending: true })];
    const { reminders } = settleMutation(rows, [mutation()], "m1");
    expect(reminders[0].pending).toBe(false);
  });

  it("keeps a row pending while another queued edit still targets it", () => {
    const rows = [reminder({ pending: true })];
    const queue = [mutation({ id: "m1" }), mutation({ id: "m2", kind: "enabled", value: false })];
    const { reminders, queue: nextQueue } = settleMutation(rows, queue, "m1");
    expect(reminders[0].pending).toBe(true);
    expect(nextQueue).toHaveLength(1);
  });

  it("is a no-op for an unknown id", () => {
    const rows = [reminder({ pending: true })];
    const { reminders } = settleMutation(rows, [mutation()], "nope");
    expect(reminders[0].pending).toBe(true);
  });
});

describe("pruneStaleMutations", () => {
  const now = Date.parse(NEW);

  it("keeps an edit the server has not overtaken", () => {
    // Server row is older than the queued edit — the edit is still the newest.
    const result = pruneStaleMutations([reminder({ updated_at: OLD })], [mutation()], now);
    expect(result.queue).toHaveLength(1);
    expect(result.dropped).toHaveLength(0);
  });

  it("drops an edit the server has since overtaken", () => {
    // The server row is strictly newer than the queued edit.
    const serverUpdate = new Date(Date.parse(NEW) + 60_000).toISOString();
    const result = pruneStaleMutations(
      [reminder({ updated_at: serverUpdate })],
      [mutation({ queuedAt: NEW })],
      now
    );
    expect(result.queue).toHaveLength(0);
    expect(result.dropped).toHaveLength(1);
  });

  it("keeps an edit whose timestamp exactly matches the server row", () => {
    // Equal timestamps are ambiguous, and dropping the user's intent on a tie
    // would be the worse failure — the row is kept and replayed instead.
    const result = pruneStaleMutations([reminder({ updated_at: NEW })], [mutation()], now);
    expect(result.queue).toHaveLength(1);
  });

  it("drops an intent too old to apply silently", () => {
    const staleQueuedAt = new Date(now - 8 * 24 * 60 * 60_000).toISOString();
    const result = pruneStaleMutations(
      [reminder()],
      [mutation({ queuedAt: staleQueuedAt })],
      now
    );
    expect(result.queue).toHaveLength(0);
  });

  it("never prunes a create — there is no server row to overtake it", () => {
    const result = pruneStaleMutations([], [mutation({ kind: "create", reminderId: "new" })], now);
    expect(result.queue).toHaveLength(1);
  });
});

describe("mergeServerReminders", () => {
  it("takes the server row when nothing is queued", () => {
    const merged = mergeServerReminders([reminder({ title: "Stale" })], [reminder()], []);
    expect(merged[0].title).toBe("Ping vendor");
    expect(merged[0].pending).toBe(false);
  });

  it("keeps the optimistic value when an edit is still queued", () => {
    const merged = mergeServerReminders(
      [],
      [reminder()],
      [mutation({ kind: "complete", value: "" })]
    );
    expect(merged[0].status).toBe("dismissed");
    expect(merged[0].pending).toBe(true);
  });

  it("keeps a row hidden when its delete has not reached the server", () => {
    const merged = mergeServerReminders([], [reminder()], [mutation({ kind: "delete" })]);
    expect(merged).toHaveLength(0);
  });

  it("keeps an offline-created row the server has not sent", () => {
    const created = reminder({ id: "new", title: "Buy milk", pending: true });
    const merged = mergeServerReminders([created], [reminder()], [
      mutation({ kind: "create", reminderId: "new", value: created }),
    ]);
    expect(merged.map((r) => r.id).sort()).toEqual(["new", "r1"]);
  });

  it("drops a cached row the server removed and nothing queues", () => {
    const merged = mergeServerReminders([reminder({ id: "gone" })], [reminder()], []);
    expect(merged.map((r) => r.id)).toEqual(["r1"]);
  });

  it("applies several queued edits newest-last", () => {
    const merged = mergeServerReminders(
      [],
      [reminder()],
      [
        mutation({ id: "a", kind: "snooze", value: "2026-03-12T11:00:00.000Z" }),
        mutation({ id: "b", kind: "unsnooze", value: "" }),
      ]
    );
    expect(merged[0].status).toBe("pending");
    expect(merged[0].snoozed_until).toBeNull();
  });
});

describe("reminderMutationId", () => {
  it("is stable for the same triple", () => {
    expect(reminderMutationId("r1", "complete", NEW)).toBe(
      reminderMutationId("r1", "complete", NEW)
    );
  });

  it("differs when any part differs", () => {
    expect(reminderMutationId("r1", "complete", NEW)).not.toBe(
      reminderMutationId("r2", "complete", NEW)
    );
  });
});

describe("enqueueMutation", () => {
  it("appends a new mutation", () => {
    expect(enqueueMutation([], mutation())).toHaveLength(1);
  });

  it("collapses an immediately repeated identical write", () => {
    const first = mutation();
    const queue = enqueueMutation([], first);
    expect(enqueueMutation(queue, { ...first })).toHaveLength(1);
  });

  it("keeps two different snooze targets", () => {
    const queue = enqueueMutation([], mutation({ kind: "snooze", value: "2026-03-12T11:00:00.000Z" }));
    const next = enqueueMutation(queue, mutation({ kind: "snooze", value: "2026-03-12T12:00:00.000Z" }));
    expect(next).toHaveLength(2);
  });
});

describe("cacheableProjects", () => {
  const project = (over: Partial<CachedProject> = {}): CachedProject => ({
    id: "p1",
    name: "Apollo",
    color: "#6366f1",
    status: "active",
    icon: null,
    is_pinned: false,
    is_favorite: false,
    ...over,
  });

  it("keeps live projects", () => {
    expect(cacheableProjects([project(), project({ id: "p2", status: "completed" })])).toHaveLength(2);
  });

  it("drops archived projects, which are history rather than a filter target", () => {
    expect(cacheableProjects([project(), project({ id: "p2", status: "archived" })])).toHaveLength(1);
  });
});