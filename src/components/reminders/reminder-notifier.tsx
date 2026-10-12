"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { processDueRemindersAction } from "@/lib/actions/notifications";
import {
  buildDigest,
  planDelivery,
  DEFAULT_NOTIFY_SETTINGS,
  normalizeSettings,
  type NotifiableReminder,
  type NotifySettings,
} from "@/lib/reminder-notify";
import type { ReminderListItem } from "@/lib/reminder-logic";

/**
 * The reminder notification scheduler.
 *
 * Three jobs, all on the client so they keep working with no network:
 *
 *  1. **Fire on time.** A short tick compares each reminder's *fire* time (the
 *     remind time minus its advance notice) against the clock, so an alert
 *     lands when it should rather than whenever the page happens to reload.
 *     The server sweep still owns the in-app feed row; this owns the toast and
 *     the OS notification, because only the page knows the device's own
 *     permission, quiet hours and digest preference.
 *  2. **Stay quiet when asked.** Everything goes through `planDelivery`, which
 *     applies the device's settings: muted reminders, quiet hours, a priority
 *     floor and digest batching. Those rules live in `reminder-notify` and are
 *     unit tested there rather than reimplemented here.
 *  3. **Never fire twice.** Fired ids are recorded in localStorage, namespaced
 *     by user. Without that, a reload would re-alert everything that came due
 *     while the tab was closed — the most irritating thing a reminder app does.
 *
 * Hot-path state (fired ids, the pending digest batch) lives in refs rather
 * than React state: the tick runs every 15 seconds and must read the *current*
 * value, which a closure over state can only do by re-subscribing and rescheduling
 * the interval on every change. State updaters also must stay pure, and
 * "raise a toast and write to storage" is not pure.
 */

const STORAGE_KEY = "ownspece:notify-settings";
const TICK_MS = 15_000;

/** How many fired ids to remember before dropping the oldest. */
const FIRED_HISTORY_LIMIT = 200;

/** Read the device-local notification settings. */
export function readNotifySettings(): NotifySettings {
  if (typeof window === "undefined") return { ...DEFAULT_NOTIFY_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFY_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_NOTIFY_SETTINGS };
  }
}

export function writeNotifySettings(settings: NotifySettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable — the settings simply do not persist.
  }
}

/**
 * Which reminder ids have already alerted on this device.
 *
 * `Record<string, string>` maps id -> fired-at so the oldest can be trimmed
 * without parsing a list.
 */
