"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { syncAppearanceFromAccount } from "@/lib/appearance-store";
import type { Appearance } from "@/lib/appearance";

/**
 * Hands the account's saved appearance to the client store.
 *
 * Two things happen once the server preferences are known:
 *
 * 1. The accent / card style / density / background are written to `<html>` as
 *    `data-*` attributes, which globals.css maps onto the token layers.
 * 2. The theme is pushed into next-themes.
 *
 * Step 2 is unconditional on purpose. `resolveAppearance` already decides
 * between this device's stored copy and the account row by comparing write
 * timestamps, so whichever is newer wins — including a theme changed on another
 * device. Gating this on "has this device ever chosen a theme?" made the account
 * unable to override a stale local value, so a theme picked on a laptop never
 * reached a phone that had previously saved one.
 *
 * The inline script in the root layout has already put the same attributes on
 * `<html>` before paint, so this reconciles rather than flashes.
 */
export function AppearanceManager({
  appearance,
  updatedAt,
}: {
  appearance: Appearance;
  updatedAt?: string | null;
}) {
  const { setTheme } = useTheme();
  const { theme, accent, cardStyle, density, background } = appearance;

  const account = React.useMemo(
    () => ({ theme, accent, cardStyle, density, background }),
    [theme, accent, cardStyle, density, background]
  );

  React.useLayoutEffect(() => {
    const { appearance: resolved } = syncAppearanceFromAccount(account, updatedAt);
    setTheme(resolved.theme);
  }, [account, updatedAt, setTheme]);

  return null;
}