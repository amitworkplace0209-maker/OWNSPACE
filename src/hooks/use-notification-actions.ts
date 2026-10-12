"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  completeReminderAction,
  snoozeReminderAction,
} from "@/lib/actions/calendar";
import { markNotificationReadAction } from "@/lib/actions/notifications";

/**
 * Applies what the user chose on a notification, not in the app.
 *
 * A web notification's action buttons are the feature that makes a PWA feel
 * like a native Android app: "Done" and "Snooze 10m" resolve without opening
 * anything. The service worker cannot perform them itself — it has no Supabase
 * session and cannot call a server action — so it posts the intent here and
 * this hook applies it.
 *
 * An intent raised while no tab was open is parked in IndexedDB by the worker
 * and replayed on the next launch, so tapping "Done" from a locked phone still
 * completes the reminder.
 */

const MESSAGE_TYPE = "NOTIFICATION_ACTION";

export type NotificationActionRecord = {
  id: string;
  action: string;
  type: string | null;
  entityId: string | null;
  at: string;
};

export function useNotificationActions({
  onHandled,
}: {
  onHandled?: () => void;
} = {}): void {
  const router = useRouter();

  const apply = React.useCallback(
    async (record: NotificationActionRecord) => {
      const { action, entityId, type } = record;

      if (action === "dismiss") {
        if (type === "reminder" && entityId) {
          await completeReminderAction(entityId, true);
        }
        onHandled?.();
        router.refresh();
        return;
      }

      if (!entityId) return;

      switch (action) {
        case "complete":
          if (type === "reminder") await completeReminderAction(entityId, true);
          else await markNotificationReadAction(entityId);
          toast.success("Done.");
          break;

        case "snooze":
          if (type === "reminder") {
            await snoozeReminderAction(entityId, 10);
            toast("Snoozed", { description: "Back in 10 minutes." });
          }
          break;

        case "open":
          router.push(type === "reminder" ? "/reminders" : "/notifications");
          break;

        default:
          return;
      }

      onHandled?.();
      router.refresh();
    },
    [onHandled, router]
  );

  // Live intents, from a notification tapped while this tab is open.
  React.useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== MESSAGE_TYPE) return;
      const record = event.data.payload as NotificationActionRecord | undefined;
      if (record) void apply(record);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [apply]);

  // Parked intents, from a notification acted on with the app closed.
  React.useEffect(() => {
    if (!("indexedDB" in window)) return;

    let cancelled = false;

    void (async () => {
      const records = await readParkedActions();
      if (cancelled || records.length === 0) return;

      for (const record of records) {
        if (cancelled) return;
        await apply(record);
      }
      await clearParkedActions();
    })();

    return () => {
      cancelled = true;
    };
  }, [apply]);
}

// ---------------------------------------------------------------------------
// The hand-off store, written by the service worker
// ---------------------------------------------------------------------------

const DB_NAME = "ownspece-notification-fallback";
const STORE = "actions";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      resolve(null);
      return;
    }
    // The store is created by the worker on first upgrade; creating it here too
    // keeps this read working even if the worker version changed underneath.
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readParkedActions(): Promise<NotificationActionRecord[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    return await new Promise((resolve) => {
      try {
        const request = db
          .transaction(STORE, "readonly")
          .objectStore(STORE)
          .getAll();
        request.onsuccess = () => resolve((request.result ?? []) as NotificationActionRecord[]);
        request.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  } finally {
    db.close();
  }
}

async function clearParkedActions(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } catch {
    // Nothing to do — a replayed intent is harmless, just repeated.
  } finally {
    db.close();
  }
}

/**
 * Keeps the installed app's badge in step with the unread count.
 *
 * Chrome and Edge render `setBadgeCount` on the installed icon, which is the
 * single most native-looking thing a PWA can do. Every other browser ignores it.
 */
export function useAppBadge(unreadCount: number): void {
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (cancelled) return;
        const withBadge = registration as ServiceWorkerRegistration & {
          setBadgeCount?: (count?: number) => Promise<void>;
        };
        if (typeof withBadge.setBadgeCount !== "function") return;
        await withBadge.setBadgeCount(Math.max(0, unreadCount));
      } catch {
        // Badge support is patchy and entirely optional.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [unreadCount]);
}