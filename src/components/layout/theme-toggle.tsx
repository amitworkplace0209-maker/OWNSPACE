"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, MoonStar, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setThemeAction } from "@/lib/actions/profile";
import { updateAppearance } from "@/lib/appearance-store";
import { themeModes, type Theme } from "@/config/appearance";

const MODE_ICONS = {
  light: Sun,
  dark: Moon,
  amoled: MoonStar,
  system: Monitor,
} as const satisfies Record<Theme, React.ElementType>;

/**
 * Theme picker.
 *
 * The old version reported "mounted" through a `useSyncExternalStore` whose
 * `getSnapshot` was a constant `true`, so the server rendered the System icon
 * and the client immediately rendered the real one — a guaranteed hydration
 * mismatch. Reading next-themes' own store through the same primitive means the
 * server snapshot is the real thing too, so both sides agree.
 */
const EMPTY_SUBSCRIBE = () => () => {};

export function ThemeToggle({
  align = "end",
  showLabel = false,
}: {
  align?: "start" | "center" | "end";
  showLabel?: boolean;
}) {
  const { theme, setTheme } = useTheme();

  const mounted = React.useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    () => true,
    () => false
  );

  const current: Theme = mounted ? ((theme as Theme) ?? "system") : "system";
  const CurrentIcon = MODE_ICONS[current] ?? Monitor;

  function choose(next: Theme) {
    // next-themes owns the `.light`/`.dark`/`.amoled` class and local storage;
    // the store mirrors the choice so the pre-paint script agrees with it.
    setTheme(next);
    updateAppearance({ theme: next });
    // Persist to the account so the choice survives a reload and follows the
    // user to another device.
    void setThemeAction(next).catch(() => {});
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={showLabel ? "sm" : "icon-sm"}
            className="relative"
            aria-label={`Appearance: ${MODE_LABEL[current]}. Change theme`}
          >
            <CurrentIcon className="size-4 transition-transform duration-200" />
            {showLabel ? (
              <span className="text-xs font-medium">{MODE_LABEL[current]}</span>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align={align} className="w-52">
        {themeModes.map((mode) => {
          const Icon = MODE_ICONS[mode.id];
          const active = current === mode.id;
          return (
            <DropdownMenuItem
              key={mode.id}
              onClick={() => choose(mode.id)}
              className="gap-2"
            >
              <Icon className={active ? "text-primary" : undefined} />
              <span className="flex flex-col items-start">
                <span>{mode.label}</span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {mode.description}
                </span>
              </span>
              {active ? (
                <Check className="ml-auto size-4 shrink-0 self-center text-primary" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const MODE_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  amoled: "AMOLED",
  system: "System",
};