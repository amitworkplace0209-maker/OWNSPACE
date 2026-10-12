import type { Priority } from "@/types";

/**
 * Reminder notification policy — pure, dependency-free and shared by the
 * scheduler that fires reminders and the settings panel that edits them.
 *
 * The rules live here rather than in the component because "should this alert,
 * right now, on this device?" is a decision that has to be testable, and
 * because the same answer has to be reached by the local scheduler, the digest
 * builder and the row badges without three copies drifting apart.
 *
 * Everything is *device-local*: the settings below are stored per browser
 * profile, not on the account. Two devices signed into the same user can have
 * different quiet hours without fighting each other, and nothing here is ever
 * synced — that is deliberate, not an oversight.
 */

/** Channels a device can actually raise today. */
export type NotifyChannel = "in_app" | "browser";

export type QuietHours = {
  enabled: boolean;
  /** Local device time, "HH:MM". */
  start: string;
  end: string;
};

export type DigestSettings = {
  /** Merge everything that comes due into one summary instead of N alerts. */
  enabled: boolean;
  /**
   * How long the scheduler holds a due reminder before flushing the batch.
   * 0 flushes on the next tick.
   */
  windowMinutes: number;
};

export type NotifySettings = {
  /** Master switch. Off means nothing is raised on this device. */
  enabled: boolean;
  channels: Record<NotifyChannel, boolean>;
  quietHours: QuietHours;
  digest: DigestSettings;
  /** Alerts only for this priority or anything more urgent. */
  minPriority: Priority;
  /** Kept so the UI can explain *why* the browser toggle is unavailable. */
  browserPermission: "granted" | "denied" | "default" | "unsupported";
};

export const DEFAULT_NOTIFY_SETTINGS: NotifySettings = {
  enabled: true,
  channels: { in_app: true, browser: false },
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
  digest: { enabled: false, windowMinutes: 5 },
  minPriority: "none",
  browserPermission: "default",
};

/** Higher number = more urgent, so "at least" comparisons read naturally. */
const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 4,
};

/** The minimum shape the policy needs; both real rows and cache rows satisfy it. */
export type NotifiableReminder = {
  id: string;
  title: string;
  note?: string | null;
  description?: string | null;
  priority: Priority;
  status: string;
  is_enabled: boolean;
  remind_at: string;
  snoozed_until?: string | null;
  advance_minutes?: number | null;
  project_id?: string | null;
  project_name?: string | null;
};

/** Why a due reminder was not raised. Surfaced in the UI rather than swallowed. */
export type SuppressReason =
  | "device_off"
  | "muted"
  | "quiet_hours"
  | "below_priority"
  | "no_channel"
  | "digest_batched";

export type DeliveryPlan = {
  /** Raised on their own, right now. */
  singles: NotifiableReminder[];
  /** Held back and merged into one summary at the end of the digest window. */
  batched: NotifiableReminder[];
  /** Not raised, with the reason — so the row can explain itself. */
  suppressed: Array<{ reminder: NotifiableReminder; reason: SuppressReason }>;
};

