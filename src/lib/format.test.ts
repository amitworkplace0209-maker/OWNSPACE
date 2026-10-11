import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateShort,
  formatDuration,
  formatDurationMinutes,
  formatFileSize,
  formatRelativeTime,
  humanize,
  isOverdueDate,
  toIsoSubmit,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSignedCurrency,
} from "./format";

describe("formatDate", () => {
  it("formats YYYY-MM-DD into a readable date", () => {
    expect(formatDate("2026-09-07")).toBe("Sep 7, 2026");
  });

  it("returns the fallback placeholder for missing input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("", { fallback: "none" })).toBe("none");
  });
});

describe("formatDurationMinutes", () => {
  it("formats sub-hour durations in minutes", () => {
    expect(formatDurationMinutes(30)).toBe("30m");
    expect(formatDurationMinutes(0)).toBe("0m");
  });

  it("formats exact hours without minutes", () => {
    expect(formatDurationMinutes(120)).toBe("2h");
  });

  it("combines hours and minutes", () => {
    expect(formatDurationMinutes(90)).toBe("1h 30m");
  });

  it("rounds fractional minutes", () => {
    expect(formatDurationMinutes(89.6)).toBe("1h 30m");
  });
});

describe("formatDuration", () => {
  it("converts milliseconds to a duration label", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(90_000)).toBe("1m");
  });
});

describe("formatFileSize", () => {
  it("formats bytes and larger units", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB");
  });

  it("returns placeholder for invalid input", () => {
    expect(formatFileSize(null)).toBe("—");
    expect(formatFileSize(-1)).toBe("—");
  });
});

describe("humanize", () => {
  it("capitalizes snake_case identifiers", () => {
    expect(humanize("in_progress")).toBe("In Progress");
    expect(humanize("task_reminder_at")).toBe("Task Reminder At");
  });

  it("splits camelCase into words", () => {
    expect(humanize("helloWorld")).toBe("Hello World");
  });

  it("normalizes kebab-case", () => {
    expect(humanize("data-transfer-full")).toBe("Data Transfer Full");
  });
});

describe("toIsoSubmit", () => {
  it("returns empty string for empty input", () => {
    expect(toIsoSubmit("")).toBe("");
    expect(toIsoSubmit("   ")).toBe("");
  });

  it("converts a local datetime-local value to a full UTC ISO timestamp", () => {
    const result = toIsoSubmit("2026-09-07T09:00");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("passes already-valid ISO timestamps through unchanged", () => {
    const iso = "2026-09-07T09:00:00.000Z";
    expect(toIsoSubmit(iso)).toBe(iso);
  });
});

describe("text edge cases", () => {
  it("formatDate treats midnight UTC strings consistently", () => {
    expect(formatDateShort("2026-09-07")).toBe("Sep 7");
  });

  it("formatRelativeTime returns placeholder for null", () => {
    expect(formatRelativeTime(null)).toBe("—");
  });

  it("isOverdueDate returns false for null", () => {
    expect(isOverdueDate(null)).toBe(false);
  });
});
const RS = "\u20B9";

describe("formatCurrency", () => {
  it("defaults to rupees", () => {
    expect(formatCurrency(1500)).toContain(RS);
    expect(formatCurrency(1500)).toContain("1,500");
  });

  it("groups in the Indian 2-2-3 pattern", () => {
    // Twelve lakh fifty-six thousand. Under en-US this would read
    // "?1,256,000.00", which looks wrong to every Indian reader.
    expect(formatCurrency(1256000)).toBe(`${RS}12,56,000.00`);
    expect(formatCurrency(123456789)).toBe(`${RS}12,34,56,789.00`);
  });

  it("keeps four digits ungrouped beyond the first thousand", () => {
    expect(formatCurrency(9999)).toBe(`${RS}9,999.00`);
  });

  it("renders lakh and crore in compact mode", () => {
    expect(formatCurrency(1256000, "INR", { compact: true })).toBe(`${RS}12.6L`);
    expect(formatCurrency(123456789, "INR", { compact: true })).toBe(`${RS}12.3Cr`);
  });

  it("supports other currencies", () => {
    expect(formatCurrency(1500, "USD")).toContain("1,500");
  });

  it("returns the fallback for null, undefined and NaN", () => {
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(Number.NaN)).toBe("—");
    expect(formatCurrency(null, "INR", { fallback: "0" })).toBe("0");
  });

  it("survives an unknown currency code", () => {
    // An unknown code throws inside Intl; a bare number beats an error.
    expect(formatCurrency(1000, "NOTACODE")).toContain("1000.00");
  });
});

describe("formatSignedCurrency", () => {
  it("prefixes income and expenses with their direction", () => {
    expect(formatSignedCurrency(500).startsWith("+")).toBe(true);
    expect(formatSignedCurrency(-500).startsWith("-")).toBe(true);
  });

  it("shows zero without a sign", () => {
    expect(formatSignedCurrency(0).startsWith("+")).toBe(false);
    expect(formatSignedCurrency(0).startsWith("-")).toBe(false);
  });

  it("is dash for a missing value", () => {
    expect(formatSignedCurrency(null)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("computes a share", () => {
    expect(formatPercent(25, 100)).toBe("25%");
    expect(formatPercent(1, 3, 1)).toBe("33.3%");
  });

  it("returns 0% for an empty total rather than NaN", () => {
    expect(formatPercent(10, 0)).toBe("0%");
  });

  it("handles a negative part", () => {
    expect(formatPercent(-25, 100)).toBe("-25%");
  });
});

describe("formatNumber", () => {
  it("groups without a currency symbol", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
  });

  it("falls back for missing values", () => {
    expect(formatNumber(null)).toBe("0");
    expect(formatNumber(undefined, "—")).toBe("—");
  });

  it("keeps decimals for fractional quantities", () => {
    expect(formatNumber(12.5)).toBe("12.5");
  });
});
