"use client";

/**
 * Raising a system notification from the page.
 *
 * Why this is not `new Notification(...)`
 * ---------------------------------------
 * Because on Android — which is where an installed app actually lives — the
 * `Notification` constructor is not available at all. Chrome on Android throws
 * `TypeError: Illegal constructor`, and the alert silently never appears.
 * The only supported way to show a notification there is through a service
 * worker registration, which is also what gives the notification its actions,
 * its badge and its "tap to open" behaviour.
 *
 * So: the service worker is asked first, and the constructor is only a
 * fallback for the browsers that need it.
 *
 * The one thing that is *not* handled here is the permission prompt. That has
 * to come from a user gesture, so it is requested by the settings panel and
 * remembered in the device's own notification settings.
 */

export type SystemNotificationInput = {
  title: string;
  body?: string | null;
  /** One slot per source row, so a re-fire replaces its own alert. */
  tag?: string;
  /** Where a tap should take the user. */
  url?: string;
  /** The kind of thing this is about, so an action knows what to act on. */
  type?: string | null;
  /** The id of the thing itself. */
  entityId?: string | null;
  /** Inline buttons — "Done", "Snooze". */
  actions?: Array<{ action: string; title: string }>;
  /** Keeps the alert on screen until it is dealt with. */
  requireInteraction?: boolean;
  /** The buzz pattern. `true` is the platform's default. */
  vibrate?: number[] | boolean;
  /** True when the alert is genuinely new and should re-alert. */
  renotify?: boolean;
};

/**
 * The options a service worker notification really understands.
 *
 * `NotificationOptions` in the DOM types is the *page* notification's shape,
 * which has never grown the three fields a worker notification has always
 * supported: action buttons, the re-alert flag and the buzz pattern. Every
 * browser implements them; the types just do not say so.
 */
type WorkerNotificationOptions = NotificationOptions & {
  actions?: Array<{ action: string; title: string }>;
  renotify?: string | boolean;
  vibrate?: number[] | boolean;
  timestamp?: number;
};

/**
 * How long to wait for a service worker before giving up on it.
 *
 * `navigator.serviceWorker.ready` has no timeout of its own: with no worker
 * registered it never settles, and a notification that waits forever is a
 * notification that never appears.
 */
const WORKER_TIMEOUT_MS = 3000;

async function waitForWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;

  let timer: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), WORKER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/**
 * Shows one notification, on whichever channel this browser allows.
 *
 * Returns whether an alert was actually shown. The caller has usually already
 * raised an in-app toast, so a `false` here means "the toast was the only
 * alert" rather than "something went wrong".
 */
export async function showSystemNotification(
  input: SystemNotificationInput
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;

  const tag = input.tag ?? "ownspece";
  const url = input.url ?? "/dashboard";
  const data = {
    url,
    type: input.type ?? null,
    entityId: input.entityId ?? null,
    tag,
  };

  // The service worker first. On Android this is the only way that works, and
  // everywhere else it is the better way: the alert survives the tab being
  // closed, and it can carry action buttons.
  const registration = await waitForWorker();
  if (registration) {
    try {
      const options: WorkerNotificationOptions = {
        body: input.body ?? "",
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        tag,
        // Without a tag the OS refuses to re-alert an already-shown
        // notification, so a genuinely new alert would stay silent.
        renotify: input.renotify === true ? tag : false,
        timestamp: Date.now(),
        requireInteraction: input.requireInteraction === true,
        silent: false,
        vibrate: input.vibrate ?? [80, 40, 80],
        data,
        ...(input.actions && input.actions.length > 0
          ? {
              actions: input.actions
                .filter((entry) => entry.action && entry.title)
                .slice(0, 3) // Chromium refuses a fourth action.
                .map((entry) => ({ action: entry.action, title: entry.title })),
            }
          : {}),
      };

      await registration.showNotification(input.title, options);
      return true;
    } catch {
      // Fall through to the constructor below.
    }
  }

  try {
    const notification = new Notification(input.title, {
      body: input.body ?? "",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      if (url) window.location.assign(url);
    };

    return true;
  } catch {
    return false;
  }
}
