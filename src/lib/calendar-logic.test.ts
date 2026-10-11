import { describe, expect, it } from "vitest";
import {
  DENSITY_CLASSES,
  applyCalendarFilters,
  dayDensity,
  densityStep,
  durationMinutes,
  formatMinutes,
  groupByDate,
  isActive,
  monthGrid,
  shiftDays,
  shiftMonths,
  startOfWeek,
  toIsoDate,
} from "@/lib/calendar-logic";
import type { CalendarItem, CalendarSource } from "@/lib/dal/calendar-bundle";

function item(overrides: Partial<CalendarItem> = {}): CalendarItem {
  return {
    id: "1",
    key: "event:1",
    source: "event",
    title: "Event",
    date: "2024-06-15",
    startMinutes: null,
    endMinutes: null,
    allDay: true,
    projectId: null,
    projectName: null,
    projectColor: null,
    color: null,
    status: null,
    href: null,
    ...overrides,
  };
}

describe("monthGrid", () => {
  it("starts on the Sunday that opens the month", () => {
    const grid = monthGrid(2024, 5); // June 2024 starts on a Saturday
    expect(grid[0].getDay()).toBe(0);
    expect(toIsoDate(grid[0])).toBe("2024-05-26");
    expect(toIsoDate(grid[6])).toBe("2024-06-01");
  });

  it("covers every day of the month exactly once", () => {
    const grid = monthGrid(2024, 5);
    const juneDays = grid
      .map(toIsoDate)
      .filter((date) => date.startsWith("2024-06"));
    expect(juneDays).toHaveLength(30);
    expect(new Set(juneDays).size).toBe(30);
  });

  it("always returns whole weeks so the grid does not reflow", () => {
    for (let month = 0; month < 12; month += 1) {
      const grid = monthGrid(2024, month);
      expect(grid.length % 7).toBe(0);
      expect(grid.length).toBeGreaterThanOrEqual(28);
    }
  });

  it("handles a February that starts on a Saturday", () => {
    const grid = monthGrid(2025, 1);
    const february = grid.map(toIsoDate).filter((d) => d.startsWith("2025-02"));
    expect(february).toHaveLength(28);
  });
});

describe("week and day helpers", () => {
  it("starts the week on Sunday", () => {
    expect(startOfWeek("2024-06-15")).toBe("2024-06-09");
    expect(startOfWeek("2024-06-09")).toBe("2024-06-09");
    expect(startOfWeek("2024-06-10")).toBe("2024-06-09");
  });

  it("shifts across month and year boundaries", () => {
    expect(shiftDays("2024-06-01", -1)).toBe("2024-05-31");
    expect(shiftDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(shiftDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("shifts months in both directions", () => {
    expect(shiftMonths("2024-01", -1)).toBe("2023-12");
    expect(shiftMonths("2024-12", 1)).toBe("2025-01");
    expect(shiftMonths("2024-06", 0)).toBe("2024-06");
  });
});

describe("formatMinutes", () => {
  it("renders 12-hour times", () => {
    expect(formatMinutes(0)).toBe("12:00 AM");
    expect(formatMinutes(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinutes(12 * 60)).toBe("12:00 PM");
    expect(formatMinutes(23 * 60 + 30)).toBe("11:30 PM");
  });

  it("says all day rather than showing midnight", () => {
    expect(formatMinutes(null)).toBe("All day");
  });
});

describe("durationMinutes", () => {
  it("measures a span", () => {
    expect(durationMinutes(item({ allDay: false, startMinutes: 540, endMinutes: 600 }))).toBe(60);
  });

  it("is null when the end is unknown or reversed", () => {
    expect(durationMinutes(item({ allDay: false, startMinutes: 540, endMinutes: null }))).toBeNull();
    expect(durationMinutes(item({ allDay: false, startMinutes: 600, endMinutes: 540 }))).toBeNull();
  });
});

describe("groupByDate", () => {
  it("sorts all-day first, then by time", () => {
    const grouped = groupByDate([
      item({ key: "a", allDay: false, startMinutes: 600 }),
      item({ key: "b", allDay: true }),
      item({ key: "c", allDay: false, startMinutes: 480 }),
    ]);

    expect(grouped.get("2024-06-15")?.map((entry) => entry.key)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("keeps days separate", () => {
    const grouped = groupByDate([
      item({ key: "a", date: "2024-06-15" }),
      item({ key: "b", date: "2024-06-16" }),
    ]);
    expect(grouped.size).toBe(2);
  });
});

describe("isActive", () => {
  it("excludes finished and disabled work", () => {
    for (const status of ["done", "completed", "cancelled", "disabled"]) {
      expect(isActive(item({ status }))).toBe(false);
    }
  });

  it("keeps planned work", () => {
    for (const status of [null, "pending", "todo", "in_progress", "not_started"]) {
      expect(isActive(item({ status }))).toBe(true);
    }
  });
});

describe("applyCalendarFilters", () => {
  const items: CalendarItem[] = [
    item({ key: "e1", source: "event", title: "Design review", projectId: "p1" }),
    item({ key: "t1", source: "task", title: "Write tests", projectId: "p2" }),
    item({ key: "r1", source: "reminder", title: "Call vendor", projectId: null }),
  ];

  it("returns everything when nothing is selected", () => {
    const filter = { query: "", sources: [], projectId: "", types: [] };
    expect(applyCalendarFilters(items, filter)).toHaveLength(3);
  });

  it("filters by source", () => {
    const filter = { query: "", sources: ["task"] as CalendarSource[], projectId: "", types: [] };
    expect(applyCalendarFilters(items, filter).map((i) => i.key)).toEqual(["t1"]);
  });

  it("filters by project", () => {
    const filter = { query: "", sources: [], projectId: "p1", types: [] };
    expect(applyCalendarFilters(items, filter).map((i) => i.key)).toEqual(["e1"]);
  });

  it("searches title and project name, case-insensitively", () => {
    expect(
      applyCalendarFilters(items, { query: "DESIGN", sources: [], projectId: "", types: [] })
    ).toHaveLength(1);
    expect(
      applyCalendarFilters(items, { query: "vendor", sources: [], projectId: "", types: [] })
    ).toHaveLength(1);
  });

  it("combines filters with AND, not OR", () => {
    const filter = { query: "tests", sources: ["event"] as CalendarSource[], projectId: "", types: [] };
    expect(applyCalendarFilters(items, filter)).toHaveLength(0);
  });
});

describe("density", () => {
  it("counts items per day", () => {
    const counts = dayDensity([
      item({ key: "a", date: "2024-06-15" }),
      item({ key: "b", date: "2024-06-15" }),
      item({ key: "c", date: "2024-06-16" }),
    ]);
    expect(counts.get("2024-06-15")).toBe(2);
    expect(counts.get("2024-06-16")).toBe(1);
  });

  it("buckets into four steps with a matching number of classes", () => {
    expect(densityStep(0)).toBe(0);
    expect(densityStep(2)).toBe(1);
    expect(densityStep(4)).toBe(2);
    expect(densityStep(40)).toBe(3);
    expect(DENSITY_CLASSES).toHaveLength(4);
    expect(DENSITY_CLASSES[densityStep(9)]).toBeTruthy();
  });
});