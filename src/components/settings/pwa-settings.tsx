"use client";

import * as React from "react";
import {
  Check,
  Database,
  Download,
  HardDriveDownload,
  MonitorSmartphone,
  Share,
  PlusSquare,
  RefreshCw,
  Smartphone,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { clearReminderCache, readReminderCache, readActiveReminderUser } from "@/lib/offline/reminder-cache.client";
import { clearTaskCache, readTaskCache, readActiveUser } from "@/lib/offline/task-cache.client";
import { NotificationSettingsButton } from "@/components/reminders/notification-settings";
import { cn } from "cn";

/**
 * PWA settings — the section the install prompt's "How it works" link points at.
 *
 * It exists as a page rather than only as a banner because three of the four
 * things a user needs to know are not event-driven: whether the app is
 * installed, what is actually cached on this device, how to wipe that cache, and
 * where the notification settings live. A transient prompt cannot answer any of
 * them once it has been dismissed.
 */

type CacheState = {
  tasks: number;
  tasksCachedAt: string | null;
  reminders: number;
  remindersCachedAt: string | null;
};

const EMPTY_CACHE: CacheState = {
  tasks: 0,
  tasksCachedAt: null,
  reminders: 0,
  remindersCachedAt: null,
};

export function PwaSettings() {
  const { canInstall, isInstalled, needsIosHelp, promptInstall } = usePwaInstall();
  const [cache, setCache] = React.useState<CacheState>(EMPTY_CACHE);
  const [clearing, setClearing] = React.useState(false);
  const [confirmClear, setConfirmClear] = React.useState(false);

  /**
   * The cache counts come from IndexedDB, which cannot be read during render —
   * so they are read once on mount. Nothing here sets state synchronously in an
   * effect body; the async read resolves into a later render.
   */
  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const taskUserId = readActiveUser();
      const reminderUserId = readActiveReminderUser();

      const [taskSnapshot, reminderSnapshot] = await Promise.all([
        taskUserId ? readTaskCache(taskUserId) : Promise.resolve(null),
        reminderUserId ? readReminderCache(reminderUserId) : Promise.resolve(null),
      ]);

      if (cancelled) return;
      setCache({
        tasks: taskSnapshot?.tasks.length ?? 0,
        tasksCachedAt: taskSnapshot?.cachedAt ?? null,
        reminders: reminderSnapshot?.reminders.length ?? 0,
        remindersCachedAt: reminderSnapshot?.cachedAt ?? null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function clearOfflineData() {
    setClearing(true);
    try {
      const taskUserId = readActiveUser();
      const reminderUserId = readActiveReminderUser();

      // Both caches are namespaced by user id, so signing out has to clear both
      // or a shared machine would serve the previous account's titles to the
      // next person who signs in.
      if (taskUserId) await clearTaskCache(taskUserId);
      if (reminderUserId) await clearReminderCache(reminderUserId);

      setCache(EMPTY_CACHE);
      toast.success("Offline data cleared from this device.");
    } catch {
      toast.error("Could not clear the offline data.");
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  const hasCache = cache.tasks > 0 || cache.reminders > 0;
  const oldest = [cache.tasksCachedAt, cache.remindersCachedAt]
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* --- Install ---------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <Row
          icon={<MonitorSmartphone className="size-4" />}
          title="Installed app"
          description={
            isInstalled
              ? "Ownspece is running in its own window, with offline data and app shortcuts."
              : "Install it for a window of its own, offline data, and app shortcuts."
          }
          state={isInstalled ? "ready" : canInstall || needsIosHelp ? "offered" : "manual"}
          stateLabel={
            isInstalled ? "Installed" : canInstall ? "Ready to install" : needsIosHelp ? "iOS" : "Manual"
          }
        />

        {isInstalled ? null : canInstall ? (
          <Button size="sm" className="w-fit" onClick={() => void promptInstall()}>
            <Download /> Install Ownspece
          </Button>
        ) : (
          // iOS has no programmatic prompt at all, and Firefox/ desktop Safari
          // only expose it from the browser menu — so both need the real steps
          // rather than a button that would do nothing.
          <ol className="flex flex-col gap-1.5 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                1
              </span>
              {needsIosHelp ? (
                <>
                  <Share aria-hidden="true" className="size-3.5" /> Tap{" "}
                  <span className="font-medium text-foreground">Share</span> in the browser bar
                </>
              ) : (
                <>
                  Open the browser menu{" "}
                  <span className="font-medium text-foreground">⋮</span> or{" "}
                  <span className="font-medium text-foreground">Install app</span>
                </>
              )}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                2
              </span>
              <PlusSquare aria-hidden="true" className="size-3.5" /> Choose{" "}
              <span className="font-medium text-foreground">
                {needsIosHelp ? "Add to Home Screen" : "Install"}
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-foreground">
                3
              </span>
              Open it from your home screen
            </li>
          </ol>
        )}
      </div>

      <Separator />

      {/* --- Offline data ----------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <Row
          icon={<HardDriveDownload className="size-4" />}
          title="Offline data"
          description={
            hasCache
              ? "Tasks and reminders are stored on this device so they stay readable and editable without a connection."
              : "Nothing is cached yet. Open Tasks or Reminders while online to store a copy here."
          }
          state={hasCache ? "ready" : "empty"}
          stateLabel={hasCache ? "Cached" : "Empty"}
        />

        {hasCache ? (
          <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3">
            <CacheLine
              label="Tasks"
              count={cache.tasks}
              cachedAt={cache.tasksCachedAt}
            />
            <CacheLine
              label="Reminders"
              count={cache.reminders}
              cachedAt={cache.remindersCachedAt}
            />
            {oldest ? (
              <p className="text-[11px] text-muted-foreground">
                Cached data expires after 7 days without a refresh.
              </p>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={clearing}
              onClick={() => setConfirmClear(true)}
            >
              {clearing ? <RefreshCw className="animate-spin" /> : <Trash2 />}
              Clear offline data
            </Button>
          </div>
        ) : null}
      </div>

      <Separator />

      {/* --- Notifications ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <Row
          icon={<Zap className="size-4" />}
          title="Reminder alerts"
          description="Quiet hours, batching and channels — configured per device, never synced to your account."
        />
        <NotificationSettingsButton />
      </div>

      <Separator />

      {/* --- Shortcuts -------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <Row
          icon={<Smartphone className="size-4" />}
          title="App shortcuts"
          description="Once installed, long-press the icon on your home screen for quick access."
        />
        <div className="grid gap-1.5 sm:grid-cols-2">
          {[
            { label: "New task", url: "/tasks?new=1" },
            { label: "New reminder", url: "/reminders?new=1" },
            { label: "New note", url: "/notes?new=1" },
            { label: "New project", url: "/projects?new=1" },
            { label: "Focus timer", url: "/time" },
            { label: "Reminders", url: "/reminders" },
          ].map((shortcut) => (
            <div
              key={shortcut.label}
              className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
            >
              <Check aria-hidden="true" className="size-3 shrink-0 text-success" />
              <span className="text-foreground">{shortcut.label}</span>
              <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
                {shortcut.url}
              </span>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear offline data?"
        description="Removes the tasks and reminders stored on this device. Anything still queued to sync will be lost. Your account data is not affected."
        confirmLabel="Clear this device"
        onConfirm={clearOfflineData}
      />
    </div>
  );
}

function Row({
  icon,
  title,
  description,
  state,
  stateLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  state?: "ready" | "offered" | "manual" | "empty";
  stateLabel?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
        >
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-pretty text-muted-foreground">{description}</p>
        </div>
      </div>

      {stateLabel ? (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs whitespace-nowrap",
            state === "ready" && "bg-success/12 text-success",
            state === "offered" && "bg-primary/12 text-primary",
            (state === "manual" || state === "empty") &&
              "bg-muted text-muted-foreground"
          )}
        >
          {stateLabel}
        </span>
      ) : null}
    </div>
  );
}

function CacheLine({
  label,
  count,
  cachedAt,
}: {
  label: string;
  count: number;
  cachedAt: string | null;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Database aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="font-medium">{label}</span>
      <span className="text-muted-foreground tabular-nums">
        {count} {count === 1 ? "row" : "rows"}
      </span>
      <span className="ml-auto text-muted-foreground/80">
        {cachedAt ? `saved ${relative(cachedAt)}` : "never"}
      </span>
    </div>
  );
}

function relative(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}