/* Ownspece service worker.
 *
 * Caching policy, and the reason for it:
 *
 * - Static assets (hashed build output, icons, fonts, the manifest, the offline
 *   page) are cached aggressively. They are content-addressed or version-stamped,
 *   so serving a stale copy cannot show the wrong data.
 * - Navigations are NEVER cached. Every authenticated HTML response contains the
 *   user's own data, and putting that in a shared Cache Storage bucket is how one
 *   account ends up seeing another's dashboard on a shared device. Offline
 *   navigations get the static /offline page instead, and the app's own IndexedDB
 *   snapshot — which is namespaced per user id — is what backs the offline /tasks
 *   screen. See src/lib/offline/task-cache.client.ts and
 *   src/lib/offline/reminder-cache.client.ts.
 * - Nothing else is touched. API and Supabase traffic passes straight through.
 *
 * Development
 * -----------
 * The worker registers in development too, because push needs one: without a
 * registered worker `navigator.serviceWorker.ready` never resolves and
 * `pushManager.subscribe` can never run, which made the notification toggle spin
 * forever instead of explaining itself.
 *
 * What is disabled in development is the *caching*, not the worker. Turbopack
 * output changes on every save, so a cached copy is a stale page that is
 * miserable to debug — but push delivery has nothing to do with the cache.
 */

const IS_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

const VERSION = IS_DEV ? "ownspece-dev" : "ownspece-v4";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const OFFLINE_URL = "/offline";

const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/icon-192x192.png",
  "/icon-512x512.png",
  "/icon.svg",
];

// Build output and other immutable, non-user assets.
const STATIC_PATTERNS = [
  /^\/_next\/static\//,
  /^\/icon-\d+x\d+\.png$/,
  /^\/icon\.svg$/,
  /^\/manifest\.webmanifest$/,
];

