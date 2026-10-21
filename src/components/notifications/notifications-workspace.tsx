"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  ChevronDown,
  Inbox,
  Laptop,
  Mail,
  MailOpen,
  Smartphone,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { StatStrip } from "@/components/shared/stat-strip";
import { usePushSubscription } from "@/hooks/use-push-subscription";
import { removePushSubscriptionAction, type PushDevice } from "@/lib/actions/push";
import {
  clearAllNotificationsAction,
  clearReadNotificationsAction,
  deleteNotificationAction,
  deleteNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  markNotificationsReadAction,
} from "@/lib/actions/notifications";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "cn";
import type { AppNotification, NotificationType } from "@/types";

/**
 * The notification centre.
 *
 * Built around the idea that a notification is only useful if it can be acted on
 * without leaving what you were doing, so the page leads with three things:
 *
 *  1. **Device state.** Whether *this* device can receive a push, and a control
 *     to change that. Push is the only channel that reaches a device with the
 *     app closed, so it is the difference between an inbox and an alarm.
 *  2. **Unread state, honestly.** Every toggle in the header — All / Unread /
 *     Read — shows the count it will actually switch to, so the numbers can
 *     never be a guess.
 *  3. **Actionability.** Inline read/unread and delete on each row, plus
 *     deep links into whatever the notification is about.
 *
 * Action buttons *on the notification itself* are handled app-wide — see
 * `NotificationBridge`, which applies the Done/Snooze the user tapped on the
 * lock screen, wherever they happen to be in the app when they do it.
 */

const typeBadge: Record<NotificationType, string> = {
  reminder: "Reminder",
  task: "Task",
  project: "Project",
  system: "System",
};

/** Icon and colour per type, so a row is identifiable before it is read. */
const typeStyle: Record<NotificationType, string> = {
  reminder: "bg-warning/15 text-warning",
  task: "bg-info/15 text-info",
  project: "bg-primary/15 text-primary",
  system: "bg-muted text-muted-foreground",
};

const typeIcon: Record<NotificationType, React.ReactNode> = {
  reminder: <Bell className="size-4" />,
  task: <Check className="size-4" />,
  project: <Laptop className="size-4" />,
  system: <Mail className="size-4" />,
};

