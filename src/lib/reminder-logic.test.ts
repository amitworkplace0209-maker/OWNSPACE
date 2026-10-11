import { describe, expect, it } from "vitest";
import {
  applyReminderFilters,
  computeReminderStats,
  dayLabelFor,
  defaultRemindAt,
  deriveReminderState,
  fireTime,
  groupReminders,
  isLive,
  minutesUntilSnooze,
  nextOccurrence,
  repeatSummary,
  snoozeUntilTomorrow,
  sortReminders,
  type ReminderFilterState,
  type ReminderListItem,
} from "@/lib/reminder-logic";

const NOW = new Date("2026-03-10T12:00:00Z");

function reminder(over: Partial<ReminderListItem> = {}): ReminderListItem {
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
    repeat_rule: "none",
    repeat_interval: null,
    repeat_until: null,
    repeat_days: [],
    status: "pending",
    priority: "none",
    notification_channels: ["in_app"],
    snooze_minutes: null,
    sound: null,
    is_enabled: true,
    advance_minutes: 0,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    project_name: null,
    project_color: null,
    ...over,
  };
}

describe("fireTime", () => {
  it("is the reminder time when there is no advance", () => {
    expect(fireTime(reminder({ advance_minutes: 0 })).toISOString()).toBe(
      "2026-03-12T09:00:00.000Z"
    );
  });

  it("pulls the fire time back by advance_minutes", () => {
    expect(fireTime(reminder({ advance_minutes: 60 })).toISOString()).toBe(
      "2026-03-12T08:00:00.000Z"
    );
  });

  it("treats a missing advance as zero rather than NaN", () => {
    expect(fireTime(reminder({ advance_minutes: undefined as never })).toISOString()).toBe(
      "2026-03-12T09:00:00.000Z"
    );
  });
});

describe("nextOccurrence", () => {
  const at = "2026-03-12T09:00:00.000Z";

  it("returns null for a one-off reminder", () => {
    expect(nextOccurrence(at, { repeat_rule: "none", repeat_interval: null, repeat_until: null })).toBeNull();
  });

  it("advances daily by one day", () => {
    expect(nextOccurrence(at, { repeat_rule: "daily", repeat_interval: 1, repeat_until: null })).toBe(
      "2026-03-13T09:00:00.000Z"
    );
  });

  it("advances daily by the interval", () => {
    expect(nextOccurrence(at, { repeat_rule: "daily", repeat_interval: 5, repeat_until: null })).toBe(
      "2026-03-17T09:00:00.000Z"
    );
  });

  it("advances weekly by seven days", () => {
    expect(nextOccurrence(at, { repeat_rule: "weekly", repeat_interval: 1, repeat_until: null })).toBe(
      "2026-03-19T09:00:00.000Z"
    );
  });

  it("advances weekly by the interval", () => {
    expect(nextOccurrence(at, { repeat_rule: "weekly", repeat_interval: 2, repeat_until: null })).toBe(
      "2026-03-26T09:00:00.000Z"
    );
  });

  it("advances monthly", () => {
    expect(nextOccurrence(at, { repeat_rule: "monthly", repeat_interval: 1, repeat_until: null })).toBe(
      "2026-04-12T09:00:00.000Z"
    );
  });

  it("advances yearly", () => {
    expect(nextOccurrence(at, { repeat_rule: "yearly", repeat_interval: 1, repeat_until: null })).toBe(
      "2027-03-12T09:00:00.000Z"
    );
  });

  it("defaults a null interval to one", () => {
    expect(nextOccurrence(at, { repeat_rule: "daily", repeat_interval: null, repeat_until: null })).toBe(
      "2026-03-13T09:00:00.000Z"
    );
  });

  it("clamps to the last day of a shorter month instead of overflowing", () => {
    // Jan 31 + 1 month overflows into March without clamping.
    expect(nextOccurrence("2026-01-31T09:00:00.000Z", { repeat_rule: "monthly", repeat_interval: 1, repeat_until: null })).toBe(
      "2026-02-28T09:00:00.000Z"
    );
  });

  it("clamps Feb 29 on a yearly repeat into a non-leap year", () => {
    expect(nextOccurrence("2028-02-29T09:00:00.000Z", { repeat_rule: "yearly", repeat_interval: 1, repeat_until: null })).toBe(
      "2029-02-28T09:00:00.000Z"
    );
  });

  it("stops once repeat_until has passed", () => {
    expect(nextOccurrence(at, { repeat_rule: "daily", repeat_interval: 1, repeat_until: "2026-03-12" })).toBeNull();
  });

  it("keeps going while repeat_until is in the future", () => {
    expect(nextOccurrence(at, { repeat_rule: "daily", repeat_interval: 1, repeat_until: "2026-04-01" })).toBe(
      "2026-03-13T09:00:00.000Z"
    );
  });

  it("picks the next matching weekday for custom", () => {
    // 2026-03-12 is a Thursday; the next Monday is the 16th.
    expect(nextOccurrence(at, { repeat_rule: "custom", repeat_interval: null, repeat_until: null, repeat_days: [1] })).toBe(
      "2026-03-16T09:00:00.000Z"
    );
  });

  it("never returns the same day it started from for custom", () => {
    const next = nextOccurrence(at, {
      repeat_rule: "custom",
      repeat_interval: null,
      repeat_until: null,
      repeat_days: [4], // Thursday, same as the start
    });
    expect(next).toBe("2026-03-19T09:00:00.000Z");
  });

  it("returns null for custom with no days chosen", () => {
    expect(
      nextOccurrence(at, { repeat_rule: "custom", repeat_interval: null, repeat_until: null, repeat_days: [] })
    ).toBeNull();
  });

  it("returns null for an unparseable date", () => {
    expect(nextOccurrence("not-a-date", { repeat_rule: "daily", repeat_interval: 1, repeat_until: null })).toBeNull();
  });
});

