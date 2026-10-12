"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  registerPushSubscriptionAction,
  removePushSubscriptionAction,
} from "@/lib/actions/push";

/**
 * The registered service worker, or a thrown error if one never arrives.
 *
 * `navigator.serviceWorker.ready` is a promise with no timeout of its own: if
 * registration is blocked, fails, or the page has no controlling worker, it
 * never settles. Awaiting it bare meant the toggle button sat on its spinner
 * forever with no message — the single most confusing failure this page has.
 * A bounded wait turns that into an explanation.
 */
async function waitForServiceWorker(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  // A worker already in charge means push can be set up immediately, with no
  // wait at all — the common case once the app has been opened before.
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.ready;
  }

  let timer: number | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () =>
            reject(
              new Error(
                "No service worker registered. Reload the page, then try again."
              )
            ),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/**
 * Web push subscription for this device.
 *
 * A "device" here is one browser profile. The hook is the only place that
 * subscribes, stores and unsubscribes, so the permission state the UI shows and
 * the subscription the server actually holds cannot drift apart.
 *
 * Every failure path explains itself. A permission prompt that is dismissed,
 * a browser without push, or an unconfigured server all look identical to a
 * user otherwise — a toggle that silently does nothing — so each is reported in
 * words rather than swallowed.
 */

export type PushPermissionState = NotificationPermission | "unsupported" | "unknown";

// ---------------------------------------------------------------------------
// Browser capability, as an external store
// ---------------------------------------------------------------------------

/** True only when this browser can both ask for permission and hold a push. */
function getSupportedSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  const hasNotification = "Notification" in window;
  const hasPushManager = "serviceWorker" in navigator && "PushManager" in window;
  return hasNotification && hasPushManager;
}

function getPermissionSnapshot(): PushPermissionState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Re-read on the events that can actually change these answers.
 *
 * Neither support nor permission changes on its own; both move in response to
 * the user granting or revoking access, which is why the store subscribes to
 * `visibilitychange` and `focus` rather than polling.
 */
function subscribeToBrowser(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("focus", callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener("focus", callback);
    document.removeEventListener("visibilitychange", callback);
  };
}

