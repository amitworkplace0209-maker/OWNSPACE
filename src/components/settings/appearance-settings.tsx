"use client";

import * as React from "react";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Check, Monitor, Moon, MoonStar, Sun } from "lucide-react";
import { updatePreferencesAction } from "@/lib/actions/profile";
import {
  accentPresets,
  cardStyles,
  darkBackgrounds,
  densities,
  lightBackgrounds,
  themeModes,
  type AccentColor,
  type BackgroundPreset,
  type CardStyle,
  type Density,
  type Theme,
} from "@/config/appearance";
import { updateAppearance, useAppearance } from "@/lib/appearance-store";
import { cn } from "cn";

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  amoled: MoonStar,
  system: Monitor,
} as const satisfies Record<Theme, React.ElementType>;

type PrefsState = { error?: string; data?: { id: string } };

/**
 * Appearance settings.
 *
 * Every control applies locally first (through the appearance store, which owns
 * the `<html>` data attributes and localStorage) and only then persists to the
 * account. Writing to the server first made the whole panel feel laggy and left
 * a visible mismatch whenever the action failed.
 *
 * Card-style previews are real `Card` elements with a `data-card-style`
 * attribute, not illustrations — so a preset cannot look correct here and wrong
 * on the dashboard.
 */
export function AppearanceSettings({
  defaultView,
  dailyNoteTime,
}: {
  defaultView: string;
  dailyNoteTime: string | null;
}) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { appearance: view } = useAppearance();
  const [state, applyAction, pending] = useActionState<PrefsState, FormData>(
    updatePreferencesAction,
    {}
  );
  const [, startTransition] = useTransition();

  const isDark = resolvedTheme !== "light";

  React.useEffect(() => {
    if (state.data) toast.success("Appearance saved.");
    if (state.error) toast.error(state.error);
  }, [state.data, state.error]);

  function persist(patch: {
    theme?: Theme;
    accent?: AccentColor;
    cardStyle?: CardStyle;
    density?: Density;
    background?: BackgroundPreset;
  }) {
    // Immediate: DOM + localStorage, so the whole app repaints now.
    updateAppearance(patch);

    const next = {
      theme: patch.theme ?? view.theme,
      default_view: defaultView,
      daily_note_time: dailyNoteTime ?? "",
      accent_color: patch.accent ?? view.accent,
      card_style: patch.cardStyle ?? view.cardStyle,
      density: patch.density ?? view.density,
      background_preset: patch.background ?? view.background,
    };

    const formData = new FormData();
    for (const [key, value] of Object.entries(next)) formData.set(key, value);

    startTransition(() => applyAction(formData));
    router.refresh();
  }

  const activeBackgrounds = isDark ? darkBackgrounds : lightBackgrounds;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Theme</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {themeModes.map((mode) => {
            const Icon = THEME_ICONS[mode.id];
            const active = view.theme === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => persist({ theme: mode.id })}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-3 text-left transition",
                  active
                    ? "border-primary bg-primary/5 ring-2 ring-primary/25"
                    : "hover:bg-accent"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition",
                    active
                      ? "icon-tile"
                      : "icon-tile-muted"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1 text-sm font-medium">
                    {mode.label}
                    {active ? (
                      <Check className="size-3.5 text-primary" aria-hidden="true" />
                    ) : null}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {mode.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Accent color</legend>
        <div className="flex flex-wrap gap-2">
          {accentPresets.map((preset) => {
            const active = view.accent === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={preset.label}
                title={preset.label}
                onClick={() => persist({ accent: preset.id })}
                style={{
                  backgroundImage: `linear-gradient(135deg, ${preset.swatch}, ${preset.swatchTo})`,
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition hover:scale-110",
                  active ? "ring-2 ring-foreground" : "ring-1 ring-black/10 dark:ring-white/15"
                )}
              >
                {active ? (
                  <Check className="size-4 text-white drop-shadow" aria-hidden="true" />
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Card style</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cardStyles.map((style) => {
            const active = view.cardStyle === style.id;
            return (
              <button
                key={style.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => persist({ cardStyle: style.id })}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-2 text-left transition",
                  active
                    ? "border-primary ring-2 ring-primary/25"
                    : "hover:bg-accent"
                )}
              >
                {/* Real card markup under the real attribute, so the preview
                    cannot drift from what the dashboard actually renders. The
                    attribute sits on a wrapper because the gradient preset is
                    selected by an ancestor selector. */}
                <span
                  data-card-style={style.id}
                  aria-hidden="true"
                  className="flex rounded-xl bg-background p-0.5"
                >
                  <span
                    data-slot="card"
                    className="flex h-12 flex-1 flex-col justify-center gap-1.5 overflow-hidden rounded-xl bg-(--card-bg) px-3 ring-1 ring-(--card-ring-color) shadow-(--card-shadow)"
                  >
                    <span className="h-1.5 w-3/4 rounded-full bg-foreground/25" />
                    <span className="h-1.5 w-1/2 rounded-full bg-foreground/15" />
                  </span>
                </span>
                <span className="flex items-center justify-between gap-2 px-0.5">
                  <span className="text-sm font-medium">{style.label}</span>
                  {active ? (
                    <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  ) : null}
                </span>
                <span className="px-0.5 text-xs leading-snug text-muted-foreground">
                  {style.description}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Density</legend>
          <div className="flex flex-col gap-2">
            {densities.map((option) => {
              const active = view.density === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => persist({ density: option.id })}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition",
                    active
                      ? "border-primary bg-primary/5"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs">{option.description}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Background</legend>
          <div className="flex flex-wrap gap-2">
            {activeBackgrounds.map((option) => {
              const active = view.background === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() =>
                    persist({ background: option.id as BackgroundPreset })
                  }
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {isDark
              ? "Dark presets apply to Dark and AMOLED."
              : "Light presets apply to Light mode."}
          </p>
        </fieldset>
      </div>

      <p className="text-xs text-muted-foreground">
        {pending
          ? "Saving…"
          : "Appearance is saved to your account and synced across devices."}
      </p>
    </div>
  );
}