describe("repeatSummary", () => {
  it("is null when it does not repeat", () => {
    expect(repeatSummary(reminder())).toBeNull();
  });

  it("describes a plain daily repeat", () => {
    expect(repeatSummary(reminder({ repeat_rule: "daily", repeat_interval: 1 }))).toBe("daily");
  });

  it("describes an interval", () => {
    expect(repeatSummary(reminder({ repeat_rule: "weekly", repeat_interval: 2 }))).toBe("every 2 weeks");
  });

  it("includes repeat_until", () => {
    expect(
      repeatSummary(reminder({ repeat_rule: "daily", repeat_interval: 1, repeat_until: "2026-12-31" }))
    ).toBe("daily until 2026-12-31");
  });

  it("names the weekdays for custom", () => {
    expect(
      repeatSummary(reminder({ repeat_rule: "custom", repeat_days: [1, 3, 5] }))
    ).toBe("Every Mon, Wed, Fri");
  });
});

describe("deriveReminderState", () => {
  it("is overdue once the fire time has passed", () => {
    expect(
      deriveReminderState(reminder({ remind_at: "2026-03-10T11:00:00.000Z" }), NOW)
    ).toBe("overdue");
  });

  it("is overdue once the advance window has opened", () => {
    // Fires at 08:00, which has passed.
    expect(
      deriveReminderState(
        reminder({ remind_at: "2026-03-10T09:00:00.000Z", advance_minutes: 60 }),
        NOW
      )
    ).toBe("overdue");
  });

  it("is still upcoming while the advance window is open", () => {
    // Fires at 13:00, which has not — but it is inside 24h, so "due soon".
    expect(
      deriveReminderState(
        reminder({ remind_at: "2026-03-10T14:00:00.000Z", advance_minutes: 60 }),
        NOW
      )
    ).toBe("due_soon");
  });

  it("is due_soon inside the 24 hour window", () => {
    expect(
      deriveReminderState(reminder({ remind_at: "2026-03-11T09:00:00.000Z", advance_minutes: 0 }), NOW)
    ).toBe("due_soon");
  });

  it("is upcoming beyond 24 hours", () => {
    expect(
      deriveReminderState(reminder({ remind_at: "2026-03-14T09:00:00.000Z", advance_minutes: 0 }), NOW)
    ).toBe("upcoming");
  });

  it("is never overdue while muted", () => {
    expect(
      deriveReminderState(reminder({ remind_at: "2020-01-01T00:00:00.000Z", is_enabled: false }), NOW)
    ).toBe("upcoming");
  });

  it("treats snoozed as its own state", () => {
    expect(deriveReminderState(reminder({ status: "snoozed" }), NOW)).toBe("snoozed");
  });

  it("treats triggered and dismissed as done", () => {
    expect(deriveReminderState(reminder({ status: "triggered" }), NOW)).toBe("done");
    expect(deriveReminderState(reminder({ status: "dismissed" }), NOW)).toBe("done");
  });
});

