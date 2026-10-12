import { describe, expect, it } from "vitest";
import {
  buildDigest,
  digestFlushAt,
  formatHhMm,
  hasAnyChannel,
  isWithinQuietHours,
  meetsPriorityFloor,
  normalizeSettings,
  parseHhMm,
  planDelivery,
  DEFAULT_NOTIFY_SETTINGS,
  type NotifiableReminder,
  type NotifySettings,
} from "@/lib/reminder-notify";

function settings(over: Partial<NotifySettings> = {}): NotifySettings {
  return { ...DEFAULT_NOTIFY_SETTINGS, ...over };
}

function reminder(over: Partial<NotifiableReminder> = {}): NotifiableReminder {
  return {
    id: "r1",
    title: "Ping vendor",
    priority: "none",
    status: "pending",
    is_enabled: true,
    remind_at: "2026-03-10T09:00:00.000Z",
    ...over,
  };
}

// Local wall-clock used by the quiet-hours maths.
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 2, 10, hours, minutes, 0, 0);
}

describe("parseHhMm", () => {
  it("reads a zero-padded 24h time", () => {
    expect(parseHhMm("22:00")).toBe(22 * 60);
    expect(parseHhMm("08:30")).toBe(8 * 60 + 30);
  });

  it("reads an unpadded 24h time", () => {
    expect(parseHhMm("9:05")).toBe(9 * 60 + 5);
  });

  it("reads 12h times with and without a colon", () => {
    expect(parseHhMm("9am")).toBe(9 * 60);
    expect(parseHhMm("9:30pm")).toBe(21 * 60 + 30);
    expect(parseHhMm("12am")).toBe(0);
    expect(parseHhMm("12pm")).toBe(12 * 60);
  });

  it("rejects nonsense", () => {
    expect(parseHhMm("25:00")).toBeNull();
    expect(parseHhMm("10:75")).toBeNull();
    expect(parseHhMm("morning")).toBeNull();
    expect(parseHhMm("")).toBeNull();
  });
});

describe("formatHhMm", () => {
  it("round-trips with the parser", () => {
    for (const minutes of [0, 9 * 60 + 5, 22 * 60, 23 * 60 + 59]) {
      expect(parseHhMm(formatHhMm(minutes))).toBe(minutes);
    }
  });

  it("clamps out-of-range input instead of emitting an invalid time", () => {
    expect(formatHhMm(-5)).toBe("00:00");
    expect(formatHhMm(10_000)).toBe("23:59");
  });
});

describe("isWithinQuietHours", () => {
  it("is off when disabled", () => {
    const quiet = { enabled: false, start: "22:00", end: "08:00" };
    expect(isWithinQuietHours(quiet, at(23))).toBe(false);
  });

  it("covers the inside of a same-day window", () => {
    const quiet = { enabled: true, start: "09:00", end: "17:00" };
    expect(isWithinQuietHours(quiet, at(12))).toBe(true);
    expect(isWithinQuietHours(quiet, at(8, 59))).toBe(false);
    expect(isWithinQuietHours(quiet, at(17, 0))).toBe(false);
  });

  it("wraps correctly across midnight", () => {
    const quiet = { enabled: true, start: "22:00", end: "08:00" };
    expect(isWithinQuietHours(quiet, at(23, 30))).toBe(true);
    expect(isWithinQuietHours(quiet, at(2))).toBe(true);
    expect(isWithinQuietHours(quiet, at(7, 59))).toBe(true);
    expect(isWithinQuietHours(quiet, at(8))).toBe(false);
    expect(isWithinQuietHours(quiet, at(12))).toBe(false);
    expect(isWithinQuietHours(quiet, at(21, 59))).toBe(false);
  });

  it("treats equal ends as off rather than always-on", () => {
    const quiet = { enabled: true, start: "09:00", end: "09:00" };
    expect(isWithinQuietHours(quiet, at(9))).toBe(false);
    expect(isWithinQuietHours(quiet, at(3))).toBe(false);
  });

  it("falls back to off when a stored time is unparseable", () => {
    const quiet = { enabled: true, start: "later", end: "08:00" };
    expect(isWithinQuietHours(quiet, at(2))).toBe(false);
  });
});

