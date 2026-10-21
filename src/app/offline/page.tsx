import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";
import { WifiOff, RefreshCw, ArrowRight } from "lucide-react";

export const metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * The last-resort offline page.
 *
 * Served by the service worker when a navigation fails *and* that page has never
 * been stored on this device. That makes this the uncommon path, not the normal
 * one: the common path is the cached copy of the page you actually asked for.
 *
 * So this page says so, and points at the pages that are certainly kept, rather
 * than presenting itself as "offline is broken". It is static on purpose — no
 * session read, no database call — because it has to render for a signed-out
 * visitor too, and the proxy's public routes list exists for the same reason.
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
          This exact page has not been saved on this device yet. Everything else
          is here &mdash; Ownspece keeps a copy of each page it has loaded, so
          your workspace opens and works with no connection.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href="/dashboard" />}>
          <RefreshCw /> Dashboard
        </Button>
        <Button variant="outline" render={<Link href="/tasks" />}>
          Tasks <ArrowRight />
        </Button>
        <Button variant="outline" render={<Link href="/notes" />}>
          Notes <ArrowRight />
        </Button>
        <Button variant="outline" render={<Link href="/reminders" />}>
          Reminders <ArrowRight />
        </Button>
      </div>

      <p className="max-w-md text-xs text-muted-foreground">
        Reconnect once and Ownspece will save the whole app to this device
        automatically. Tasks and reminders can also be edited offline — changes
        are queued and synced the moment you are back.
      </p>
    </main>
  );
}