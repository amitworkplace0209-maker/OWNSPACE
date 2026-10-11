import { describe, expect, it } from "vitest";
import {
  bucketHealth,
  bySizeDescending,
  clampedPercent,
  describeCounts,
  percentOf,
  shareOf,
  sumSizes,
  summariseDriveUsage,
  summariseOrphans,
  type DriveAccountUsage,
  type StorageSlice,
} from "@/lib/storage-logic";

const slice = (key: string, sizeBytes: number, count = 1): StorageSlice => ({
  key,
  label: key,
  sizeBytes,
  count,
});

describe("percentOf", () => {
  it("returns a percentage to one decimal", () => {
    expect(percentOf(50, 200)).toBe(25);
    expect(percentOf(1, 3)).toBe(33.3);
  });

  it("returns 0 for an empty total instead of NaN", () => {
    expect(percentOf(10, 0)).toBe(0);
  });

  it("returns 0 for non-finite input", () => {
    expect(percentOf(Number.NaN, 100)).toBe(0);
    expect(percentOf(10, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("clampedPercent", () => {
  it("clamps above 100", () => {
    expect(clampedPercent(300, 200)).toBe(100);
  });

  it("clamps below 0", () => {
    expect(clampedPercent(-5, 200)).toBe(0);
  });

  it("is 0 for an empty total", () => {
    expect(clampedPercent(10, 0)).toBe(0);
  });
});

describe("shareOf", () => {
  it("returns a 0-1 fraction", () => {
    expect(shareOf(25, 100)).toBe(0.25);
  });

  it("clamps out-of-range input", () => {
    expect(shareOf(500, 100)).toBe(1);
    expect(shareOf(-5, 100)).toBe(0);
  });
});

describe("sumSizes and bySizeDescending", () => {
  it("sums sizes, ignoring missing ones", () => {
    expect(sumSizes([slice("a", 10), { ...slice("b", 0), sizeBytes: Number.NaN }])).toBe(10);
  });

  it("orders by size, biggest first", () => {
    const sorted = bySizeDescending([slice("a", 5), slice("b", 50), slice("c", 20)]);
    expect(sorted.map((entry) => entry.key)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate its input", () => {
    const input = [slice("a", 5), slice("b", 50)];
    bySizeDescending(input);
    expect(input.map((entry) => entry.key)).toEqual(["a", "b"]);
  });
});

describe("bucketHealth", () => {
  it("is unknown when the scan failed", () => {
    expect(
      bucketHealth({ usedBytes: 1, limitBytes: null, largestObjectBytes: 0, fileSizeLimitBytes: null, error: "boom" })
    ).toBe("unknown");
  });

  it("is unknown when no total quota is reported", () => {
    expect(bucketHealth({ usedBytes: 10, limitBytes: null, largestObjectBytes: 0, fileSizeLimitBytes: null })).toBe(
      "unknown"
    );
  });

  it("warns when an object nears the per-object cap", () => {
    expect(
      bucketHealth({
        usedBytes: 10,
        limitBytes: null,
        largestObjectBytes: 99,
        fileSizeLimitBytes: 100,
      })
    ).toBe("warning");
  });

  it("stays ok when objects are small", () => {
    expect(
      bucketHealth({
        usedBytes: 10,
        limitBytes: null,
        largestObjectBytes: 10,
        fileSizeLimitBytes: 100,
      })
    ).toBe("ok");
  });

  it("escalates against a real total quota", () => {
    const base = { largestObjectBytes: 0, fileSizeLimitBytes: null };
    expect(bucketHealth({ ...base, usedBytes: 50, limitBytes: 100 })).toBe("ok");
    expect(bucketHealth({ ...base, usedBytes: 85, limitBytes: 100 })).toBe("warning");
    expect(bucketHealth({ ...base, usedBytes: 99, limitBytes: 100 })).toBe("critical");
  });
});

describe("summariseOrphans", () => {
  it("is unavailable when the scan could not run", () => {
    expect(
      summariseOrphans({ storedBytes: null, storedCount: null, trackedBytes: 10, trackedCount: 1 })
    ).toEqual({ orphanBytes: 0, orphanCount: 0, unavailable: true });
  });

  it("reports the gap between stored and tracked", () => {
    expect(
      summariseOrphans({ storedBytes: 100, storedCount: 5, trackedBytes: 60, trackedCount: 3 })
    ).toEqual({ orphanBytes: 40, orphanCount: 2, unavailable: false });
  });

  it("never reports negative space when a row outlives its blob", () => {
    expect(
      summariseOrphans({ storedBytes: 10, storedCount: 1, trackedBytes: 100, trackedCount: 4 })
    ).toEqual({ orphanBytes: 0, orphanCount: 0, unavailable: false });
  });

  it("reports a clean state", () => {
    expect(
      summariseOrphans({ storedBytes: 100, storedCount: 5, trackedBytes: 100, trackedCount: 5 })
    ).toEqual({ orphanBytes: 0, orphanCount: 0, unavailable: false });
  });
});

describe("summariseDriveUsage", () => {
  const account = (over: Partial<DriveAccountUsage> = {}): DriveAccountUsage => ({
    connectionId: "c1",
    email: "a@x.com",
    label: null,
    status: "active",
    quotaUsed: 100,
    quotaLimit: 1000,
    sharedDriveUsed: null,
    sharedDriveLimit: null,
    linkedBytes: 10,
    linkedCount: 1,
    error: null,
    ...over,
  });

  it("sums quota and links across accounts", () => {
    const summary = summariseDriveUsage([
      account(),
      account({ connectionId: "c2", email: "b@x.com", quotaUsed: 200, quotaLimit: 500, linkedBytes: 5, linkedCount: 2 }),
    ]);
    expect(summary.totalQuotaUsed).toBe(300);
    expect(summary.totalQuotaLimit).toBe(1500);
    expect(summary.totalLinkedBytes).toBe(15);
    expect(summary.totalLinkedCount).toBe(3);
  });

  it("excludes accounts with no quota from the totals but counts them", () => {
    const summary = summariseDriveUsage([
      account(),
      account({ connectionId: "c2", email: "b@x.com", quotaUsed: null, quotaLimit: null }),
    ]);
    expect(summary.totalQuotaUsed).toBe(100);
    expect(summary.totalQuotaLimit).toBe(1000);
    expect(summary.unavailable).toBe(1);
  });

  it("handles no accounts", () => {
    const summary = summariseDriveUsage([]);
    expect(summary.totalQuotaUsed).toBe(0);
    expect(summary.unavailable).toBe(0);
  });
});

describe("describeCounts", () => {
  it("skips zero entries", () => {
    expect(describeCounts([{ count: 2, label: "projects" }, { count: 0, label: "tasks" }])).toBe(
      "2 projects"
    );
  });

  it("reads none when everything is zero", () => {
    expect(describeCounts([{ count: 0, label: "files" }])).toBe("none");
  });
});