"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CloudOff, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "cn";

/**
 * Global offline banner.
 *
 * Mounted once in the app layout rather than per page, because the one thing an
 * offline user always needs is to know they are offline — and they should not
 * have to be on the dashboard, where `SystemStatus` already reports it, to find
 * out.
 *
 * Deliberately minimal. A full-width banner on every page during a flaky
 * connection trains people to ignore it, so it:
 *
 *   - renders nothing while online, with no layout shift when it appears;
 *   - says what still works rather than just announcing a problem;
 *   - never claims a page is unavailable. Every route is kept on the device by
 *     the service worker, so an offline user is looking at a real copy of the
 *     page they asked for, and telling them otherwise would be a lie in the
 *     other direction.
 */

/** Pages whose rows are cached, so edits here still work offline. */
const EDITABLE_OFFLINE = ["/tasks", "/reminders"];

export function OfflineBanner() {
  const online = useOnlineStatus();
  const pathname = usePathname();
  const router = useRouter();
  const wasOffline = React.useRef(false);

  const editableOffline = EDITABLE_OFFLINE.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Announced once per offline transition rather than on every render, so
  // returning online does not fire a toast each time a route re-renders.
  React.useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", {
        description: "Syncing anything you changed while offline.",
      });
      router.refresh();
    }
  }, [online, router]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning md:px-6"
    >
      <CloudOff aria-hidden="true" className="size-3.5 shrink-0" />

      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">You&apos;re offline.</span>{" "}
        {editableOffline ? (
          <>
            You can keep editing &mdash; changes sync when you reconnect.
          </>
        ) : (
          <>
            Showing the copy saved on this device.
            <span className="hidden sm:inline"> It may not be up to date.</span>
          </>
        )}
      </span>

      <Button
        variant="ghost"
        size="xs"
        className={cn("shrink-0 text-warning hover:bg-warning/15")}
        onClick={() => {
          if (navigator.onLine) router.refresh();
          else window.location.reload();
        }}
      >
        <RefreshCw /> Retry
      </Button>
    </div>
  );
}