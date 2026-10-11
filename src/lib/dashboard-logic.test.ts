import { describe, expect, it } from "vitest";
import {
  AGENDA_STATE_LABEL,
  AGENDA_STATE_TONE,
  HEALTH_LABEL,
  HEALTH_TONE,
  OPEN_TASK_STATUSES,
  REMINDER_STATE_LABEL,
  REMINDER_STATE_TONE,
  computeProjectHealth,
  computeTodayProgress,
  countdownLabel,
  daysUntil,
  deriveDeadlineState,
  deriveEventState,
  deriveReminderState,
  dueTodayTone,
  greetingFor,
  hoursUntil,
  overdueTone,
  syncTone,
  todayIsoDate,
} from "./dashboard-logic";

const NOW = new Date(Date.UTC(2026, 8, 28, 12, 0, 0)); // 2026-09-28T12:00Z

describe("todayIsoDate", () => {
  it("returns the UTC calendar date as YYYY-MM-DD", () => {
    expect(todayIsoDate(NOW)).toBe("2026-09-28");
  });

  it("does not roll over near midnight UTC", () => {
    const justBefore = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
    expect(todayIsoDate(justBefore)).toBe("2026-01-01");
  });

  it("ignores the viewer's local time zone", () => {
    // 2026-09-27T23:30 local in UTC+14 is still the 27th in UTC terms.
    const instant = new Date("2026-09-27T09:30:00.000Z");
    expect(todayIsoDate(instant)).toBe("2026-09-27");
  });
});

describe("daysUntil", () => {
  it("counts forward to a future date", () => {
    expect(daysUntil("2026-10-01", NOW)).toBe(3);
  });

  it("returns 0 for today", () => {
    expect(daysUntil("2026-09-28", NOW)).toBe(0);
  });

  it("returns a negative number for a past date", () => {
    expect(daysUntil("2026-09-25", NOW)).toBe(-3);
  });

  it("returns null when there is no date", () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil(undefined, NOW)).toBeNull();
    expect(daysUntil("", NOW)).toBeNull();
  });

  it("returns null for a malformed date", () => {
    expect(daysUntil("not-a-date", NOW)).toBeNull();
    expect(daysUntil("0000-00-00", NOW)).toBeNull();
  });

  it("is stable across the day boundary in UTC", () => {
    const lateUtc = new Date(Date.UTC(2026, 8, 28, 23, 59, 0));
    expect(daysUntil("2026-09-29", lateUtc)).toBe(1);
    const earlyUtc = new Date(Date.UTC(2026, 8, 29, 0, 1, 0));
    expect(daysUntil("2026-09-29", earlyUtc)).toBe(0);
  });
});

describe("hoursUntil", () => {
  it("is negative for a time in the past", () => {
    expect(hoursUntil("2026-09-28T11:00:00Z", NOW)).toBe(-1);
  });

  it("is positive for a time in the future", () => {
    expect(hoursUntil("2026-09-28T15:00:00Z", NOW)).toBe(3);
  });

  it("returns null for missing or unparseable input", () => {
    expect(hoursUntil(null, NOW)).toBeNull();
    expect(hoursUntil("nope", NOW)).toBeNull();
  });
});

describe("greetingFor", () => {
  const at = (hour: number) => new Date(2026, 8, 28, hour);

  it("buckets the local hour into the right greeting", () => {
    expect(greetingFor(at(3))).toBe("Good night");
    expect(greetingFor(at(5))).toBe("Good morning");
    expect(greetingFor(at(11))).toBe("Good morning");
    expect(greetingFor(at(12))).toBe("Good afternoon");
    expect(greetingFor(at(17))).toBe("Good afternoon");
    expect(greetingFor(at(18))).toBe("Good evening");
    expect(greetingFor(at(23))).toBe("Good evening");
  });
});

describe("computeTodayProgress", () => {
  it("returns zeros for an empty list", () => {
    expect(computeTodayProgress([])).toEqual({
      completed: 0,
      total: 0,
      percent: 0,
    });
  });

  it("counts only tasks with status done", () => {
    const result = computeTodayProgress([
      { status: "done" },
      { status: "done" },
      { status: "todo" },
      { status: "in_progress" },
      { status: "cancelled" },
    ]);
    expect(result).toEqual({ completed: 2, total: 5, percent: 40 });
  });

  it("rounds to the nearest whole percent", () => {
    expect(computeTodayProgress([{ status: "done" }, { status: "todo" }, { status: "todo" }]).percent).toBe(33);
    expect(computeTodayProgress([{ status: "done" }, { status: "done" }, { status: "todo" }]).percent).toBe(67);
  });

  it("is 100% when everything due today is done", () => {
    expect(computeTodayProgress([{ status: "done" }, { status: "done" }])).toEqual({
      completed: 2,
      total: 2,
      percent: 100,
    });
  });
});

