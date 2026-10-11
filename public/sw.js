/* Ownspece service worker.
 *
 * Caching policy, and the reason for it:
 *
 * - Static assets (hashed build output, icons, fonts, the manifest, the offline
 *   page) are cached aggressively. They are content-addressed or version-stamped,
 *   so serving a stale copy cannot show the wrong data.
 * - Navigations are NEVER cached. Every authenticated HTML response contains the
 *   user's own data, and putting that in a shared Cache Storage bucket is how
 *   one account ends up seeing another's dashboard on a shared device. Offline
 *   navigations get the static /offline page instead.
 * - Nothing else is touched. API and Supabase traffic passes straight through.
 */

const VERSION = "ownspece-v2";
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
            .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
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

self.addEventListener("fetch", (event) => {
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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Ownspece";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: payload.icon || "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: payload.tag || "ownspece",
      data: { url: payload.url || "/dashboard" },
      vibrate: [120, 60, 120],
    })
  );
});

/**
 * Focus an existing window if there is one — opening a second copy of an
 * installed app on every notification tap is the classic PWA annoyance.
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/dashboard",
    self.location.origin
  ).href;

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