export function NotificationsWorkspace({
  notifications,
  filter,
  type,
  unreadCount,
  totalCount,
  devices,
  pushConfigured,
}: {
  notifications: AppNotification[];
  filter: "all" | "unread" | "read";
  type: NotificationType | "all";
  unreadCount: number;
  totalCount: number;
  /** Every device this account can push to, across all browsers. */
  devices: PushDevice[];
  /** False when the server has no VAPID keys — the UI says so rather than
   *  offering a toggle that cannot work. */
  pushConfigured: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [removingDevice, setRemovingDevice] = React.useState<PushDevice | null>(null);
  const [clearingAll, setClearingAll] = React.useState(false);

  const { permission, subscribed, subscribing, supported, subscribe, unsubscribe } =
    usePushSubscription({ onChange: () => router.refresh() });

  const selectedVisible = notifications.filter((n) => selected.has(n.id));
  const allSelected = notifications.length > 0 && selectedVisible.length === notifications.length;
  const readCount = totalCount - unreadCount;

  // Counted from the page's own rows, which are already limited to the hundred
  // most recent. A total beyond that would need its own query for a tile, and
  // "today" cannot reach past a hundred rows anyway.
  const todayKey = (() => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}-${String(now.getDate()).padStart(2, "0")}`;
  })();
  const todays = notifications.filter((n) => localDayOf(n.created_at) === todayKey);
  const todayCount = todays.length;
  const todayUnread = todays.filter((n) => n.read_at === null).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(notifications.map((n) => n.id)));
  }

  function pushParam(nextFilter: string, nextType: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFilter !== "all") params.set("filter", nextFilter);
    else params.delete("filter");
    if (nextType !== "all") params.set("type", nextType);
    else params.delete("type");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function run(label: string, action: () => Promise<{ error?: string }>) {
    const result = await action();
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(label);
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Notifications"
        description="Everything that needs your attention, in one place."
        actions={
          <>
            {unreadCount > 0 ? (
              <Button
                variant="outline"
                onClick={async () => {
                  await run("All marked as read.", () => markAllNotificationsReadAction());
                }}
              >
                <Check /> Mark all read
              </Button>
            ) : null}
            {/* Disabled rather than hidden when empty: a control that appears and
                disappears as the list drains is harder to find than one that is
                always there and simply says there is nothing to do. */}
            <Button
              variant="outline"
              disabled={totalCount === 0}
              onClick={() => setClearingAll(true)}
              title={totalCount === 0 ? "There is nothing to clear" : undefined}
            >
              <Trash2 /> Clear all
            </Button>
          </>
        }
      />

      <ConfirmDialog
        open={clearingAll}
        onOpenChange={(open) => !open && setClearingAll(false)}
        title="Delete every notification?"
        description={
          <>
            This permanently deletes all{" "}
            <span className="font-medium text-foreground">
              {totalCount} {totalCount === 1 ? "notification" : "notifications"}
            </span>
            , including the {unreadCount} you have not read. There is no undo.
          </>
        }
        confirmLabel="Delete everything"
        onConfirm={async () => {
          setClearingAll(false);
          await run("All notifications deleted.", () => clearAllNotificationsAction());
        }}
      />

      {/* --- Where you stand -------------------------------------------------- */}
      <StatStrip
        items={[
          {
            id: "unread",
            label: "Unread",
            value: unreadCount,
            icon: Bell,
            tone: unreadCount > 0 ? "info" : "neutral",
            hint: unreadCount > 0 ? "Waiting for you" : "All caught up",
          },
          {
            id: "read",
            label: "Read",
            value: readCount,
            icon: MailOpen,
            tone: "neutral",
            hint: `${totalCount} in total`,
          },
          {
            id: "devices",
            label: "Devices",
            value: devices.length,
            icon: devices.length > 0 ? Smartphone : Laptop,
            // More than one device is the point of a PWA — reaching the alert
            // whichever one is to hand.
            tone: devices.length > 1 ? "success" : devices.length === 1 ? "info" : "warning",
            hint:
              devices.length > 1
                ? "Alerts reach all of them"
                : devices.length === 1
                  ? "One device can receive alerts"
                  : "None connected yet",
          },
          {
            id: "today",
            label: "Today",
            value: todayCount,
            icon: BellRing,
            tone: todayUnread > 0 ? "info" : "neutral",
            hint:
              todayUnread > 0
                ? `${todayUnread} still new`
                : todayCount > 0
                  ? "All seen"
                  : "Nothing yet",
          },
        ]}
      />

      {/* --- This device ----------------------------------------------------- */}
      <DevicePanel
        permission={permission}
        subscribed={subscribed}
        subscribing={subscribing}
        supported={supported}
        configured={pushConfigured}
        devices={devices}
        onSubscribe={subscribe}
        onUnsubscribe={unsubscribe}
        onRemoveDevice={setRemovingDevice}
      />

      {/* --- Filters --------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
        <div
          role="group"
          aria-label="Filter by read state"
          className="flex items-center gap-0.5 rounded-lg bg-muted/50 p-0.5"
        >
          {(
            [
              { id: "all", label: "All", count: totalCount },
              { id: "unread", label: "Unread", count: unreadCount },
              { id: "read", label: "Read", count: readCount },
            ] as const
          ).map((option) => {
            const active = filter === option.id;
            return (
              <button
                key={option.id}
                onClick={() => pushParam(option.id, type)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    active ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"
                  )}
                >
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>

        <Select value={type} onValueChange={(value) => pushParam(filter, value ?? "all")}>
          <SelectTrigger className="ml-auto w-40" aria-label="Filter by type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="reminder">Reminders</SelectItem>
            <SelectItem value="task">Tasks</SelectItem>
            <SelectItem value="project">Projects</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* --- Bulk actions ---------------------------------------------------- */}
      {notifications.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            aria-label="Select all notifications"
          />
          <span className="text-sm text-muted-foreground">
            {selectedVisible.length > 0
              ? `${selectedVisible.length} selected`
              : "Select all"}
          </span>

          {selectedVisible.length > 0 ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void run("Marked as read.", () =>
                    markNotificationsReadAction(selectedVisible.map((n) => n.id))
                  )
                }
              >
                <Check /> Mark read
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void run("Deleted.", () => deleteNotificationsAction(selectedVisible.map((n) => n.id)))
                }
              >
                <Trash2 /> Delete
              </Button>
            </>
          ) : null}

          {readCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-muted-foreground"
              onClick={() => void run("Read notifications cleared.", () => clearReadNotificationsAction())}
            >
              Clear read
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* --- List ------------------------------------------------------------ */}
      {notifications.length === 0 ? (
        <EmptyState
          icon={unreadCount > 0 ? Bell : Inbox}
          title={
            filter === "all" && totalCount === 0
              ? "Nothing here yet"
              : filter === "unread"
                ? "You're all caught up"
                : filter === "read"
                  ? "Nothing read yet"
                  : "No notifications match"
          }
          description={
            filter === "all" && totalCount === 0
              ? "Notifications from your reminders, tasks and projects will appear here — and on your lock screen if notifications are on."
              : filter === "unread"
                ? "Every notification has been read. New ones will show up here and as an alert."
                : undefined
          }
          action={
            filter !== "all" ? (
              <Button variant="outline" onClick={() => pushParam("all", type)}>
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DayGroupedList
          notifications={notifications}
          selected={selected}
          onToggle={toggle}
        />
      )}

      <ConfirmDialog
        open={Boolean(removingDevice)}
        onOpenChange={(open) => {
          if (!open) setRemovingDevice(null);
        }}
        title={`Stop notifications on ${removingDevice?.label ?? removingDevice?.host ?? "this device"}?`}
        description="That browser will no longer receive alerts. Other devices keep theirs."
        confirmLabel="Remove device"
        onConfirm={async () => {
          if (!removingDevice) return;
          await run("Device removed.", () =>
            removePushSubscriptionAction(removingDevice.endpoint)
          );
          setRemovingDevice(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** The local calendar day a notification landed on, as YYYY-MM-DD. */
function localDayOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** "Today" / "Yesterday" / "12 March". */
function dayHeading(key: string): string {
  if (!key) return "Earlier";
  const today = localDayOf(new Date().toISOString());
  if (key === today) return "Today";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === localDayOf(yesterday.toISOString())) return "Yesterday";

  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: new Date().getFullYear() === year ? undefined : "numeric",
  });
}

/**
 * The list, grouped by day.
 *
 * A flat list of forty rows with "2 hours ago" on each is a wall; the same rows
 * under Today / Yesterday / 12 March is scannable, and it matches what every
 * phone's notification list does — which is the mental model this page is
 * imitating.
 *
 * Grouped on the *local* day, not a UTC date, so an alert at 11pm does not
 * land under tomorrow because of where the user is.
 */
function DayGroupedList({
  notifications,
  selected,
  onToggle,
}: {
  notifications: AppNotification[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const groups = React.useMemo(() => {
    const byDay = new Map<string, AppNotification[]>();
    for (const notification of notifications) {
      const key = localDayOf(notification.created_at);
      const bucket = byDay.get(key) ?? [];
      bucket.push(notification);
      byDay.set(key, bucket);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [notifications]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([day, items]) => {
        const unread = items.filter((item) => item.read_at === null).length;
        return (
          <section key={day || "unknown"} className="flex flex-col gap-1.5">
            <header className="flex items-center gap-2 px-1">
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {dayHeading(day)}
              </h2>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {items.length} {items.length === 1 ? "notification" : "notifications"}
              </span>
              {unread > 0 ? (
                <span className="rounded-full bg-primary/12 px-1.5 text-[10px] font-medium text-primary">
                  {unread} new
                </span>
              ) : null}
            </header>

            <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  unread={n.read_at === null}
                  checked={selected.has(n.id)}
                  onToggle={() => onToggle(n.id)}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function NotificationRow({
  notification: n,
  unread,
  checked,
  onToggle,
}: {
  notification: AppNotification;
  unread: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const router = useRouter();

  // A reminder notification knows which reminder it came from, so it can link
  // straight there rather than to the generic inbox.
  const href = n.type === "reminder" ? "/reminders" : undefined;

  return (
    <li
      className={cn(
        "group flex items-start gap-3 border-b border-border/50 px-4 py-3 transition last:border-0",
        unread ? "bg-accent/30" : "hover:bg-accent/20",
        "focus-within:bg-accent/20"
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        aria-label={`Select ${n.title}`}
        className="mt-1"
      />

      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          unread ? typeStyle[n.type] : "bg-muted text-muted-foreground"
        )}
      >
        {unread ? typeIcon[n.type] : <MailOpen className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "truncate text-sm",
              unread ? "font-medium" : "text-muted-foreground"
            )}
          >
            {n.title}
          </p>
          <Badge variant="outline" className="h-4 text-[10px] capitalize">
            {typeBadge[n.type] ?? n.type}
          </Badge>
          {/* An unread row is not conveyed by colour alone. */}
          {unread ? <span className="sr-only">Unread</span> : null}
        </div>

        {n.body ? (
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{n.body}</p>
        ) : null}

        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatRelativeTime(n.created_at)}</span>
          {href ? (
            <Link href={href} className="underline-offset-2 hover:underline">
              Open
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        {unread ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Mark "${n.title}" as read`}
            onClick={async () => {
              await markNotificationReadAction(n.id);
              router.refresh();
            }}
          >
            <Check className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Mark "${n.title}" as unread`}
            onClick={async () => {
              await markNotificationUnreadAction(n.id);
              router.refresh();
            }}
          >
            <Undo2 className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete "${n.title}"`}
          onClick={async () => {
            const result = await deleteNotificationAction(n.id);
            if (result.error) toast.error(result.error);
            else toast.success("Notification deleted.");
            router.refresh();
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Device panel
// ---------------------------------------------------------------------------

function DevicePanel({
  permission,
  subscribed,
  subscribing,
  supported,
  configured,
  devices,
  onSubscribe,
  onUnsubscribe,
  onRemoveDevice,
}: {
  permission: NotificationPermission | "unsupported" | "unknown";
  subscribed: boolean;
  subscribing: boolean;
  supported: boolean;
  configured: boolean;
  devices: PushDevice[];
  onSubscribe: () => Promise<unknown>;
  onUnsubscribe: () => Promise<void>;
  onRemoveDevice: (device: PushDevice) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // The four states are genuinely different and each needs its own words:
  // a server without keys, a browser without push, a user who said no, and a
  // device that is not yet subscribed all look identical otherwise.
  const state = !configured
    ? { tone: "warning", label: "Not configured", hint: "Web push is not set up on this server. Alerts still arrive in the app while it is open." }
    : !supported
      ? { tone: "neutral", label: "Not supported", hint: "This browser cannot show system notifications. Reminders still appear in this list and in the app." }
      : permission === "denied"
        ? { tone: "danger", label: "Blocked", hint: "Notifications are blocked for this site. Re-enable them in your browser settings to receive alerts outside the app." }
        : subscribed
          ? { tone: "success", label: "On", hint: "This device receives alerts even when Ownspece is closed." }
          : { tone: "primary", label: "Off", hint: "Turn on to get reminders on your lock screen, even when the app is closed." };

  const toneClass = {
    success: "bg-success/12 text-success",
    warning: "bg-warning/12 text-warning",
    danger: "bg-danger/12 text-danger",
    primary: "bg-primary/12 text-primary",
    neutral: "bg-muted text-muted-foreground",
  }[state.tone];

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
              toneClass
            )}
          >
            {subscribed ? <Bell className="size-4" /> : <BellOff className="size-4" />}
          </span>

          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              Notifications on this device
              <span className={cn("rounded-full px-2 py-0.5 text-xs", toneClass)}>
                {state.label}
              </span>
            </p>
            <p className="text-xs text-pretty text-muted-foreground">{state.hint}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {supported && configured && permission !== "denied" ? (
            subscribed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={subscribing}
                onClick={() => void onUnsubscribe()}
              >
                Turn off
              </Button>
            ) : (
              <Button size="sm" disabled={subscribing} onClick={() => void onSubscribe()}>
                {subscribing ? "Turning on…" : "Turn on"}
              </Button>
            )
          ) : null}

          {devices.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {devices.length} {devices.length === 1 ? "device" : "devices"}
              <ChevronDown
                className={cn("size-3.5 transition-transform", expanded && "rotate-180")}
              />
            </Button>
          ) : null}
        </div>
      </div>

      {expanded && devices.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t pt-2">
          {devices.map((device) => (
            <li key={device.id} className="flex items-center gap-2 text-xs">
              <Smartphone aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{device.label ?? device.host}</span>
                <span className="text-muted-foreground"> · {device.host}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">
                added {formatRelativeTime(device.createdAt)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${device.label ?? device.host}`}
                onClick={() => onRemoveDevice(device)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

