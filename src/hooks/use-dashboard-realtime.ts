"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Tables the dashboard listens to (see migration 014). */
export const WATCHED_TABLES = ["tasks", "notifications"] as const;

export type RealtimeStatus = "off" | "connecting" | "live" | "error";

const DEBOUNCE_MS = 350;

/**
 * Live dashboard updates.
 *
 * Subscribes to Postgres changes on `tasks` and `notifications` and re-renders
 * the server components that read them, so a task completed in another tab or a
 * notification raised by a reminder sweep shows up without a manual reload.
 *
 * Refreshes are debounced: a burst of writes collapses into one round trip
 * instead of one RSC fetch per row. Delivery is best-effort — if realtime is
 * unavailable the dashboard behaves exactly as it did before, which is why the
 * status is surfaced rather than assumed.
 */
export function useDashboardRealtime(enabled = true): RealtimeStatus {
  const router = useRouter();
  const [channelStatus, setChannelStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        scheduleRefresh
      )
      .subscribe(setChannelStatus);

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [enabled, router]);

  if (!enabled) return "off";
  if (channelStatus === "SUBSCRIBED") return "live";
  if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT")
    return "error";
  return "connecting";
}