describe("meetsPriorityFloor", () => {
  it("passes priorities at or above the floor", () => {
    expect(meetsPriorityFloor("urgent", "high")).toBe(true);
    expect(meetsPriorityFloor("high", "high")).toBe(true);
    expect(meetsPriorityFloor("low", "high")).toBe(false);
  });

  it("passes everything at the default floor", () => {
    for (const priority of ["none", "low", "medium", "high", "urgent"] as const) {
      expect(meetsPriorityFloor(priority, "none")).toBe(true);
    }
  });
});

describe("hasAnyChannel", () => {
  it("is false when the device is off entirely", () => {
    expect(hasAnyChannel(settings({ enabled: false }))).toBe(false);
  });

  it("is false when every channel is off", () => {
    expect(hasAnyChannel(settings({ channels: { in_app: false, browser: false } }))).toBe(false);
  });

  it("is true with a single channel on", () => {
    expect(hasAnyChannel(settings({ channels: { in_app: false, browser: true } }))).toBe(true);
  });
});

describe("planDelivery", () => {
  const now = at(12);

  it("raises everything when there is nothing to suppress", () => {
    const plan = planDelivery([reminder()], settings(), now);
    expect(plan.singles).toHaveLength(1);
    expect(plan.suppressed).toHaveLength(0);
  });

  it("suppresses everything when the device is off", () => {
    const plan = planDelivery([reminder()], settings({ enabled: false }), now);
    expect(plan.singles).toHaveLength(0);
    expect(plan.suppressed[0].reason).toBe("device_off");
  });

  it("suppresses everything when no channel is on", () => {
    const plan = planDelivery(
      [reminder()],
      settings({ channels: { in_app: false, browser: false } }),
      now
    );
    expect(plan.suppressed[0].reason).toBe("no_channel");
  });

  it("reports a muted reminder as muted, not as quiet", () => {
    const plan = planDelivery(
      [reminder({ is_enabled: false })],
      settings({ quietHours: { enabled: true, start: "00:00", end: "23:59" } }),
      now
    );
    expect(plan.suppressed[0].reason).toBe("muted");
  });

  it("reports quiet hours before digesting", () => {
    const plan = planDelivery(
      [reminder()],
      settings({
        quietHours: { enabled: true, start: "00:00", end: "23:59" },
        digest: { enabled: true, windowMinutes: 5 },
      }),
      at(3)
    );
    expect(plan.batched).toHaveLength(0);
    expect(plan.suppressed[0].reason).toBe("quiet_hours");
  });

  it("drops anything below the priority floor", () => {
    const plan = planDelivery(
      [reminder({ priority: "low" }), reminder({ id: "r2", priority: "urgent" })],
      settings({ minPriority: "high" }),
      now
    );
    expect(plan.singles.map((r) => r.id)).toEqual(["r2"]);
    expect(plan.suppressed[0].reason).toBe("below_priority");
  });

  it("batches everything when the digest is on", () => {
    const plan = planDelivery(
      [reminder(), reminder({ id: "r2" })],
      settings({ digest: { enabled: true, windowMinutes: 5 } }),
      now
    );
    expect(plan.singles).toHaveLength(0);
    expect(plan.batched).toHaveLength(2);
  });

  it("batches only when the window is positive", () => {
    const plan = planDelivery(
      [reminder()],
      settings({ digest: { enabled: true, windowMinutes: 0 } }),
      now
    );
    expect(plan.singles).toHaveLength(1);
    expect(plan.batched).toHaveLength(0);
  });

  it("keeps suppressed rows out of the raised batches", () => {
    const plan = planDelivery(
      [reminder(), reminder({ id: "r2", is_enabled: false })],
      settings({ digest: { enabled: true, windowMinutes: 5 } }),
      now
    );
    expect(plan.batched.map((r) => r.id)).toEqual(["r1"]);
    expect(plan.suppressed).toHaveLength(1);
  });

  it("handles an empty batch without inventing rows", () => {
    const plan = planDelivery([], settings(), now);
    expect(plan.singles).toHaveLength(0);
    expect(plan.batched).toHaveLength(0);
    expect(plan.suppressed).toHaveLength(0);
  });
});

