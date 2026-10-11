import { describe, expect, it } from "vitest";
import {
  blockMinutes,
  daysBetween,
  describeDuration,
  fillColour,
  filledSections,
  formatTimeRange,
  journalStreak,
  localDateIso,
  longDayLabel,
  msUntilRollover,
  parseLocalDate,
  planningTotalMinutes,
  relativeDayLabel,
  ROLLOVER_GRACE_MS,
  shiftDate,
  sortPlanning,
  summariseDay,
  timeToMinutes,
  weekDates,
  windowAround,
  type NoteSectionKey,
} from "@/lib/daily-logic";
import type { DailyNote, PlanningEntry } from "@/types";

/**
 * These run in whatever zone the machine is set to, which is the point: the
 * journal's whole job is to follow the viewer's own calendar. The dates below
 * are built with the local constructor for the same reason.
 */
function local(...parts: number[]): Date {
  return new Date(parts[0], parts[1] - 1, parts[2], parts[3] ?? 0, parts[4] ?? 0, parts[5] ?? 0);
}

describe("localDateIso", () => {
  it("formats from local parts, not UTC", () => {
    // Late evening local: a UTC-based implementation would report tomorrow.
    expect(localDateIso(local(2026, 3, 14, 23, 30))).toBe("2026-03-14");
  });

  it("zero-pads month and day", () => {
    expect(localDateIso(local(2026, 1, 5))).toBe("2026-01-05");
  });
});