function readFiredMap(userId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:fired:${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeFiredMap(userId: string, fired: Record<string, string>): void {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}:fired:${userId}`, JSON.stringify(fired));
  } catch {
    // Nothing to do; the worst case is one repeat alert on the next load.
  }
}

function trimFired(fired: Record<string, string>): Record<string, string> {
  const ids = Object.keys(fired);
  if (ids.length <= FIRED_HISTORY_LIMIT) return fired;
  const sorted = ids.sort((a, b) => fired[a].localeCompare(fired[b]));
  const keep = new Set(sorted.slice(-FIRED_HISTORY_LIMIT));
  return Object.fromEntries(Object.entries(fired).filter(([id]) => keep.has(id)));
}

/**
 * Fires `remind_at` minus `advance_minutes`, which is when the alert belongs.
 *
 * Takes the two fields it needs rather than a full reminder row, so the same
 * helper serves both a real row and the synthetic digest entry.
 */
function fireTimeOf(reminder: { remind_at: string; advance_minutes?: number | null }): number {
  const at = new Date(reminder.remind_at).getTime();
  if (Number.isNaN(at)) return Number.POSITIVE_INFINITY;
  const advance = Number.isFinite(reminder.advance_minutes)
    ? Math.max(0, reminder.advance_minutes as number)
    : 0;
  return at - advance * 60_000;
}

/** A snoozed reminder fires at its pushed-out time, not its original one. */
function isLiveReminder(reminder: ReminderListItem): boolean {
  if (reminder.status === "snoozed") {
    if (!reminder.snoozed_until) return false;
    return new Date(reminder.snoozed_until).getTime() <= Date.now();
  }
  return reminder.status === "pending";
}

function detailOf(reminder: NotifiableReminder): string {
  const detail = reminder.note?.trim() || reminder.description?.trim();
  if (detail) return detail;
  return reminder.project_name ? reminder.project_name : "";
}

/**
 * Raises one alert on whichever channels the device has enabled.
 *
 * The browser notification is deliberately not fired alongside an in-app toast
 * unless the user asked for both — two alerts for one reminder is the kind of
 * thing that makes people turn notifications off entirely.
 */
function raiseAlert(reminder: NotifiableReminder, settings: NotifySettings): void {
  if (!settings.channels.in_app && !settings.channels.browser) return;

  const detail = detailOf(reminder);

  if (settings.channels.in_app) {
    toast(reminder.title || "Reminder", {
      description: detail,
      duration: reminder.priority === "urgent" ? 15_000 : 8_000,
    });
  }

  if (
    settings.channels.browser &&
    settings.browserPermission === "granted" &&
    "Notification" in window &&
    Notification.permission === "granted"
  ) {
    try {
      const notification = new Notification(reminder.title || "Reminder", {
        body: detail,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        // One slot per reminder, so a re-fire replaces its own notification
        // rather than stacking a second copy beside it.
        tag: `ownspece-reminder-${reminder.id}`,
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Some browsers refuse Notification construction outside a service
      // worker; the toast has already covered it when that channel is on.
    }
  }
}

/**
 * Requests browser notification permission and mirrors the result into settings.
 *
 * Returns the resulting permission so the caller can explain a refusal rather
 * than leaving a toggle that silently does nothing.
 */
export async function requestBrowserPermission(
  settings: NotifySettings
): Promise<NotificationPermission | "unsupported"> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";

  const permission = await Notification.requestPermission();
  writeNotifySettings({ ...settings, browserPermission: permission });
  return permission;
}

/** Mirrors the real browser permission into settings on mount and on focus. */
export function syncBrowserPermission(settings: NotifySettings): NotifySettings {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return { ...settings, browserPermission: "unsupported" };
  }
  return { ...settings, browserPermission: Notification.permission };
}

/**
 * Runs the reminder notification scheduler.
 *
 * Renders nothing. Mounted once from the reminders workspace, which is also
 * where the settings panel lives, so both read the same storage.
 */
export function ReminderNotifier({
  reminders,
  userId,
  enabled = true,
}: {
  reminders: ReminderListItem[];
  userId: string | null;
  enabled?: boolean;
}) {
  const router = useRouter();

  // Refs, not state: the tick must read the current value, and state updaters
  // have to stay pure.
  const firedRef = React.useRef<Record<string, string>>({});
  const batchRef = React.useRef<NotifiableReminder[]>([]);

  // Seed the refs from storage after mount. Reading localStorage during render
  // would disagree with the server-rendered markup.
  React.useEffect(() => {
    if (userId) firedRef.current = readFiredMap(userId);
  }, [userId]);

  const markFired = React.useCallback(
    (ids: string[]) => {
      if (ids.length === 0 || !userId) return;
      const at = new Date().toISOString();
      const next = { ...firedRef.current };
      for (const id of ids) next[id] = at;
      firedRef.current = trimFired(next);
      writeFiredMap(userId, firedRef.current);
    },
    [userId]
  );

  // The server sweep turns due reminders into in-app feed rows. Running it here
  // keeps the reminders page's own feed honest without a dashboard visit, and
  // it is a no-op when nothing is due.
  React.useEffect(() => {
    if (!enabled) return;
    void processDueRemindersAction().then((result) => {
      // Refresh only when something actually fired, so a quiet minute does not
      // cause a pointless server round trip on every mount.
      if (!result.error && result.count > 0) router.refresh();
    });
  }, [enabled, router]);

  React.useEffect(() => {
    if (!enabled || !userId) return;

    const flushBatch = (settings: NotifySettings) => {
      const batch = batchRef.current;
      if (batch.length === 0) return;

      const windowMs = Math.max(0, settings.digest.windowMinutes) * 60_000;
      const oldest = Math.min(...batch.map((r) => fireTimeOf(r)));
      if (Date.now() < oldest + windowMs) return;

      const digest = buildDigest(batch);
      raiseAlert(
        {
          id: `digest-${batch.map((r) => r.id).join("-")}`,
          title: digest.title,
          note: digest.body,
          priority: "none",
          status: "pending",
          is_enabled: true,
          remind_at: new Date().toISOString(),
        },
        { ...settings, channels: { in_app: settings.channels.in_app, browser: false } }
      );
      markFired(batch.map((r) => r.id));
      batchRef.current = [];
    };

    const tick = () => {
      const now = new Date();
      const settings = syncBrowserPermission(readNotifySettings());

      const due = reminders.filter(
        (reminder) =>
          !firedRef.current[reminder.id] &&
          isLiveReminder(reminder) &&
          fireTimeOf(reminder) <= now.getTime()
      );

      // A batch still waiting on its window must be flushed even when nothing
      // new came due, otherwise the digest never fires.
      if (due.length === 0) {
        flushBatch(settings);
        return;
      }

      const plan = planDelivery(due, settings, now);

      for (const reminder of plan.singles) raiseAlert(reminder, settings);
      markFired(plan.singles.map((reminder) => reminder.id));

      if (plan.batched.length > 0) {
        const known = new Set(batchRef.current.map((reminder) => reminder.id));
        const fresh = plan.batched.filter((reminder) => !known.has(reminder.id));
        if (fresh.length > 0) batchRef.current = [...batchRef.current, ...fresh];
      }

      // A muted reminder, and one that quietly went past during quiet hours,
      // are recorded as handled too. Otherwise the second would alert the
      // instant the window closed — hours later, and more intrusive than the
      // silence it was meant to avoid.
      markFired(
        plan.suppressed
          .filter(
            (entry) => entry.reason === "muted" || entry.reason === "quiet_hours"
          )
          .map((entry) => entry.reminder.id)
      );

      flushBatch(settings);
    };

    const id = window.setInterval(tick, TICK_MS);
    // One immediate pass, so a reminder that came due while the tab was closed
    // is picked up without waiting out a full interval.
    tick();

    return () => window.clearInterval(id);
  }, [enabled, markFired, reminders, userId]);

  return null;
}

/**
 * A short "when will the next alert be allowed" hint for the settings panel.
 *
 * Returns null when quiet hours are off, which is the case the panel shows as
 * "always on" rather than as a gap.
 */
export function nextAlertHint(
  settings: NotifySettings,
  now: Date = new Date()
): string | null {
  if (!settings.quietHours.enabled) return null;

  const match = settings.quietHours.end.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const end = new Date(now.getTime());
  end.setHours(Number(match[1]), Number(match[2]), 0, 0);
  // An end time already past today means the window closes tomorrow.
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);

  const minutes = Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000));
  if (minutes === 0) return "Quiet hours end now";
  if (minutes < 60) return `Quiet for ${minutes} more min`;
  return `Quiet for ${Math.round(minutes / 60)}h more`;
}