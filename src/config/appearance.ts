export type AccentColor =
  | "indigo"
  | "violet"
  | "blue"
  | "cyan"
  | "emerald"
  | "teal"
  | "rose"
  | "orange"
  | "amber"
  | "lime"
  | "fuchsia"
  | "sky";

export type CardStyle =
  | "default"
  | "elevated"
  | "soft"
  | "outline"
  | "glass"
  | "compact"
  | "gradient";

export type Density = "comfortable" | "compact";

export type BackgroundPreset =
  | "clean"
  | "soft"
  | "tinted"
  | "contrast"
  | "creamy"
  | "deep"
  | "slate"
  | "charcoal";

export type Theme = "light" | "dark" | "amoled" | "system";

/** A theme after the OS preference has been folded in. */
export type ResolvedTheme = "light" | "dark" | "amoled";

// ---------------------------------------------------------------------------
// Identity lists — single source of truth for validation, the settings UI and
// the pre-paint inline script (which cannot import modules).
// ---------------------------------------------------------------------------

export const THEME_IDS = ["light", "dark", "amoled", "system"] as const satisfies readonly Theme[];
export const RESOLVED_THEME_IDS = ["light", "dark", "amoled"] as const satisfies readonly ResolvedTheme[];
export const ACCENT_IDS = [
  "indigo",
  "violet",
  "blue",
  "cyan",
  "emerald",
  "teal",
  "rose",
  "orange",
  "amber",
  "lime",
  "fuchsia",
  "sky",
] as const satisfies readonly AccentColor[];
export const CARD_STYLE_IDS = [
  "default",
  "elevated",
  "soft",
  "outline",
  "glass",
  "compact",
  "gradient",
] as const satisfies readonly CardStyle[];
export const DENSITY_IDS = ["comfortable", "compact"] as const satisfies readonly Density[];
export const BACKGROUND_IDS = [
  "clean",
  "soft",
  "tinted",
  "contrast",
  "creamy",
  "deep",
  "slate",
  "charcoal",
] as const satisfies readonly BackgroundPreset[];

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_THEME: Theme = "system";
export const DEFAULT_ACCENT: AccentColor = "indigo";
export const DEFAULT_CARD_STYLE: CardStyle = "default";
export const DEFAULT_DENSITY: Density = "comfortable";
export const DEFAULT_BACKGROUND: BackgroundPreset = "clean";

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

export const themeModes: Array<{
  id: Theme;
  label: string;
  description: string;
}> = [
  { id: "light", label: "Light", description: "Bright surfaces with soft shadows." },
  { id: "dark", label: "Dark", description: "Layered charcoal, easy at night." },
  {
    id: "amoled",
    label: "AMOLED",
    description: "True black — unlit pixels stay off on OLED screens.",
  },
  { id: "system", label: "System", description: "Follow your device appearance." },
];

export const accentPresets: Array<{
  id: AccentColor;
  label: string;
  /** Flat swatch for the settings picker. */
  swatch: string;
  /** Second stop, so the picker can preview the accent gradient. */
  swatchTo: string;
}> = [
  { id: "indigo", label: "Indigo", swatch: "#6366f1", swatchTo: "#a855f7" },
  { id: "violet", label: "Violet", swatch: "#8b5cf6", swatchTo: "#d946ef" },
  { id: "blue", label: "Blue", swatch: "#2563eb", swatchTo: "#0ea5e9" },
  { id: "cyan", label: "Cyan", swatch: "#06b6d4", swatchTo: "#3b82f6" },
  { id: "emerald", label: "Emerald", swatch: "#059669", swatchTo: "#84cc16" },
  { id: "teal", label: "Teal", swatch: "#14b8a6", swatchTo: "#22d3ee" },
  { id: "rose", label: "Rose", swatch: "#e11d48", swatchTo: "#fb923c" },
  { id: "orange", label: "Orange", swatch: "#ea580c", swatchTo: "#facc15" },
  { id: "amber", label: "Amber", swatch: "#f59e0b", swatchTo: "#fbbf24" },
  { id: "lime", label: "Lime", swatch: "#65a30d", swatchTo: "#22c55e" },
  { id: "fuchsia", label: "Fuchsia", swatch: "#c026d3", swatchTo: "#8b5cf6" },
  { id: "sky", label: "Sky", swatch: "#0284c7", swatchTo: "#22d3ee" },
];

export const cardStyles: Array<{ id: CardStyle; label: string; description: string }> = [
  { id: "default", label: "Default", description: "Clean surface with subtle depth." },
  { id: "elevated", label: "Elevated", description: "Lifted with a soft drop shadow." },
  { id: "soft", label: "Soft", description: "Accent-tinted, no hard edges." },
  { id: "outline", label: "Outline", description: "Bordered, backgroundless cards." },
  { id: "glass", label: "Glass", description: "Translucent frosted panels." },
  { id: "gradient", label: "Gradient", description: "Accent gradient hairline border." },
  { id: "compact", label: "Compact", description: "Reduced spacing density." },
];

export const densities: Array<{ id: Density; label: string; description: string }> = [
  { id: "comfortable", label: "Comfortable", description: "Roomy cards and lists." },
  { id: "compact", label: "Compact", description: "More content, less padding." },
];

export const lightBackgrounds: Array<{ id: BackgroundPreset; label: string }> = [
  { id: "clean", label: "Clean" },
  { id: "soft", label: "Soft" },
  { id: "tinted", label: "Tinted" },
  { id: "contrast", label: "Contrast" },
  { id: "creamy", label: "Creamy" },
];

export const darkBackgrounds: Array<{ id: BackgroundPreset; label: string }> = [
  { id: "deep", label: "Deep" },
  { id: "slate", label: "Slate" },
  { id: "charcoal", label: "Charcoal" },
];

/**
 * Browser-chrome colour per resolved theme, written to
 * `<meta name="theme-color">` so the address/status bar matches the app
 * instead of flashing a hardcoded white or grey.
 */
export const themeChromeColor: Record<ResolvedTheme, string> = {
  light: "#f5f6fa",
  dark: "#0a0c11",
  amoled: "#000000",
};

/** iOS status-bar treatment per resolved theme. */
export const appleStatusBarStyle: Record<ResolvedTheme, "default" | "black" | "black-translucent"> =
  {
    light: "default",
    dark: "black",
    amoled: "black-translucent",
  };