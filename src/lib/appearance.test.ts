import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPEARANCE,
  appearanceAttributes,
  isDarkTheme,
  resolveAppearance,
  resolveTheme,
  sanitizeAppearance,
} from "@/lib/appearance";
import type { StoredAppearance } from "@/lib/appearance";

const ACCOUNT = {
  theme: "dark",
  accent: "rose",
  cardStyle: "gradient",
  density: "compact",
  background: "slate",
} as const;

function stored(overrides: Partial<StoredAppearance> = {}): StoredAppearance {
  return { ...DEFAULT_APPEARANCE, savedAt: 1_000, ...overrides };
}

describe("resolveTheme", () => {
  it("passes an explicit theme through untouched", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("keeps AMOLED AMOLED regardless of the OS preference", () => {
    expect(resolveTheme("amoled", false)).toBe("amoled");
    expect(resolveTheme("amoled", true)).toBe("amoled");
  });

  it("folds the system option into light or dark", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });

  it("never resolves system to AMOLED — the OS cannot ask for true black", () => {
    expect(resolveTheme("system", true)).not.toBe("amoled");
  });
});

describe("isDarkTheme", () => {
  it("treats both dark canvases as dark", () => {
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("amoled")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
  });
});

describe("sanitizeAppearance", () => {
  it("returns the defaults for junk input", () => {
    for (const input of [null, undefined, 42, "nope", []]) {
      expect(sanitizeAppearance(input)).toEqual(DEFAULT_APPEARANCE);
    }
  });

  it("keeps every valid value", () => {
    expect(sanitizeAppearance(ACCOUNT)).toEqual(ACCOUNT);
  });

  it("falls back per key, not per object", () => {
    const result = sanitizeAppearance({ ...ACCOUNT, accent: "chartreuse" });

    // A value the database has never heard of must not reset the theme too.
    expect(result.accent).toBe(DEFAULT_APPEARANCE.accent);
    expect(result.theme).toBe("dark");
    expect(result.cardStyle).toBe("gradient");
  });

  it("rejects values of the wrong type", () => {
    const result = sanitizeAppearance({ ...ACCOUNT, density: 2, theme: null });
    expect(result.density).toBe(DEFAULT_APPEARANCE.density);
    expect(result.theme).toBe(DEFAULT_APPEARANCE.theme);
  });
});

describe("appearanceAttributes", () => {
  it("maps each key onto the attribute globals.css reads", () => {
    expect(appearanceAttributes(ACCOUNT)).toEqual({
      "data-accent": "rose",
      "data-card-style": "gradient",
      "data-density": "compact",
      "data-background": "slate",
    });
  });
});

describe("resolveAppearance", () => {
  const accountUpdatedAt = "2024-06-01T12:00:00.000Z";
  const accountMs = Date.parse(accountUpdatedAt);

  it("adopts the account when the device has nothing stored", () => {
    const result = resolveAppearance(null, ACCOUNT, accountUpdatedAt);
    expect(result).toEqual({ appearance: ACCOUNT, source: "account" });
  });

  it("keeps a local choice that is newer than the account row", () => {
    const result = resolveAppearance(
      stored({ accent: "lime", savedAt: accountMs + 60_000 }),
      ACCOUNT,
      accountUpdatedAt
    );

    expect(result.source).toBe("local");
    expect(result.appearance.accent).toBe("lime");
  });

  it("takes the account when it was changed on another device", () => {
    const result = resolveAppearance(
      stored({ accent: "lime", savedAt: accountMs - 60_000 }),
      ACCOUNT,
      accountUpdatedAt
    );

    expect(result.source).toBe("account");
    expect(result.appearance.accent).toBe("rose");
  });

  it("does not let an unknown timestamp reset a local choice", () => {
    for (const updatedAt of [null, undefined, "not-a-date"]) {
      const result = resolveAppearance(
        stored({ accent: "lime", savedAt: accountMs + 60_000 }),
        ACCOUNT,
        updatedAt
      );
      expect(result.source).toBe("local");
      expect(result.appearance.accent).toBe("lime");
    }
  });

  it("sanitizes whichever copy wins", () => {
    const result = resolveAppearance(
      stored({ accent: "chartreuse" as never, savedAt: accountMs + 60_000 }),
      ACCOUNT,
      accountUpdatedAt
    );

    expect(result.appearance.accent).toBe(DEFAULT_APPEARANCE.accent);
  });

  it("treats a missing savedAt as older than any account row", () => {
    const result = resolveAppearance(
      { ...DEFAULT_APPEARANCE } as StoredAppearance,
      ACCOUNT,
      accountUpdatedAt
    );
    expect(result.source).toBe("account");
  });
});