export function usePushSubscription({
  enabled = true,
  onChange,
}: {
  enabled?: boolean;
  /** Called whenever the server's stored device list may have changed. */
  onChange?: () => void;
} = {}): {
  /** Live browser permission, mirrored into React state for the UI. */
  permission: PushPermissionState;
  /** True once this browser profile holds a registered subscription. */
  subscribed: boolean;
  subscribing: boolean;
  /** Whether `Notification.requestPermission` will even work here. */
  supported: boolean;
  subscribe: () => Promise<"granted" | "denied" | "dismissed" | "unsupported" | "error">;
  unsubscribe: () => Promise<void>;
} {
  const [subscribed, setSubscribed] = React.useState(false);
  const [subscribing, setSubscribing] = React.useState(false);

  /**
   * Support and permission are read through `useSyncExternalStore` rather than
   * copied into state from an effect.
   *
   * Both are facts about the browser, not about the app, and both have to agree
   * with the server render on the first paint. An effect that set them would
   * render once with "unknown" and then again with the real answer, which is
   * the cascading-render shape this codebase's lint rule exists to prevent.
   */
  const supported = React.useSyncExternalStore(
    subscribeToBrowser,
    getSupportedSnapshot,
    () => false
  );
  const permission = React.useSyncExternalStore(
    subscribeToBrowser,
    getPermissionSnapshot,
    () => "unknown" as const
  );

  // Whether *this* browser profile already holds a subscription. That is app
  // state rather than a browser fact, so it is fetched — the async read is what
  // makes an effect the right tool here.
  React.useEffect(() => {
    if (!enabled || !supported) return;

    let cancelled = false;

    void (async () => {
      try {
        const registration = await waitForServiceWorker();
        const existing = await registration.pushManager.getSubscription();

        if (!existing) {
          if (!cancelled) setSubscribed(false);
          return;
        }

        // Only report "on" when the *server* also has the subscription. A local
        // one can outlive its row — a wiped table, a re-generated key pair — and
        // a toggle that reads on while pushes go nowhere is the worst state to
        // be in, because it looks like it is working.
        const json = existing.toJSON();
        const p256dh = json.keys?.p256dh;
        const auth = json.keys?.auth;

        if (p256dh && auth) {
          const registered = await registerPushSubscriptionAction({
            endpoint: existing.endpoint,
            p256dh,
            auth,
            label: deviceLabel(),
            userAgent: navigator.userAgent,
          });
          if (!registered.error) {
            if (!cancelled) setSubscribed(true);
            return;
          }
        }

        // The server cannot deliver to it, so the local copy is dead weight.
        await existing.unsubscribe();
        if (!cancelled) setSubscribed(false);
      } catch {
        // No worker yet, or storage unavailable. Treated as "not subscribed",
        // which is the safe direction — it never claims a push exists.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, supported]);

  const subscribe = React.useCallback(async () => {
    if (!supported) {
      toast.error("This browser cannot receive push notifications.");
      return "unsupported" as const;
    }
    if (subscribing) return "error" as const;

    setSubscribing(true);
    try {
      const result = await Notification.requestPermission();

      if (result === "denied") {
        toast.error("Notifications are blocked.", {
          description: "Re-enable them for this site in your browser settings.",
        });
        return "denied" as const;
      }

      if (result === "default") {
        // Chrome resolves as "default" without ever showing a prompt, and it
        // also resolves that way when the user closes the window. Saying so is
        // better than leaving a toggle that appears to have worked.
        toast("Permission was dismissed", {
          description: "Turn notifications on to receive alerts outside the app.",
        });
        return "dismissed" as const;
      }

      const registration = await waitForServiceWorker();
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          // `ArrayBuffer` rather than a `Uint8Array`: lib.dom types the key as a
          // BufferSource, and a `Uint8Array<ArrayBufferLike>` is not assignable
          // to it because its buffer may be a SharedArrayBuffer.
          applicationServerKey: (await resolveApplicationServerKey()).buffer as ArrayBuffer,
        }));

      const json = subscription.toJSON();
      const endpoint = subscription.endpoint;
      const p256dh = json.keys?.p256dh;
      const auth = json.keys?.auth;

      if (!p256dh || !auth) {
        toast.error("This browser returned an incomplete subscription.");
        return "error" as const;
      }

      const registered = await registerPushSubscriptionAction({
        endpoint,
        p256dh,
        auth,
        label: deviceLabel(),
        userAgent: navigator.userAgent,
      });

      if (registered.error) {
        toast.error(registered.error);
        return "error" as const;
      }

      setSubscribed(true);
      onChange?.();
      toast.success("Notifications are on", {
        description: "This device will receive alerts even when Ownspece is closed.",
      });
      return "granted" as const;
    } catch (error) {
      toast.error("Could not turn on notifications.", {
        description: error instanceof Error ? error.message : undefined,
      });
      return "error" as const;
    } finally {
      setSubscribing(false);
    }
  }, [onChange, subscribing, supported]);

  const unsubscribe = React.useCallback(async () => {
    if (!supported) return;

    try {
      const registration = await waitForServiceWorker();
      const subscription = await registration.pushManager.getSubscription();
      // Remove the server row even if the local subscription has already gone,
      // so a half-failed state cannot leave a dead endpoint on file.
      if (subscription) {
        await removePushSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      onChange?.();
      toast.success("Notifications are off for this device.");
    } catch {
      toast.error("Could not turn off notifications.");
    }
  }, [onChange, supported]);

  return { permission, subscribed, subscribing, supported, subscribe, unsubscribe };
}

/**
 * Fetches the VAPID public key from the server.
 *
 * It has to be a round trip rather than a build-time constant because the key is
 * rotatable: baking it in would make rotating the pair require a rebuild.
 */
async function resolveApplicationServerKey(): Promise<Uint8Array> {
  const response = await fetch("/api/push/public-key", { cache: "no-store" });
  if (!response.ok) throw new Error("Push is not configured on this server.");

  const { publicKey } = (await response.json()) as { publicKey: string };
  if (!publicKey) throw new Error("Push is not configured on this server.");

  const padded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** A short, recognisable name for this device in the device list. */
function deviceLabel(): string {
  const ua = navigator.userAgent;

  const platform = /Android/i.test(ua)
    ? "Android"
    : /iPhone|iPad|iPod/i.test(ua)
      ? "iOS"
      : /Mac OS X/i.test(ua)
        ? "Mac"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Linux/i.test(ua)
            ? "Linux"
            : "Device";

  const browser = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Browser";

  return `${platform} · ${browser}`;
}