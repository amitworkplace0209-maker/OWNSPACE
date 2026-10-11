"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import {
  appleStatusBarStyle,
  themeChromeColor,
  type ResolvedTheme,
  type Theme,
} from "@/config/appearance";
import { isDarkTheme, resolveTheme } from "@/lib/appearance";

const EMPTY_SUBSCRIBE = () => () => {};

function prefersDarkNow(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Rewrite every matching `<meta>` rather than just the first.
 *
 * Next emits one `theme-color` meta per media query, and the browser picks
 * whichever matches the *operating system* — not the app's chosen theme. Setting
 * the app's colour on all of them is what makes a manually picked AMOLED actually
 * paint a black status bar on a device whose OS is set to light.
 */
function setMeta(selector: string, attr: string, value: string) {
  const existing = document.head.querySelectorAll<HTMLMetaElement>(selector);
  if (existing.length === 0) {
    const created = document.createElement("meta");
    created.setAttribute(attr, value);
    document.head.appendChild(created);
    return;
  }
  for (const element of existing) element.setAttribute(attr, value);
}

function paintChrome(resolved: ResolvedTheme) {
  setMeta('meta[name="theme-color"]', "content", themeChromeColor[resolved]);
  setMeta(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
    "content",
    appleStatusBarStyle[resolved]
  );
}

/**
 * Keeps the browser chrome in step with the theme.
 *
 * The static `<meta name="theme-color">` from the viewport export can only
 * follow the OS, so an AMOLED — or any manually picked dark — theme still paints
 * a light address bar (Android) or status bar (iOS). This is the most visible
 * "dark mode looks broken" tell on mobile.
 *
 * Must be rendered inside `<ThemeProvider>`.
 */
export function ThemeChromeSync() {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    paintChrome(
      resolvedTheme
        ? resolveTheme(resolvedTheme as Theme, media.matches)
        : resolveTheme("system", media.matches)
    );

    // While "system" is selected the OS can flip under us; follow it live.
    const onChange = () => {
      if (resolvedTheme && resolvedTheme !== "system") return;
      paintChrome(resolveTheme("system", media.matches));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [resolvedTheme]);

  return null;
}

/**
 * Resolves next-themes' output into the `light`/`dark` pair Sonner understands.
 *
 * AMOLED has no Sonner equivalent and would otherwise fall through to the light
 * branch, putting a white toast on a black screen.
 *
 * The mounted gate matters: `matchMedia` cannot run during SSR, and reading it
 * during the first client render would disagree with the server's markup and
 * trip a hydration error.
 */
export function useToasterTheme(): "light" | "dark" {
  const { resolvedTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    EMPTY_SUBSCRIBE,
    () => true,
    () => false
  );

  const prefersDark = mounted && prefersDarkNow();
  const resolved = resolvedTheme
    ? resolveTheme(resolvedTheme as Theme, prefersDark)
    : resolveTheme("system", prefersDark);

  return isDarkTheme(resolved) ? "dark" : "light";
}