describe("buildDigest", () => {
  it("reads as a plain alert for a single reminder", () => {
    const digest = buildDigest([reminder({ title: "Call mum", note: "Ring back" })]);
    expect(digest.title).toBe("Call mum");
    expect(digest.body).toBe("Ring back");
  });

  it("counts the batch rather than listing every row", () => {
    const digest = buildDigest([
      reminder({ id: "a", title: "One" }),
      reminder({ id: "b", title: "Two" }),
    ]);
    expect(digest.title).toBe("2 reminders due");
    expect(digest.body).toContain("• One");
    expect(digest.body).toContain("• Two");
  });

  it("caps the listed rows and counts the remainder", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      reminder({ id: `r${index}`, title: `Task ${index}` })
    );
    const digest = buildDigest(many);
    expect(digest.body).toContain("+5 more");
    // 4 listed + 1 overflow line.
    expect(digest.body.split("\n")).toHaveLength(5);
  });

  it("labels each row with its project", () => {
    const digest = buildDigest([
      reminder({ id: "a", title: "Standup", project_name: "Apollo" }),
      reminder({ id: "b", title: "Retro" }),
    ]);
    expect(digest.body).toContain("Standup · Apollo");
    expect(digest.body).toContain("• Retro");
  });

  it("returns something harmless for an empty batch", () => {
    expect(buildDigest([])).toEqual({ title: "No reminders", body: "" });
  });
});

describe("digestFlushAt", () => {
  const now = 1_000_000;

  it("is null when digesting is off", () => {
    expect(digestFlushAt(now, settings())).toBeNull();
  });

  it("schedules the flush one window after the first due row", () => {
    const at1 = digestFlushAt(now, settings({ digest: { enabled: true, windowMinutes: 5 } }), now);
    expect(at1).toBe(now + 5 * 60_000);
  });

  it("waits out the rest of the window when it has not elapsed yet", () => {
    // Came due 1 minute ago, window is 5 — flush in 4 minutes, not now.
    expect(digestFlushAt(now - 60_000, settings({ digest: { enabled: true, windowMinutes: 5 } }), now)).toBe(
      now + 4 * 60_000
    );
  });

  it("flushes immediately when the window has already elapsed", () => {
    const longAgo = now - 10 * 60_000;
    expect(digestFlushAt(longAgo, settings({ digest: { enabled: true, windowMinutes: 5 } }), now)).toBe(now);
  });

  it("never schedules a negative window", () => {
    const at1 = digestFlushAt(now, settings({ digest: { enabled: true, windowMinutes: -5 } }), now);
    expect(at1).toBe(now);
  });
});

describe("normalizeSettings", () => {
  it("returns the defaults for junk", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(normalizeSettings("nope")).toEqual(DEFAULT_NOTIFY_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_NOTIFY_SETTINGS);
  });

  it("keeps valid stored values", () => {
    const stored = normalizeSettings({
      enabled: false,
      channels: { in_app: false, browser: true },
      quietHours: { enabled: true, start: "23:00", end: "07:30" },
      digest: { enabled: true, windowMinutes: 10 },
      minPriority: "high",
      browserPermission: "granted",
    });
    expect(stored.enabled).toBe(false);
    expect(stored.channels.browser).toBe(true);
    expect(stored.quietHours.end).toBe("07:30");
    expect(stored.minPriority).toBe("high");
    expect(stored.browserPermission).toBe("granted");
  });

  it("repairs individual bad fields without discarding the rest", () => {
    const stored = normalizeSettings({
      enabled: true,
      channels: { in_app: "yes", browser: true },
      quietHours: { enabled: true, start: "99:99", end: "07:00" },
      minPriority: "catastrophic",
    });
    expect(stored.enabled).toBe(true);
    expect(stored.channels.in_app).toBe(DEFAULT_NOTIFY_SETTINGS.channels.in_app);
    expect(stored.channels.browser).toBe(true);
    expect(stored.quietHours.start).toBe(DEFAULT_NOTIFY_SETTINGS.quietHours.start);
    expect(stored.quietHours.end).toBe("07:00");
    expect(stored.minPriority).toBe("none");
  });

  it("rejects an unknown permission state", () => {
    expect(normalizeSettings({ browserPermission: "maybe" }).browserPermission).toBe("default");
  });
});