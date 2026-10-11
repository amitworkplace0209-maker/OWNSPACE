import {
  ACCENT_IDS,
  BACKGROUND_IDS,
  CARD_STYLE_IDS,
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD_STYLE,
  DEFAULT_DENSITY,
  DEFAULT_THEME,
  DENSITY_IDS,
  THEME_IDS,
  type AccentColor,
  type BackgroundPreset,
  type CardStyle,
  type Density,
  type ResolvedTheme,
  type Theme,
} from "@/config/appearance";

/**
 * Appearance state lives in exactly two places:
 *
 * 1. `localStorage`, read by a blocking script in `<head>` before the first
 *    paint, so switching accent or density never flashes the default.
 * 2. `user_preferences` in Postgres, which carries the choice across devices.
 *
 * `savedAt` is what lets the two coexist: whichever was written most recently
 * wins, so a change made on a phone shows up on a laptop that already has its
 * own stored preference, while a device that has never chosen anything still
 * adopts the account's.
 */

export const APPEARANCE_STORAGE_KEY = "ownspece:appearance";

export type Appearance = {
  theme: Theme;
  accent: AccentColor;
  cardStyle: CardStyle;
  density: Density;
  background: BackgroundPreset;
};

/** An appearance as persisted locally: the four values plus a write stamp. */
export type StoredAppearance = Appearance & {
  /** Epoch milliseconds of the last local write. */
  savedAt: number;
};

export const DEFAULT_APPEARANCE: Appearance = {
  theme: DEFAULT_THEME,
  accent: DEFAULT_ACCENT,
  cardStyle: DEFAULT_CARD_STYLE,
  density: DEFAULT_DENSITY,
  background: DEFAULT_BACKGROUND,
};

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Coerce anything (localStorage JSON, a database row, a form field) into a
 * complete, valid appearance. Unknown or malformed values fall back to the
 * default for that single key instead of discarding the whole object — a bad
 * `accent` must never reset someone's theme.
 */
export function sanitizeAppearance(input: unknown): Appearance {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  return {
    theme: pick(raw.theme, THEME_IDS, DEFAULT_THEME),
    accent: pick(raw.accent, ACCENT_IDS, DEFAULT_ACCENT),
    cardStyle: pick(raw.cardStyle, CARD_STYLE_IDS, DEFAULT_CARD_STYLE),
    density: pick(raw.density, DENSITY_IDS, DEFAULT_DENSITY),
    background: pick(raw.background, BACKGROUND_IDS, DEFAULT_BACKGROUND),
  };
}

function sanitizeSavedAt(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Fold the `system` option into a concrete theme.
 *
 * `system` deliberately resolves to light or dark only — it can never mean
 * AMOLED, because the OS has no way to ask for "true black".
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

/** True for the two themes that use a dark canvas. */
export function isDarkTheme(resolved: ResolvedTheme): boolean {
  return resolved === "dark" || resolved === "amoled";
}

/** Map an appearance onto the `data-*` attributes globals.css keys off. */
export function appearanceAttributes(
  appearance: Pick<Appearance, "accent" | "cardStyle" | "density" | "background">
): Record<string, string> {
  return {
    "data-accent": appearance.accent,
    "data-card-style": appearance.cardStyle,
    "data-density": appearance.density,
    "data-background": appearance.background,
  };
}

/**
 * Decide which copy of the appearance wins.
 *
 * - No local copy: the account is all there is.
 * - Local copy newer than the account row: the local copy.
 * - Account row newer (changed on another device): the account.
 *
 * A missing or unparseable account timestamp is treated as "very old", so a
 * device that has made its own choice keeps it instead of being reset.
 */
export function resolveAppearance(
  stored: StoredAppearance | null,
  account: Appearance,
  accountUpdatedAt?: string | null
): { appearance: Appearance; source: "local" | "account" } {
  const cleanAccount = sanitizeAppearance(account);
  if (!stored) return { appearance: cleanAccount, source: "account" };

  const accountTime = accountUpdatedAt ? Date.parse(accountUpdatedAt) : Number.NaN;
  const accountMs = Number.isFinite(accountTime) ? accountTime : 0;

  if (accountMs > sanitizeSavedAt(stored.savedAt)) {
    return { appearance: cleanAccount, source: "account" };
  }
  return { appearance: sanitizeAppearance(stored), source: "local" };
}

/** Read the persisted appearance. Returns null when nothing valid is stored. */
export function readStoredAppearance(): StoredAppearance | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      ...sanitizeAppearance(parsed),
      savedAt: sanitizeSavedAt(parsed.savedAt),
    };
  } catch {
    // Private-mode Safari and corrupted JSON both land here.
    return null;
  }
}

/** Persist the appearance for the pre-paint script on the next navigation. */
export function writeStoredAppearance(appearance: Appearance, savedAt = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ ...appearance, savedAt })
    );
  } catch {
    // Storage can be full or blocked; the app still works from the DOM alone.
  }
}

/** Write the appearance to `<html>` so the CSS token layers pick it up. */
export function applyAppearanceToDocument(appearance: Appearance): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  for (const [attribute, value] of Object.entries(appearanceAttributes(appearance))) {
    root.setAttribute(attribute, value);
  }
}