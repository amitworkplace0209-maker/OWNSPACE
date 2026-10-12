import { describe, expect, it } from "vitest";
import { parseQuickReminder, quickPriority, DEFAULT_LEAD_MINUTES } from "@/lib/quick-add";

// Tuesday 10 March 2026, 10:00 local.
const NOW = new Date(2026, 2, 10, 10, 0, 0, 0);

function parts(iso: string) {
  const [date, time] = iso.split("T");
  return { date, time };
}

describe("parseQuickReminder — relative durations", () => {
  it("reads minutes", () => {
    const result = parseQuickReminder("in 10m standup", NOW);
    expect(result.remindAt).toBe("2026-03-10T10:10");
    expect(result.title).toBe("Standup");
  });

  it("reads hours", () => {
    expect(parts(parseQuickReminder("in 2 hours review", NOW).remindAt)).toEqual({
      date: "2026-03-10",
      time: "12:00",
    });
  });

  it("reads days", () => {
    expect(parts(parseQuickReminder("in 3d deploy", NOW).remindAt)).toEqual({
      date: "2026-03-13",
      time: "10:00",
    });
  });

  it("keeps the relative word out of the title", () => {
    expect(parseQuickReminder("in 1h call the bank", NOW).title).toBe("Call the bank");
  });
});

describe("parseQuickReminder — named days", () => {
  it("reads tomorrow", () => {
    expect(parts(parseQuickReminder("tomorrow pay rent", NOW).remindAt)).toEqual({
      date: "2026-03-11",
      time: "10:00",
    });
    expect(parseQuickReminder("tomorrow pay rent", NOW).title).toBe("Pay rent");
  });

  it("reads tonight as 20:00", () => {
    expect(parts(parseQuickReminder("tonight dinner", NOW).remindAt)).toEqual({
      date: "2026-03-10",
      time: "20:00",
    });
  });

  it("reads a bare weekday as the next one, never today", () => {
    // NOW is a Tuesday, so "tuesday" must mean next Tuesday.
    const result = parseQuickReminder("tuesday retro", NOW);
    expect(parts(result.remindAt).date).toBe("2026-03-17");
  });

  it("reads a different weekday", () => {
    expect(parts(parseQuickReminder("friday report", NOW).remindAt).date).toBe("2026-03-13");
  });

  it("combines a day with a clock time", () => {
    const result = parseQuickReminder("tomorrow 9am standup", NOW);
    expect(parts(result.remindAt)).toEqual({ date: "2026-03-11", time: "09:00" });
    expect(result.title).toBe("Standup");
  });

  it("does not roll a named day's time forward", () => {
    // 9am on Friday is in the past relative to Tuesday 10am, but the user
    // explicitly asked for Friday, so it must stay on Friday.
    const result = parseQuickReminder("friday 9am sync", NOW);
    expect(parts(result.remindAt)).toEqual({ date: "2026-03-13", time: "09:00" });
  });
});

describe("parseQuickReminder — clock times", () => {
  it("reads a 12h time and rolls to tomorrow once it has passed", () => {
    // 9am is behind NOW (10am) and no day was named.
    const result = parseQuickReminder("9am coffee", NOW);
    expect(parts(result.remindAt)).toEqual({ date: "2026-03-11", time: "09:00" });
  });

  it("keeps a time still ahead today", () => {
    expect(parts(parseQuickReminder("6pm gym", NOW).remindAt)).toEqual({
      date: "2026-03-10",
      time: "18:00",
    });
  });

  it("reads a 24h time", () => {
    expect(parts(parseQuickReminder("21:30 dinner", NOW).remindAt)).toEqual({
      date: "2026-03-10",
      time: "21:30",
    });
  });

  it("reads 'at 14'", () => {
    expect(parts(parseQuickReminder("at 14 dentist", NOW).remindAt).time).toBe("14:00");
  });

  it("does not treat a bare quantity as a time", () => {
    const result = parseQuickReminder("buy 9 apples", NOW);
    // No time matched, so the default lead time applies.
    expect(result.matched).toBeNull();
    expect(result.title).toBe("Buy 9 apples");
  });

  it("strips the time words from the title", () => {
    expect(parseQuickReminder("9am water the plants", NOW).title).toBe("Water the plants");
  });
});

describe("parseQuickReminder — fallbacks", () => {
  it("falls back to the default lead time and keeps the whole line as the title", () => {
    const result = parseQuickReminder("think about the roadmap", NOW);
    expect(result.matched).toBeNull();
    expect(result.title).toBe("Think about the roadmap");
    // +60m from 10:00 is 11:00, which rounds *down* to the half hour.
    expect(result.remindAt).toBe("2026-03-10T11:00");
  });

  it("rounds the default down to the nearest half hour", () => {
    // 10:20 + 60m = 11:20, which is before the midpoint, so it rounds down.
    const now = new Date(2026, 2, 10, 10, 20, 0, 0);
    expect(parseQuickReminder("no time given", now).remindAt).toBe("2026-03-10T11:00");
  });

  it("snaps forward to :30 when the target lands past the midpoint", () => {
    // 10:45 + 60m = 11:45, which is past the midpoint, so the minute snaps to :30.
    const now = new Date(2026, 2, 10, 10, 45, 0, 0);
    expect(parseQuickReminder("no time given", now).remindAt).toBe("2026-03-10T11:30");
  });

  it("honours the exported lead-time constant", () => {
    // 8:05 + 60m = 9:05, which rounds down to 9:00.
    const now = new Date(2026, 2, 10, 8, 5, 0, 0);
    expect(parseQuickReminder("later", now).remindAt).toBe("2026-03-10T09:00");
    expect(DEFAULT_LEAD_MINUTES).toBe(60);
  });

  it("handles an empty line", () => {
    const result = parseQuickReminder("   ", NOW);
    expect(result.title).toBe("");
    expect(result.matched).toBeNull();
  });

  it("never returns a past timestamp", () => {
    for (const input of ["in 1m x", "yesterday-ish thing", "at 1 2am odd"]) {
      const parsed = parseQuickReminder(input, NOW);
      if (parsed.matched === null) continue;
      expect(new Date(parsed.remindAt).getTime()).toBeGreaterThan(NOW.getTime());
    }
  });

  it("collapses the punctuation left behind by a removed token", () => {
    const result = parseQuickReminder("in 30m, water the plants", NOW);
    expect(result.title).toBe("Water the plants");
  });
});

describe("quickPriority", () => {
  it("reads urgency keywords", () => {
    expect(quickPriority("URGENT: fix the outage")).toBe("urgent");
    expect(quickPriority("asap: reply to legal")).toBe("urgent");
    expect(quickPriority("important: sign contract")).toBe("high");
    expect(quickPriority("whenever: tidy the garage")).toBe("low");
  });

  it("returns null when nothing matches, so an existing priority is left alone", () => {
    expect(quickPriority("Water the plants")).toBeNull();
  });
});