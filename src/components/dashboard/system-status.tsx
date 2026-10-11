"use client";

import { Download, Wifi, WifiOff, Zap, Share, PlusSquare, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionShell } from "@/components/dashboard/section-shell";
import { StatusDot, ToneBadge, toneText } from "@/components/dashboard/tone";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import {
  useDashboardRealtime,
  type RealtimeStatus,
} from "@/hooks/use-dashboard-realtime";
import { syncTone, type SemanticTone } from "@/lib/dashboard-logic";

const REALTIME_LABEL: Record<
  RealtimeStatus,
  { label: string; tone: SemanticTone }
> = {
  live: { label: "Live", tone: "success" },
  connecting: { label: "Connecting", tone: "warning" },
  error: { label: "Unavailable", tone: "neutral" },
  off: { label: "Off", tone: "neutral" },
};

/**
 * System status — connectivity, live updates and PWA installation.
 *
 * Every line reports a value the browser or the realtime channel actually
 * reported; nothing here is a decorative "all systems green" pill, and offline
 * is stated plainly as a state rather than implying data was cached.
 */
export function SystemStatus() {
  const online = useOnlineStatus();
  const { canInstall, isInstalled, needsIosHelp, promptInstall } = usePwaInstall();
  const realtime = useDashboardRealtime(true);

  const syncState = syncTone(online);
  const liveState = REALTIME_LABEL[realtime];

  return (
    <SectionShell
      title="System"
      icon={Zap}
      description={isInstalled ? "Installed as an app" : "Connection & updates"}
      interactive
    >
      <ul className="flex flex-col gap-2">
        <li className="flex items-center gap-2 text-sm">
          {online ? (
            <Wifi aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <WifiOff aria-hidden="true" className="size-4 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {online ? "Connected" : "Offline"}
          </span>
          <ToneBadge tone={syncState} dot>
            {online ? "Online" : "Offline"}
          </ToneBadge>
        </li>

        <li className="flex items-center gap-2 text-sm">
          <StatusDot tone={liveState.tone} className="size-2" />
          <span className="min-w-0 flex-1 truncate">
            {realtime === "live"
              ? "Tasks & notifications"
              : "Live updates"}
          </span>
          <ToneBadge tone={liveState.tone} dot>
            {liveState.label}
          </ToneBadge>
        </li>
      </ul>

      {!online ? (
        <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs leading-relaxed text-warning">
          You&apos;re offline. Pages you already opened stay readable, but
          changes can&apos;t be saved until the connection returns.
        </p>
      ) : null}

      {canInstall ? (
        <Button
          size="sm"
          className="mt-3 w-full"
          onClick={() => void promptInstall()}
        >
          <Download /> Install app
        </Button>
      ) : null}

      <p className={`mt-3 border-t pt-3 text-[11px] leading-relaxed ${toneText.neutral}`}>
        {isInstalled ? (
          <span className="inline-flex items-center gap-1">
            <Check className="size-3" aria-hidden="true" /> Running as an
            installed app.
          </span>
        ) : canInstall ? (
          "Install Ownspece for a window of its own."
        ) : needsIosHelp ? (
          <span>
            Tap{" "}
            <Share aria-hidden="true" className="mx-0.5 inline size-3 align-[-2px]" />{" "}
            then{" "}
            <PlusSquare
              aria-hidden="true"
              className="mx-0.5 inline size-3 align-[-2px]"
            />{" "}
            Add to Home Screen.
          </span>
        ) : (
          "Add Ownspece to your home screen from the browser menu."
        )}
      </p>
    </SectionShell>
  );
}