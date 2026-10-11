"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Share, PlusSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { usePersistedFlag } from "@/hooks/use-persisted-flag";

const DISMISS_KEY = "ownspece:install-dismissed";

/**
 * Install prompt.
 *
 * Three details make the difference between this being useful and being the
 * "annoying banner" everyone dismisses:
 *
 * - It only appears once the browser has actually offered a prompt, so it never
 *   leads to a dead button on Firefox or desktop Safari.
 * - iOS gets the real Share → Add to Home Screen steps, because iOS has no
 *   programmatic prompt to trigger.
 * - Dismissing is remembered. A banner that reappears on every navigation is a
 *   banner that gets clicked reflexively without being read.
 */
export function InstallPrompt() {
  const { canInstall, isInstalled, needsIosHelp, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = usePersistedFlag(DISMISS_KEY);

  const visible = !dismissed && !isInstalled && (canInstall || needsIosHelp);

  function dismiss() {
    setDismissed(true);
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted" || outcome === "dismissed") dismiss();
  }

  if (!visible) return null;

  return (
    <div className="dash-hero mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 ring-1 ring-(--card-ring-color) sm:flex-row sm:items-center sm:gap-4">
      <span aria-hidden="true" className="icon-tile size-9 shrink-0 self-start sm:self-auto">
        <Download className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Install Ownspece</p>
        {canInstall ? (
          <p className="text-xs text-muted-foreground">
            Add it to your home screen for a window of its own, offline fallback,
            and app shortcuts.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Tap{" "}
            <Share
              aria-hidden="true"
              className="mx-0.5 inline size-3.5 align-[-2px]"
            />{" "}
            then <span className="font-medium">Add to Home Screen</span> to
            install.
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canInstall ? (
          <Button size="sm" onClick={() => void install()}>
            <Download /> Install
          </Button>
        ) : (
          <Button variant="outline" size="sm" render={<Link href="/settings#pwa" />}>
            <PlusSquare /> How it works
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  );
}