describe("computeProjectHealth", () => {
  it("is at risk when the due date has passed and work remains", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: -1, progress: 99 })).toBe("at_risk");
  });

  it("is not judged on time once a past-due project is 100% complete", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: -1, progress: 100 })).toBe("healthy");
  });

  it("is at risk within 3 days when less than half done", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: 3, progress: 49 })).toBe("at_risk");
  });

  it("stays healthy within 3 days when more than half done", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: 3, progress: 60 })).toBe("healthy");
  });

  it("is at risk within 7 days when less than a quarter done", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: 5, progress: 20 })).toBe("at_risk");
  });

  it("is at risk with 3+ overdue tasks and little progress", () => {
    expect(computeProjectHealth({ overdueTasks: 3, daysLeft: null, progress: 30 })).toBe("at_risk");
  });

  it("only needs attention with 3+ overdue tasks but solid progress", () => {
    expect(computeProjectHealth({ overdueTasks: 3, daysLeft: null, progress: 80 })).toBe("attention");
  });

  it("needs attention with any overdue task", () => {
    expect(computeProjectHealth({ overdueTasks: 1, daysLeft: null, progress: 90 })).toBe("attention");
  });

  it("needs attention within 7 days when less than half done", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: 7, progress: 40 })).toBe("attention");
  });

  it("is healthy with no due date and no overdue work", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: null, progress: 0 })).toBe("healthy");
  });

  it("is healthy well before the deadline", () => {
    expect(computeProjectHealth({ overdueTasks: 0, daysLeft: 30, progress: 10 })).toBe("healthy");
  });
});

describe("countdownLabel", () => {
  it("renders each branch", () => {
    expect(countdownLabel(null)).toBe("");
    expect(countdownLabel(-5)).toBe("5d overdue");
    expect(countdownLabel(0)).toBe("Due today");
    expect(countdownLabel(1)).toBe("1 day left");
    expect(countdownLabel(12)).toBe("12 days left");
  });
});

describe("deriveReminderState", () => {
  const future = new Date(NOW.getTime() + 5 * 3_600_000).toISOString();

  it("treats snoozed as its own state regardless of time", () => {
    expect(deriveReminderState({ remind_at: "2020-01-01T00:00:00Z", status: "snoozed" }, NOW)).toBe("snoozed");
  });

  it("treats triggered and dismissed as done", () => {
    expect(deriveReminderState({ remind_at: future, status: "triggered" }, NOW)).toBe("done");
    expect(deriveReminderState({ remind_at: future, status: "dismissed" }, NOW)).toBe("done");
  });

  it("is overdue once a pending reminder's time has passed", () => {
    expect(deriveReminderState({ remind_at: "2026-09-28T11:00:00Z", status: "pending" }, NOW)).toBe("overdue");
  });

  it("is due soon within 24 hours", () => {
    expect(deriveReminderState({ remind_at: future, status: "pending" }, NOW)).toBe("due_soon");
  });

  it("is upcoming beyond 24 hours", () => {
    const twoDays = new Date(NOW.getTime() + 48 * 3_600_000).toISOString();
    expect(deriveReminderState({ remind_at: twoDays, status: "pending" }, NOW)).toBe("upcoming");
  });

  it("falls back to upcoming when the time cannot be parsed", () => {
    expect(deriveReminderState({ remind_at: "nope", status: "pending" }, NOW)).toBe("upcoming");
  });
});

describe("deriveEventState", () => {
  it("mirrors the reminder time rules", () => {
    expect(deriveEventState({ starts_at: "2026-09-28T11:00:00Z" }, NOW)).toBe("overdue");
    expect(deriveEventState({ starts_at: new Date(NOW.getTime() + 3_600_000).toISOString() }, NOW)).toBe("due_soon");
    expect(deriveEventState({ starts_at: new Date(NOW.getTime() + 96 * 3_600_000).toISOString() }, NOW)).toBe("upcoming");
    expect(deriveEventState({ starts_at: "nope" }, NOW)).toBe("upcoming");
  });
});

describe("deriveDeadlineState", () => {
  it("maps day counts to states", () => {
    expect(deriveDeadlineState(null)).toBe("upcoming");
    expect(deriveDeadlineState(-4)).toBe("overdue");
    expect(deriveDeadlineState(0)).toBe("due_soon");
    expect(deriveDeadlineState(1)).toBe("due_soon");
    expect(deriveDeadlineState(2)).toBe("upcoming");
  });
});

describe("KPI tones", () => {
  it("flags overdue work as danger and its absence as success", () => {
    expect(overdueTone(0)).toBe("success");
    expect(overdueTone(1)).toBe("danger");
  });

  it("flags work due today as warning and an empty day as neutral", () => {
    expect(dueTodayTone(0)).toBe("neutral");
    expect(dueTodayTone(3)).toBe("warning");
  });

  it("mirrors the connection state", () => {
    expect(syncTone(true)).toBe("success");
    expect(syncTone(false)).toBe("warning");
  });
});

describe("state maps", () => {
  it("covers every health state with a label and a tone", () => {
    for (const state of ["healthy", "attention", "at_risk"] as const) {
      expect(HEALTH_LABEL[state]).toBeTruthy();
      expect(HEALTH_TONE[state]).toBeTruthy();
    }
  });

  it("covers every agenda state with a label and a tone", () => {
    for (const state of ["overdue", "due_soon", "upcoming", "snoozed"] as const) {
      expect(AGENDA_STATE_LABEL[state]).toBeTruthy();
      expect(AGENDA_STATE_TONE[state]).toBeTruthy();
    }
  });

  it("covers every reminder state with a label and a tone", () => {
    for (const state of ["overdue", "due_soon", "upcoming", "snoozed", "done"] as const) {
      expect(REMINDER_STATE_LABEL[state]).toBeTruthy();
      expect(REMINDER_STATE_TONE[state]).toBeTruthy();
    }
  });

  it("lists exactly the statuses that count as outstanding work", () => {
    expect([...OPEN_TASK_STATUSES]).toEqual(["backlog", "todo", "in_progress"]);
  });
});
