"use client";

import { useEffect, useState } from "react";
import { useOffline } from "next/offline";
import { CloudOff, RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import type { LiveStatus } from "@/hooks/use-tasks-live";

/**
 * Connection state.
 *
 * `useOffline()` is the authoritative signal — Next.js also flips it when a
 * request actually fails, which catches the captive-portal case where the OS
 * still reports a live interface. The realtime channel status is shown alongside
 * it because "online but not subscribed" is a real, confusing state that the
 * offline flag alone would describe as healthy.
 */
export function LiveIndicator({
  status,
  queuedCount,
  onSync,
  className,
}: {
  status: LiveStatus;
  queuedCount: number;
  onSync: () => void;
  className?: string;
}) {
  const offline = useOffline();
  const isOffline = offline || status === "offline";

  const { label, tone, Icon } = isOffline
    ? {
        label: queuedCount > 0 ? `Offline · ${queuedCount} queued` : "Offline",
        tone: "bg-amber-500",
        Icon: CloudOff,
      }
    : status === "live"
      ? { label: "Live", tone: "bg-emerald-500", Icon: Wifi }
      : status === "error"
        ? { label: "Reconnecting", tone: "bg-amber-500", Icon: RefreshCw }
        : { label: "Connecting", tone: "bg-muted-foreground", Icon: RefreshCw };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pr-2.5 pl-2 text-xs font-medium",
        className
      )}
      role="status"
      aria-live="polite"
    >
      <span className={cn("relative flex size-2 items-center justify-center", tone)}>
        <span className={cn("live-dot size-2 rounded-full", tone)} />
      </span>
      <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
      {label}
      {isOffline && queuedCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-xs"
          onClick={onSync}
        >
          <RefreshCw className="size-3" />
          Sync
        </Button>
      ) : null}
    </span>
  );
}

/**
 * A strip shown across the top of the tasks workspace while offline.
 *
 * Deliberately honest about what is and is not saved: reads come from the baked
 * cache, edits are queued, and the queue is replayed automatically on reconnect.
 */
export function OfflineBanner({
  queuedCount,
  cachedAt,
  onSync,
}: {
  queuedCount: number;
  /** When the shown rows were last written to the device, if they are stale. */
  cachedAt: string | null;
  onSync: () => void;
}) {
  const offline = useOffline();
  if (!offline) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm"
    >
      <CloudOff aria-hidden="true" className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">You&apos;re offline.</span>{" "}
        <span className="text-muted-foreground">
          {cachedAt
            ? `Showing tasks saved ${formatRelativeTime(cachedAt)}. `
            : "Showing your last saved tasks. "}
          {queuedCount > 0
            ? `${queuedCount} ${queuedCount === 1 ? "change" : "changes"} will sync when you reconnect.`
            : "New changes will be queued and synced automatically."}
        </span>
      </span>
      <Button variant="outline" size="sm" onClick={onSync}>
        <RefreshCw /> Retry now
      </Button>
    </div>
  );
}

/** True once the browser has hydrated, so SSR and first paint agree. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setHydrated(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return hydrated;
}