"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the service worker and surfaces deploys.
 *
 * `updateViaCache: "none"` is required here: with the default HTTP cache in
 * front of `/sw.js`, a browser can keep running last week's worker, and the
 * cache and offline policy in it never take effect.
 *
 * Registration is production-only. A worker in development caches the dev
 * server's build output, which changes on every save and produces stale pages
 * that are miserable to debug.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;
    let detach: (() => void) | undefined;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;

        const onUpdateFound = () => {
          const installing = registration.installing;
          if (!installing) return;

          const onStateChange = () => {
            if (cancelled) return;
            // A controller only exists when an older worker was already in
            // charge, so this is an update rather than a first install.
            if (
              installing.state !== "installed" ||
              !navigator.serviceWorker.controller
            ) {
              return;
            }

            toast("A new version of Ownspece is ready.", {
              description: "Reload to pick up the latest changes.",
              duration: Infinity,
              action: {
                label: "Reload",
                onClick: () => {
                  installing.postMessage({ type: "SKIP_WAITING" });
                  window.location.reload();
                },
              },
            });
          };

          installing.addEventListener("statechange", onStateChange);
          detach = () => {
            installing.removeEventListener("statechange", onStateChange);
            registration.removeEventListener("updatefound", onUpdateFound);
          };
        };

        registration.addEventListener("updatefound", onUpdateFound);
        detach = () =>
          registration.removeEventListener("updatefound", onUpdateFound);
      })
      .catch(() => {
        // Registration is best-effort; the app must never block on it.
      });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, []);

  return null;
}