describe("minutesUntilSnooze", () => {
  it("is null when not snoozed", () => {
    expect(minutesUntilSnooze({ status: "pending", snoozed_until: null })).toBeNull();
  });

  it("is null when snoozed without a target", () => {
    expect(minutesUntilSnooze({ status: "snoozed", snoozed_until: null })).toBeNull();
  });
});

describe("snoozeUntilTomorrow", () => {
  it("lands on 9am the next day", () => {
    const target = snoozeUntilTomorrow(NOW);
    expect(target.getDate()).toBe(NOW.getDate() + 1);
    expect(target.getHours()).toBe(9);
    expect(target.getMinutes()).toBe(0);
  });
});

const filter = (over: Partial<ReminderFilterState> = {}): ReminderFilterState => ({
  query: "",
  projectId: "",
  scope: "all",
  priority: "",
  state: "",
  repeat: "any",
  ...over,
});

describe("applyReminderFilters", () => {
  const items = [
    reminder({ id: "a", title: "Pay rent", project_id: "p1", project_name: "Home", priority: "high" }),
    reminder({ id: "b", title: "Call mum", project_id: null, project_name: null, priority: "low" }),
    reminder({ id: "c", title: "Send report", project_id: "p1", project_name: "Home", status: "triggered" }),
    reminder({ id: "d", title: "Water plants", project_id: null, project_name: null, repeat_rule: "daily", repeat_interval: 1 }),
  ];

  it("returns everything with an empty filter", () => {
    expect(applyReminderFilters(items, filter(), NOW)).toHaveLength(4);
  });

  it("filters to personal reminders", () => {
    const result = applyReminderFilters(items, filter({ scope: "personal" }), NOW);
    expect(result.map((item) => item.id)).toEqual(["b", "d"]);
  });

  it("filters to one project", () => {
    const result = applyReminderFilters(items, filter({ projectId: "p1" }), NOW);
    expect(result.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("filters by priority", () => {
    const result = applyReminderFilters(items, filter({ priority: "high" }), NOW);
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });

  it("filters to repeating vs one-off", () => {
    expect(applyReminderFilters(items, filter({ repeat: "repeating" }), NOW).map((item) => item.id)).toEqual(["d"]);
    expect(applyReminderFilters(items, filter({ repeat: "once" }), NOW).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("filters to live reminders", () => {
    const result = applyReminderFilters(items, filter({ state: "live" }), NOW);
    expect(result.map((item) => item.id)).toEqual(["a", "b", "d"]);
  });

  it("searches title, note and project name", () => {
    expect(applyReminderFilters(items, filter({ query: "rent" }), NOW)).toHaveLength(1);
    expect(applyReminderFilters(items, filter({ query: "Home" }), NOW)).toHaveLength(2);
  });
});

describe("computeReminderStats", () => {
  it("counts every bucket", () => {
    const stats = computeReminderStats(
      [
        reminder({ id: "a", remind_at: "2026-03-10T11:00:00.000Z" }),
        reminder({ id: "b", remind_at: "2026-03-10T14:00:00.000Z" }),
        reminder({ id: "c", status: "snoozed" }),
        reminder({ id: "d", status: "dismissed" }),
        reminder({ id: "e", is_enabled: false, remind_at: "2020-01-01T00:00:00.000Z" }),
      ],
      NOW
    );

    expect(stats.total).toBe(5);
    expect(stats.overdue).toBe(1);
    expect(stats.snoozed).toBe(1);
    expect(stats.done).toBe(1);
    expect(stats.disabled).toBe(1);
  });

  it("counts personal reminders separately from project ones", () => {
    const stats = computeReminderStats(
      [reminder({ id: "a", project_id: "p1" }), reminder({ id: "b", project_id: null })],
      NOW
    );
    expect(stats.personal).toBe(1);
    expect(stats.byProject.p1).toBe(1);
    expect(stats.byProject.personal).toBe(1);
  });

  it("reports 100% on-time when nothing is live", () => {
    expect(computeReminderStats([reminder({ status: "dismissed" })], NOW).onTimeRate).toBe(100);
  });

  it("never divides by zero on an empty list", () => {
    const stats = computeReminderStats([], NOW);
    expect(stats.total).toBe(0);
    expect(stats.onTimeRate).toBe(100);
  });
});

describe("groupReminders", () => {
  const items = [
    reminder({ id: "a", project_id: "p1", project_name: "Home" }),
    reminder({ id: "b", project_id: null, project_name: null }),
  ];

  it("returns one bucket when ungrouped", () => {
    expect(groupReminders(items, "none", NOW)).toHaveLength(1);
  });

  it("splits by project with a personal bucket", () => {
    const groups = groupReminders(items, "project", NOW);
    expect(groups.map((group) => group.label).sort()).toEqual(["Home", "Personal reminders"]);
  });

  it("splits by priority", () => {
    const groups = groupReminders(
      [reminder({ id: "a", priority: "low" }), reminder({ id: "b", priority: "urgent" })],
      "priority",
      NOW
    );
    expect(groups.map((group) => group.id)).toEqual(["urgent", "low"]);
  });
});

describe("sortReminders", () => {
  it("puts live work before finished work", () => {
    const sorted = sortReminders([
      reminder({ id: "done", status: "dismissed" }),
      reminder({ id: "live" }),
    ]);
    expect(sorted[0].id).toBe("live");
  });

  it("puts the most urgent first", () => {
    const sorted = sortReminders([
      reminder({ id: "low", priority: "low" }),
      reminder({ id: "urgent", priority: "urgent" }),
    ]);
    expect(sorted[0].id).toBe("urgent");
  });
});

describe("dayLabelFor", () => {
  it("labels today, tomorrow and yesterday", () => {
    expect(dayLabelFor("2026-03-10", NOW)).toBe("Today");
    expect(dayLabelFor("2026-03-11", NOW)).toBe("Tomorrow");
    expect(dayLabelFor("2026-03-09", NOW)).toBe("Yesterday");
  });

  it("falls back to a short date", () => {
    expect(dayLabelFor("2026-04-02", NOW)).not.toBe("Today");
  });
});

describe("defaultRemindAt", () => {
  it("produces a value a datetime-local input accepts", () => {
    expect(defaultRemindAt(60, NOW)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("is in the future", () => {
    expect(new Date(defaultRemindAt(60, NOW)).getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe("isLive", () => {
  it("covers pending and snoozed", () => {
    expect(isLive({ status: "pending" })).toBe(true);
    expect(isLive({ status: "snoozed" })).toBe(true);
    expect(isLive({ status: "dismissed" })).toBe(false);
  });
});