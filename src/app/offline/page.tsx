import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
import { WifiOff, RefreshCw, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback.
 *
 * Served from Cache Storage by the service worker when a navigation fails, so it
 * has to be a *static* page — no session read, no database call — and it is in
 * the proxy's public routes for the same reason.
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <BrandMark size="md" className="size-12 text-xl" />
        <span className="icon-tile size-12">
          <WifiOff aria-hidden="true" className="size-5" />
        </span>
      </div>

      <div className="flex max-w-md flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">You&apos;re offline</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Ownspece needs a connection to load your projects, tasks and notes.
          Your task list is kept on this device, so it is still readable —
          changes are queued and saved the moment you are back online.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href="/dashboard" />}>
          <RefreshCw /> Try again
        </Button>
        <Button variant="outline" render={<Link href="/tasks" />}>
          Tasks <ArrowRight />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Your tasks stay readable offline — Ownspece keeps the last copy it
        loaded and syncs your changes when the connection returns.
      </p>
    </main>
  );
}