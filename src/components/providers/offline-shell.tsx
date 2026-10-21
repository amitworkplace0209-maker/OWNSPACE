"use client";

import * as React from "react";
import { registerShellUser, warmShell } from "@/lib/offline/shell-client";
import { SHELL_ROUTES } from "@/lib/offline/shell-cache";

/**
 * Keeps this device's copy of the app in step.
 *
 * Renders nothing. Mounted once in the app layout, above everything, because
 * the worker has to know which account is signed in *before* the first
 * navigation is intercepted — a user who opens the app offline would otherwise
 * reach the worker's cache lookup before this component has run, find no
 * account, and get the browser's own error page. Which is the bug this whole
 * feature was built to remove.
 *
 * When it warms
 * -------------
 * Once the page has settled, and only if the stored copy is due. The delay is
 * not decoration: warming issues real server renders, and doing that while the
 * dashboard is still loading is how an "offline support" feature becomes the
 * reason the dashboard is slow.
 */
export function OfflineShell({ userId }: { userId: string }) {
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      // Identity first, always, and immediately. Warming can wait; telling the
      // worker whose pages it may serve cannot.
      await registerShellUser(userId);
      if (cancelled) return;

      // One idle callback, then a floor of a moment. `requestIdleCallback` fires
      // immediately when the tab is backgrounded, which would warm on a phone
      // the moment the user switches away — so the timer is the floor.
      await new Promise<void>((resolve) => {
        if (window.requestIdleCallback) {
          window.requestIdleCallback(() => resolve(), { timeout: 4_000 });
        } else {
          window.setTimeout(resolve, 1_500);
        }
      });
      if (cancelled) return;

      await warmShell({ userId, routes: SHELL_ROUTES });
    })().catch(() => {
      // A device that cannot hold an offline copy is still a working app.
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  return null;
}