describe("parseLocalDate", () => {
  it("resolves to local midnight", () => {
    const parsed = parseLocalDate("2026-03-14");
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(14);
    expect(parsed.getHours()).toBe(0);
  });

  it("round-trips through localDateIso", () => {
    expect(localDateIso(parseLocalDate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("shiftDate", () => {
  it("moves forwards and backwards", () => {
    expect(shiftDate("2026-03-14", 1)).toBe("2026-03-15");
    expect(shiftDate("2026-03-14", -1)).toBe("2026-03-13");
  });

  it("crosses a month boundary", () => {
    expect(shiftDate("2026-03-31", 1)).toBe("2026-04-01");
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("crosses a year boundary", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("handles a leap day", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("daysBetween", () => {
  it("counts whole calendar days", () => {
    expect(daysBetween("2026-03-01", "2026-03-08")).toBe(7);
    expect(daysBetween("2026-03-08", "2026-03-01")).toBe(-7);
  });

  it("is zero for the same day", () => {
    expect(daysBetween("2026-03-14", "2026-03-14")).toBe(0);
  });

  it("spans a leap year correctly", () => {
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });
});

describe("weekDates", () => {
  it("returns seven days starting on Sunday", () => {
    const week = weekDates("2026-03-14");
    expect(week).toHaveLength(7);
    expect(week[0]).toBe("2026-03-08"); // Sunday
    expect(week[6]).toBe("2026-03-14");
  });

  it("keeps the selected day inside its own week", () => {
    for (const day of ["2026-03-08", "2026-03-11", "2026-03-14"]) {
      expect(weekDates(day)).toContain(day);
    }
  });

  it("is contiguous", () => {
    const week = weekDates("2026-03-14");
    for (let index = 1; index < week.length; index += 1) {
      expect(daysBetween(week[index - 1], week[index])).toBe(1);
    }
  });
});

describe("windowAround", () => {
  it("gives a week of slack either side", () => {
    expect(windowAround("2026-03-14")).toEqual({ from: "2026-03-07", to: "2026-03-21" });
  });

  it("always contains the selected day", () => {
    const { from, to } = windowAround("2026-01-01");
    expect(daysBetween(from, "2026-01-01")).toBeGreaterThanOrEqual(0);
    expect(daysBetween("2026-01-01", to)).toBeGreaterThanOrEqual(0);
  });

  it("covers the day after a rollover without a refetch", () => {
    // The whole point of the slack: midnight moves the selection forward one
    // day, and that day has to already be in the payload.
    const { to } = windowAround("2026-03-14");
    expect(to >= shiftDate("2026-03-14", 1)).toBe(true);
  });
});

describe("msUntilRollover", () => {
  it("is positive and under a day", () => {
    const now = local(2026, 3, 14, 10, 0);
    const ms = msUntilRollover(now);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(86_400_000 + ROLLOVER_GRACE_MS);
  });

  it("counts down to the next midnight", () => {
    const now = local(2026, 3, 14, 23, 0);
    const ms = msUntilRollover(now);
    // One hour to midnight, plus the grace period.
    expect(ms).toBe(3_600_000 + ROLLOVER_GRACE_MS);
  });

  it("adds the grace period rather than firing on the hour", () => {
    const now = local(2026, 3, 14, 0, 0);
    expect(msUntilRollover(now)).toBe(86_400_000 + ROLLOVER_GRACE_MS);
  });

  it("treats 00:01 as already rolled over", () => {
    const justAfter = local(2026, 3, 15, 0, 1);
    expect(msUntilRollover(justAfter)).toBeGreaterThan(86_300_000);
  });
});

describe("describeDuration", () => {
  it("reads as hours and minutes", () => {
    expect(describeDuration(8 * 3_600_000 + 12 * 60_000)).toBe("8h 12m");
  });

  it("drops a zero part", () => {
    expect(describeDuration(2 * 3_600_000)).toBe("2h");
    expect(describeDuration(42 * 60_000)).toBe("42m");
  });

  it("never shows a negative countdown", () => {
    expect(describeDuration(0)).toBe("now");
    expect(describeDuration(-5000)).toBe("now");
  });

  it("handles the last minute", () => {
    expect(describeDuration(20_000)).toBe("less than a minute");
  });
});

describe("relativeDayLabel", () => {
  const today = "2026-03-14";

  it("names the relative days", () => {
    expect(relativeDayLabel("2026-03-14", today)).toBe("Today");
    expect(relativeDayLabel("2026-03-13", today)).toBe("Yesterday");
    expect(relativeDayLabel("2026-03-15", today)).toBe("Tomorrow");
  });

  it("uses the weekday inside the coming week", () => {
    expect(relativeDayLabel("2026-03-17", today)).toMatch(/Tuesday/);
  });

  it("falls back to a short date beyond that", () => {
    expect(relativeDayLabel("2026-05-01", today)).toMatch(/May/);
  });

  it("always produces something", () => {
    expect(relativeDayLabel(today, today).length).toBeGreaterThan(0);
    expect(longDayLabel(today).length).toBeGreaterThan(0);
  });
});

describe("timeToMinutes", () => {
  it("converts HH:MM", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("14:30")).toBe(870);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("accepts a seconds component", () => {
    expect(timeToMinutes("09:30:00")).toBe(570);
  });

  it("returns null for anything else", () => {
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes("nope")).toBeNull();
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("09:99")).toBeNull();
  });
});

describe("formatTimeRange", () => {
  it("renders a range", () => {
    expect(formatTimeRange("09:00:00", "10:30:00")).toBe("09:00 – 10:30");
  });

  it("describes a half-open block", () => {
    expect(formatTimeRange("09:00", null)).toBe("From 09:00");
    expect(formatTimeRange(null, "17:00")).toBe("Until 17:00");
  });

  it("describes an untimed block", () => {
    expect(formatTimeRange(null, null)).toBe("Any time");
  });
});

describe("blockMinutes", () => {
  it("measures a normal block", () => {
    expect(blockMinutes({ start_time: "09:00", end_time: "10:30" })).toBe(90);
  });

  it("is zero without both ends", () => {
    expect(blockMinutes({ start_time: "09:00", end_time: null })).toBe(0);
    expect(blockMinutes({ start_time: null, end_time: null })).toBe(0);
  });

  it("treats an end that is not after the start as one hour", () => {
    // A block that appears to run backwards is a mistake; reporting a negative
    // duration would be worse than a sensible fallback.
    expect(blockMinutes({ start_time: "10:00", end_time: "09:00" })).toBe(60);
    expect(blockMinutes({ start_time: "09:00", end_time: "09:00" })).toBe(60);
  });
});

describe("planningTotalMinutes", () => {
  it("sums the day", () => {
    const entries = [
      { id: "1", start_time: "09:00", end_time: "10:00" },
      { id: "2", start_time: "11:00", end_time: "11:30" },
    ] as PlanningEntry[];
    expect(planningTotalMinutes(entries)).toBe(90);
  });

  it("is zero for no entries", () => {
    expect(planningTotalMinutes([])).toBe(0);
  });
});

describe("sortPlanning", () => {
  const base = { user_id: "u", project_id: "p", plan_date: "2026-03-14", created_at: "" };

  it("orders by start time", () => {
    const sorted = sortPlanning([
      { ...base, id: "b", start_time: "14:00", end_time: "15:00", note: null },
      { ...base, id: "a", start_time: "09:00", end_time: "10:00", note: null },
    ] as PlanningEntry[]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("puts untimed blocks last", () => {
    const sorted = sortPlanning([
      { ...base, id: "any", start_time: null, end_time: null, note: null },
      { ...base, id: "a", start_time: "09:00", end_time: "10:00", note: null },
    ] as PlanningEntry[]);
    expect(sorted.map((entry) => entry.id)).toEqual(["a", "any"]);
  });

  it("does not mutate its input", () => {
    const input = [
      { ...base, id: "b", start_time: "14:00", end_time: null, note: null },
      { ...base, id: "a", start_time: "09:00", end_time: null, note: null },
    ] as PlanningEntry[];
    sortPlanning(input);
    expect(input.map((entry) => entry.id)).toEqual(["b", "a"]);
  });
});

function note(overrides: Partial<DailyNote> = {}): DailyNote {
  return {
    id: "n1",
    user_id: "u1",
    project_id: "p1",
    note_date: "2026-03-14",
    title: null,
    content: "",
    todays_work: null,
    completed_work: null,
    problems: null,
    ideas: null,
    next_steps: null,
    created_at: "2026-03-14T00:00:00.000Z",
    updated_at: "2026-03-14T00:00:00.000Z",
    ...overrides,
  };
}

describe("filledSections", () => {
  it("returns nothing for a missing note", () => {
    expect(filledSections(null)).toHaveLength(0);
  });

  it("returns nothing when every block is blank", () => {
    expect(filledSections(note({ todays_work: "   ", problems: "" }))).toHaveLength(0);
  });

  it("lists only the blocks that hold something", () => {
    const filled = filledSections(
      note({ todays_work: "Shipped the login flow", problems: "  Flaky test  " })
    );
    expect(filled.map((section) => section.key)).toEqual<NoteSectionKey[]>([
      "todays_work",
      "problems",
    ]);
    expect(filled[1].value).toBe("Flaky test");
  });
});

describe("journalStreak", () => {
  it("is zero with nothing written", () => {
    expect(journalStreak([], "2026-03-14")).toBe(0);
  });

  it("counts a run ending today", () => {
    expect(
      journalStreak(["2026-03-12", "2026-03-13", "2026-03-14"], "2026-03-14")
    ).toBe(3);
  });

  it("survives a day that has just begun", () => {
    // Yesterday's entry should still read as a live streak this morning.
    expect(journalStreak(["2026-03-13", "2026-03-14"], "2026-03-15")).toBe(2);
  });

  it("breaks on a real gap", () => {
    expect(journalStreak(["2026-03-10", "2026-03-14"], "2026-03-14")).toBe(1);
  });

  it("is zero when the last entry is two days back", () => {
    expect(journalStreak(["2026-03-12"], "2026-03-14")).toBe(0);
  });

  it("does not double-count a duplicated date", () => {
    expect(journalStreak(["2026-03-14", "2026-03-14"], "2026-03-14")).toBe(1);
  });
});

describe("summariseDay", () => {
  const notes = [
    note({ id: "a", content: "worked" }),
    note({ id: "b", note_date: "2026-03-15", content: "other day" }),
  ];
  const planning = [
    { id: "p", user_id: "u", project_id: "p1", plan_date: "2026-03-14", start_time: "09:00", end_time: "10:30", note: null, created_at: "" },
    { id: "q", user_id: "u", project_id: "p1", plan_date: "2026-03-14", start_time: null, end_time: null, note: null, created_at: "" },
  ] as PlanningEntry[];

  it("counts only the selected day", () => {
    const summary = summariseDay("2026-03-14", notes, planning);
    expect(summary.notes).toBe(1);
    expect(summary.plannedBlocks).toBe(2);
  });

  it("totals the planned minutes", () => {
    expect(summariseDay("2026-03-14", notes, planning).plannedMinutes).toBe(90);
  });

  it("counts the filled structured sections", () => {
    const withSections = [note({ todays_work: "a", ideas: "b" })];
    expect(summariseDay("2026-03-14", withSections, []).sectionsFilled).toBe(2);
  });

  it("treats a note with only sections as written", () => {
    const onlySections = [note({ content: "", problems: "blocked" })];
    expect(summariseDay("2026-03-14", onlySections, []).hasNote).toBe(true);
  });

  it("treats a completely empty note as not written", () => {
    expect(summariseDay("2026-03-14", [note()], []).hasNote).toBe(false);
  });

  it("handles an empty day", () => {
    const summary = summariseDay("2026-03-14", [], []);
    expect(summary).toEqual({
      notes: 0,
      sectionsFilled: 0,
      plannedBlocks: 0,
      plannedMinutes: 0,
      hasNote: false,
    });
  });
});

describe("fillColour", () => {
  it("gives every priority a colour", () => {
    for (const priority of ["urgent", "high", "medium", "low", "none"]) {
      expect(fillColour(priority)).toBeTruthy();
    }
  });

  it("falls back for an unknown priority", () => {
    expect(fillColour("nonsense")).toBe("var(--muted-foreground)");
  });
});