"use client";

import { useAppBadge, useNotificationActions } from "@/hooks/use-notification-actions";

/**
 * The bridge between the operating system and the app.
 *
 * Two jobs, both of which are what make an installed app feel like a native
 * one rather than a web page in a window:
 *
 *  - **The action buttons on a notification.** "Done" and "Snooze" on a
 *    reminder alert resolve without opening the app. The service worker cannot
 *    apply them itself — it has no session and cannot call a server action —
 *    so it hands the intent to the page, and this is the page that listens.
 *    An intent raised while the app was closed is parked by the worker and
 *    replayed here on the next launch.
 *
 *  - **The badge on the app icon.** The unread count, drawn by the operating
 *    system on the installed app's icon. Every other app on the phone has one;
 *    this is what stops Ownspece being the odd one out.
 *
 * Mounted outside the app lock on purpose. A person who taps "Done" on a
 * reminder while the app is locked has said what they want, and the workspace
 * behind the lock does not need to be open for it to be applied. What they
 * must not get is the *contents* of the workspace, and nothing here shows any.
 */
export function NotificationBridge({ unreadCount }: { unreadCount: number }) {
  useNotificationActions();
  useAppBadge(unreadCount);

  return null;
}