/** Parses "22:00" / "9:00" / "9 PM" into minutes past local midnight. */
export function parseHhMm(value: string): number | null {
  const trimmed = value.trim().toLowerCase();

  const withMeridiem = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (withMeridiem) {
    let hour = Number(withMeridiem[1]);
    const minute = Number(withMeridiem[2] ?? 0);
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
    if (withMeridiem[3] === "pm" && hour < 12) hour += 12;
    if (withMeridiem[3] === "am" && hour === 12) hour = 0;
    return hour > 23 ? null : hour * 60 + minute;
  }

  const plain = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!plain) return null;
  const hour = Number(plain[1]);
  const minute = Number(plain[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/** Renders minutes past midnight back to "HH:MM" for the settings inputs. */
export function formatHhMm(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Whether `at` falls inside the quiet window, on the device's local clock.
 *
 * The window is half-open (start inclusive, end exclusive) so a 22:00–08:00
 * window covers exactly the night and never double-counts the 08:00 instant.
 * A window whose ends are equal is treated as "off" rather than "always",
 * because an always-silent device looks identical to a broken one.
 */
export function isWithinQuietHours(
  quiet: QuietHours,
  at: Date = new Date()
): boolean {
  if (!quiet.enabled) return false;

  const start = parseHhMm(quiet.start);
  const end = parseHhMm(quiet.end);
  if (start === null || end === null || start === end) return false;

  const minutes = at.getHours() * 60 + at.getMinutes();
  return start < end
    ? minutes >= start && minutes < end
    : // Wraps past midnight, e.g. 22:00 -> 08:00.
      minutes >= start || minutes < end;
}

/** True when `priority` is at least as urgent as `minimum`. */
export function meetsPriorityFloor(priority: Priority, minimum: Priority): boolean {
  return PRIORITY_RANK[priority] >= PRIORITY_RANK[minimum];
}

/** True when at least one channel is switched on. */
export function hasAnyChannel(settings: NotifySettings): boolean {
  return settings.enabled && (settings.channels.in_app || settings.channels.browser);
}

/**
 * Splits due reminders into the ones to raise now, the ones to batch, and the
 * ones to skip.
 *
 * The ordering of the checks is the whole point: a muted reminder is dropped
 * before quiet hours are consulted, so "muted" is never reported as "quiet",
 * and quiet hours are evaluated *before* the digest, because a digest that
 * fires at 2am is exactly the interruption quiet hours exist to prevent.
 */
export function planDelivery(
  due: NotifiableReminder[],
  settings: NotifySettings,
  now: Date = new Date()
): DeliveryPlan {
  const plan: DeliveryPlan = { singles: [], batched: [], suppressed: [] };

  if (!settings.enabled) {
    for (const reminder of due) plan.suppressed.push({ reminder, reason: "device_off" });
    return plan;
  }

  if (!hasAnyChannel(settings)) {
    for (const reminder of due) plan.suppressed.push({ reminder, reason: "no_channel" });
    return plan;
  }

  const quiet = isWithinQuietHours(settings.quietHours, now);
  const digesting = settings.digest.enabled && settings.digest.windowMinutes > 0;

  for (const reminder of due) {
    if (!reminder.is_enabled) {
      plan.suppressed.push({ reminder, reason: "muted" });
      continue;
    }
    if (quiet) {
      plan.suppressed.push({ reminder, reason: "quiet_hours" });
      continue;
    }
    if (!meetsPriorityFloor(reminder.priority, settings.minPriority)) {
      plan.suppressed.push({ reminder, reason: "below_priority" });
      continue;
    }
    if (digesting) {
      plan.batched.push(reminder);
      continue;
    }
    plan.singles.push(reminder);
  }

  return plan;
}

/** One reminder, as a toast title. */
export function alertTitle(reminder: NotifiableReminder): string {
  return reminder.title || "Reminder";
}

/** One reminder, as a toast body: the note, else the project, else nothing. */
export function alertBody(reminder: NotifiableReminder): string {
  const detail = reminder.note?.trim() || reminder.description?.trim();
  if (detail) return detail;
  return reminder.project_name ? reminder.project_name : "";
}

const MAX_DIGEST_LINES = 4;

/**
 * Collapses a batch into a single alert.
 *
 * Only the first few titles are spelled out — a notification listing twelve
 * reminders is noise, and the point of the digest is to be shorter than the
 * thing it replaces. The remainder is counted, not listed.
 */
export function buildDigest(reminders: NotifiableReminder[]): {
  title: string;
  body: string;
} {
  if (reminders.length === 0) return { title: "No reminders", body: "" };

  if (reminders.length === 1) {
    return {
      title: alertTitle(reminders[0]),
      body: alertBody(reminders[0]),
    };
  }

  const lines = reminders.slice(0, MAX_DIGEST_LINES).map((reminder) => {
    const project = reminder.project_name ? ` · ${reminder.project_name}` : "";
    return `• ${alertTitle(reminder)}${project}`;
  });

  const rest = reminders.length - MAX_DIGEST_LINES;
  if (rest > 0) lines.push(`• +${rest} more`);

  return { title: `${reminders.length} reminders due`, body: lines.join("\n") };
}

/**
 * When the next batch is due to flush, or null when nothing is waiting.
 *
 * The scheduler ticks far more often than the digest window is long, so this
 * keeps the batch from being flushed one tick after it was filled.
 */
export function digestFlushAt(
  firstDueAt: number,
  settings: NotifySettings,
  now: number = Date.now()
): number | null {
  if (!settings.digest.enabled) return null;
  const window = Math.max(0, settings.digest.windowMinutes) * 60_000;
  const due = firstDueAt + window;
  return due > now ? due : now;
}

/**
 * Folds a stored settings blob back into a usable object.
 *
 * Storage is user-editable and survives across app versions that may have
 * added keys, so every field is validated rather than trusted. A bad blob
 * yields the defaults instead of throwing inside a notification handler.
 */
export function normalizeSettings(value: unknown): NotifySettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_NOTIFY_SETTINGS };
  const raw = value as Partial<NotifySettings>;

  const channels = {
    in_app:
      typeof raw.channels?.in_app === "boolean"
        ? raw.channels.in_app
        : DEFAULT_NOTIFY_SETTINGS.channels.in_app,
    browser:
      typeof raw.channels?.browser === "boolean"
        ? raw.channels.browser
        : DEFAULT_NOTIFY_SETTINGS.channels.browser,
  };

  const quietStart =
    typeof raw.quietHours?.start === "string" && parseHhMm(raw.quietHours.start) !== null
      ? raw.quietHours.start
      : DEFAULT_NOTIFY_SETTINGS.quietHours.start;
  const quietEnd =
    typeof raw.quietHours?.end === "string" && parseHhMm(raw.quietHours.end) !== null
      ? raw.quietHours.end
      : DEFAULT_NOTIFY_SETTINGS.quietHours.end;

  return {
    enabled:
      typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_NOTIFY_SETTINGS.enabled,
    channels,
    quietHours: {
      enabled:
        typeof raw.quietHours?.enabled === "boolean"
          ? raw.quietHours.enabled
          : DEFAULT_NOTIFY_SETTINGS.quietHours.enabled,
      start: quietStart,
      end: quietEnd,
    },
    digest: {
      enabled:
        typeof raw.digest?.enabled === "boolean"
          ? raw.digest.enabled
          : DEFAULT_NOTIFY_SETTINGS.digest.enabled,
      windowMinutes:
        typeof raw.digest?.windowMinutes === "number" && raw.digest.windowMinutes >= 0
          ? raw.digest.windowMinutes
          : DEFAULT_NOTIFY_SETTINGS.digest.windowMinutes,
    },
    minPriority:
      raw.minPriority && raw.minPriority in PRIORITY_RANK
        ? raw.minPriority
        : DEFAULT_NOTIFY_SETTINGS.minPriority,
    browserPermission:
      raw.browserPermission === "granted" ||
      raw.browserPermission === "denied" ||
      raw.browserPermission === "default" ||
      raw.browserPermission === "unsupported"
        ? raw.browserPermission
        : DEFAULT_NOTIFY_SETTINGS.browserPermission,
  };
}