self.addEventListener("install", (event) => {
  // Nothing to precache against a dev server whose build output is rewritten on
  // every save; caching it would just serve yesterday's page.
  if (IS_DEV) {
    event.waitUntil(self.skipWaiting());
    return;
  }

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // addAll is all-or-nothing: one 404 would leave the app with no offline
      // page at all, so failures are tolerated per entry.
      .then((cache) =>
        Promise.allSettled(
          PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" })))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            // In dev the caches are always cleared, so switching between a dev
            // worker and a real one cannot leave either holding stale entries.
            .filter(
              (key) =>
                IS_DEV || (key !== STATIC_CACHE && key !== RUNTIME_CACHE)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Let the page trigger an immediate takeover after a new deploy. */
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isStaticAsset(url) {
  return STATIC_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

/** Cache-first with a background refresh: instant, and self-healing. */
function cacheFirst(request) {
  return caches.match(request).then((cached) => {
    const network = fetch(request)
      .then((response) => {
        if (response && response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => cached);
    return cached || network;
  });
}

/** Network-only for HTML. Offline falls back to the static offline page. */
function navigationHandler(request) {
  return fetch(request).catch(async () => {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><title>Offline</title>" +
        "<body style=\"font:16px system-ui;padding:2rem\">You are offline.</body>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  });
}

/**
 * Background Sync: flush queued task edits the moment the device is back on a
 * network, rather than waiting for the tab to be open and focused.
 *
 * The queue itself lives in IndexedDB under `ownspece-offline`, written by the
 * tasks workspace. The worker only signals, and the page does the actual
 * replay — a service worker has no Supabase session and cannot call the
 * Server Actions, so this deliberately does not try.
 */
self.addEventListener("sync", (event) => {
  if (event.tag !== "ownspece-task-sync" && event.tag !== "ownspece-reminder-sync") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        client.postMessage(
          event.tag === "ownspece-reminder-sync"
            ? { type: "REMINDER_SYNC_REQUESTED" }
            : { type: "TASK_SYNC_REQUESTED" }
        );
      }
    })
  );
});

self.addEventListener("fetch", (event) => {
  // Dev serves everything straight from the network. The worker is registered
  // here for push, not for caching.
  if (IS_DEV) return;

  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else — including Supabase API calls, which are same-origin under
  // /auth/v1 — is left alone so the app's own caching rules apply.
});

// ---------------------------------------------------------------------------
// Push notifications
// ---------------------------------------------------------------------------

/**
 * A push the app was closed for still has to survive a restart, so the options
 * the UI depends on are read from IndexedDB rather than from a payload the
 * worker might never have decrypted.
 */
const FIRED_STORE = "ownspece-notification-fallback";
const FIRED_KEY = "pending";

async function rememberAction(record) {
  try {
    const db = await new Promise((resolve) => {
      const request = indexedDB.open(FIRED_STORE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("actions")) {
          request.result.createObjectStore("actions");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction("actions", "readwrite");
      tx.objectStore("actions").put(record, record.id);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
    db.close();
  } catch {
    // Storage unavailable. The user can still act on the row in the app.
  }
}

async function setBadge(count) {
  try {
    if (typeof self.registration.setBadgeCount === "function") {
      await self.registration.setBadgeCount(Math.max(0, count));
    }
  } catch {
    // Badge support is patchy and entirely optional.
  }
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Ownspece";

  event.waitUntil(
    (async () => {
      const actions = Array.isArray(payload.actions)
        ? payload.actions
            .filter((entry) => entry && entry.action && entry.title)
            .slice(0, 3) // Chromium refuses a fourth action.
            .map((entry) => ({ action: entry.action, title: entry.title }))
        : [];

      await self.registration.showNotification(title, {
        body: payload.body || "",
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        // One slot per source row. A repeating reminder that re-fires replaces
        // its own notification instead of stacking a second copy, which is what
        // `tag` is for and what a native Android notification does.
        tag: payload.tag || "ownspece",
        // Without a tag the OS refuses to re-alert an already-shown
        // notification, so a genuinely new push would stay silent.
        renotify: payload.renotify === true ? payload.tag || "ownspece" : false,
        timestamp: Date.now(),
        requireInteraction: false,
        data: {
          url: payload.url || "/dashboard",
          type: payload.type || null,
          entityId: payload.entityId || null,
          tag: payload.tag || "ownspece",
        },
        // Action buttons are what make a web notification feel like a native
        // one — "Done" and "Snooze" inline beats opening the app to act.
        ...(actions.length > 0 ? { actions } : {}),
      });
    })()
  );
});

/**
 * Handles a tap or an action button.
 *
 * An action is forwarded to whichever client is open; if none is, the intent is
 * parked in IndexedDB and replayed on the next launch. A worker cannot call the
 * app's server actions itself — it has no Supabase session — which is exactly
 * why this is a hand-off and not an inline write.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const action = event.action;
  const target = new URL(data.url || "/dashboard", self.location.origin).href;

  if (action) {
    event.waitUntil(
      (async () => {
        const record = {
          id: `${data.tag || "ownspece"}:${Date.now()}`,
          action,
          type: data.type || null,
          entityId: data.entityId || null,
          at: new Date().toISOString(),
        };

        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });

        for (const client of clients) {
          if (new URL(client.url).origin !== self.location.origin) continue;
          client.postMessage({ type: "NOTIFICATION_ACTION", payload: record });
          return;
        }

        // Nothing open: park it so the next launch can apply it.
        await rememberAction(record);
      })()
    );
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        if ("focus" in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

/**
 * A notification dismissed by swiping it away.
 *
 * Marking the row read here is what stops a cleared notification still showing
 * an unread badge on the next launch.
 */
self.addEventListener("notificationclose", (event) => {
  const data = event.notification.data || {};
  if (!data.entityId) return;

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        client.postMessage({
          type: "NOTIFICATION_ACTION",
          payload: {
            id: `close:${data.entityId}:${Date.now()}`,
            action: "dismiss",
            type: data.type || null,
            entityId: data.entityId,
            at: new Date().toISOString(),
          },
        });
        return;
      }
    })()
  );
});