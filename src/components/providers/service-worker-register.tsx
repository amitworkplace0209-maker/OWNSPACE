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
 * Registration is *not* gated on NODE_ENV. It used to be, and that silently
 * broke every notification toggle in development: with no worker registered,
 * `navigator.serviceWorker.ready` never resolves, so `pushManager.subscribe`
 * never ran and the button spun forever instead of reporting why. Push needs a
 * worker; caching does not, and `public/sw.js` decides that for itself by
 * looking at the hostname, so dev gets a worker that forwards everything to the
 * network and caches nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
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