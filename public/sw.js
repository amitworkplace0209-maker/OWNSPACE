/* Ownspece service worker.
 *
 * What broke, and what this file is for
 * -------------------------------------
 * Navigations used to be *never* cached, deliberately: every authenticated HTML
 * response contains the user's own data, and a shared Cache Storage bucket is
 * how one account ends up seeing another's dashboard on a shared device. Offline
 * navigations therefore fell back to a static `/offline` page — or, worse, to
 * nothing at all, and the browser showed its own "this page could not load"
 * error. Closing the installed app and reopening it with no connection was
 * reliably broken, and no amount of IndexedDB row caching fixed it, because the
 * request never reached the app in the first place.
 *
 * So navigations are cached now, and the shared-device objection is answered
 * rather than ignored:
 *
 *   - every entry lives in a bucket named for one account, so a cached page is
 *     only ever served to that account;
 *   - the account is told to the worker by the page, and the worker *only*
 *     serves a cached page when it has been told who is signed in;
 *   - the whole bucket is deleted the moment that account signs out;
 *   - a response that was a redirect (an expired session bouncing to `/login`)
 *     is never stored, so signing out server-side cannot leave a cached app
 *     page behind.
 *
 * Caching policy, surface by surface
 * ----------------------------------
 *
 * - Static assets (hashed build output, icons, the manifest, the offline page)
 *   are cached aggressively. They are content-addressed or version-stamped, so
 *   serving a stale copy cannot show the wrong data.
 * - Navigations and RSC payloads: **network first, with a short deadline**, then
 *   the per-account cache, then `/offline`. Network-first because the data is
 *   live and RLS-protected — a dashboard from yesterday is worse than a wait.
 *   The deadline because a phone on a dead connection can leave a `fetch` open
 *   for thirty seconds, and thirty seconds of blank screen is exactly the
 *   failure this file exists to remove.
 * - Everything else — Supabase API calls, which are same-origin under `/auth/v1`
 *   — passes straight through to the app's own caching rules.
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
 *
 * The rules that decide *what* is worth caching live in
 * `src/lib/offline/shell-cache.ts`, unit tested, and are mirrored here. The two
 * must be changed together; the cache-name format especially.
 */

const IS_DEV =
  self.location.hostname === "localhost" ||
  self.location.hostname === "127.0.0.1" ||
  self.location.hostname === "[::1]";

const VERSION = IS_DEV ? "ownspece-dev" : "ownspece-v6";
const STATIC_CACHE = `${VERSION}-static`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const META_CACHE = `${VERSION}-meta`;

/** Mirrors `shellCacheName()` in src/lib/offline/shell-cache.ts. */
const SHELL_CACHE_PREFIX = `${VERSION}-shell-`;

const OFFLINE_URL = "/offline";

/**
 * Where the signed-in account is remembered, so the worker can tell whether it
 * is allowed to serve a cached page at all after a restart.
 *
 * A cache entry rather than a variable: the worker is killed and revived
 * constantly — on mobile, after every app switch — and a module-level variable
 * would be `null` on exactly the cold start this file exists to make work.
 */
const ACTIVE_USER_KEY = "/__ownspece/active-user";

/**
 * How long the network gets before the cached page is used instead.
 *
 * Long enough that a normal load never reaches it: a warm navigation is well
 * under a second on any connection worth having. Short enough that a dead
 * connection feels like a short wait rather than a hang.
 */
const NETWORK_DEADLINE_MS = 3500;

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

/**
 * Never cached, at any layer.
 *
 * The auth screens are the reason a shared browser is dangerous here. A cached
 * `/login` renders differently depending on whether you are signed in, so the
 * copy left behind by the last person would greet the next one.
 */
const NEVER_CACHE = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/offline",
  "/api",
];

function pathIsNeverCached(pathname) {
  return NEVER_CACHE.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// ---------------------------------------------------------------------------
// Install / activate
// ---------------------------------------------------------------------------

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
            //
            // Shell buckets are matched by *name* and deleted rather than
            // rewritten: when VERSION changes, every account's rendered pages
            // belong to the previous build and must go, or the app would keep
            // serving HTML whose chunk ids no longer exist.
            .filter((key) => IS_DEV || (key !== STATIC_CACHE && key !== RUNTIME_CACHE))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Page <-> worker messages
// ---------------------------------------------------------------------------

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  switch (data.type) {
    case "SKIP_WAITING":
      // The page found a new deploy and wants it now.
      self.skipWaiting();
      return;

    case "SET_USER":
      event.waitUntil(setActiveUser(data.userId));
      return;

    case "CLEAR_USER":
      event.waitUntil(clearUser(data.userId));
      return;

    case "WARM":
      event.waitUntil(warm(data.urls || []).then((result) => reply(event, {
        type: "WARM_DONE",
        ...result,
      })));
      return;

    case "SHELL_STATUS":
      event.waitUntil(shellStatus().then((status) => reply(event, status)));
      return;

    default:
  }
});

/** Replies over the MessageChannel the page opened, if it opened one. */
function reply(event, payload) {
  const port = event.ports && event.ports[0];
  if (port) port.postMessage(payload);
}

// ---------------------------------------------------------------------------
// The active account
// ---------------------------------------------------------------------------

async function readActiveUser() {
  try {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(ACTIVE_USER_KEY);
    if (!response) return null;
    const value = await response.text();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Records who is signed in, deleting the previous account's pages if it is
 * somebody else.
 *
 * Two accounts on one device is normal — a personal phone and a work phone in
 * the same browser profile, or simply signing out and back in. Without the
 * delete, the first account's entire rendered app stays in Cache Storage
 * forever, readable by the next sign-in, which is the shared-device problem all
 * over again.
 */
async function setActiveUser(userId) {
  if (!userId || typeof userId !== "string") return;

  const previous = await readActiveUser();
  if (previous && previous !== userId) {
    await caches.delete(`${SHELL_CACHE_PREFIX}${previous}`);
  }

  const cache = await caches.open(META_CACHE);
  await cache.put(ACTIVE_USER_KEY, new Response(userId));
}

/** Removes one account's rendered pages and, if it was the active one, the marker. */
async function clearUser(userId) {
  if (!userId || typeof userId !== "string") return;
  await caches.delete(`${SHELL_CACHE_PREFIX}${userId}`);
  if ((await readActiveUser()) === userId) {
    const cache = await caches.open(META_CACHE);
    await cache.delete(ACTIVE_USER_KEY);
  }
}

async function shellStatus() {
  const userId = await readActiveUser();
  if (!userId) return { type: "SHELL_STATUS", userId: null, entries: 0 };

  const cache = await caches.open(`${SHELL_CACHE_PREFIX}${userId}`);
  const keys = await cache.keys();
  return { type: "SHELL_STATUS", userId, entries: keys.length };
}

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The app shell
// ---------------------------------------------------------------------------

/**
 * Races the network against a deadline.
 *
 * `Promise.race` alone would leak the losing request's rejection into an
 * unhandled rejection; the timeout branch swallows it explicitly, and the
 * network response is ignored once the deadline has passed.
 */
function fetchWithDeadline(request) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), NETWORK_DEADLINE_MS);
  });

  return Promise.race([fetch(request), deadline])
    .then((response) => {
      clearTimeout(timer);
      return response;
    })
    .catch(() => {
      clearTimeout(timer);
      return null;
    });
}

/**
 * Whether a response may be written to the shell cache.
 *
 * The redirect test is the important one. An expired Supabase session makes the
 * proxy answer a navigation with a 307 to `/login`, and `fetch` follows it —
 * producing a 200 whose body is the *login page* under the *app's* URL. Cached
 * under that URL, it would be served to the next person who opens the app,
 * fully signed in as nobody. So a response that was redirected, or that is not
 * a success, or that is not a document, is never stored.
 */
function isStorable(response, kind) {
  if (!response || !response.ok) return false;
  if (response.redirected) return false;
  if (response.type === "opaque") return false;

  const contentType = response.headers.get("content-type") || "";

  // The kind is checked, not assumed. An HTML body stored under a payload's key
  // is the failure mode this whole file is most likely to produce by accident:
  // the page loads, the router gets a document where it expected a Flight
  // payload, and nothing anywhere reports an error.
  if (kind === "rsc") return contentType.includes("text/x-component");
  return contentType.includes("text/html");
}

/**
 * Collapses repeated slashes and drops a trailing one.
 *
 * `/tasks`, `/tasks/` and `//tasks` are one page, and caching them as three
 * entries means one of the three is always the stale copy that happens to be
 * found first.
 *
 * Shared by the live lookup and the warm pass on purpose. Two copies of this
 * rule would drift, and the symptom — a page that is "cached" but never served —
 * only reproduces offline, on a device, weeks apart.
 */
function normalisePathname(pathname) {
  const collapsed = pathname.replace(/\/{2,}/g, "/");
  return collapsed.length > 1 && collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

/**
 * The cache key for a request.
 *
 * Normalised, and marked by kind. Two details make this work, and both are
 * consequences of the Cache API rather than choices:
 *
 *  - **Keys are plain URLs with no headers.** A `Vary` response is only matched
 *    against the request headers that were stored with it, so storing with a
 *    real request and matching with a synthesised one (or the reverse) would
 *    never hit. Storing and matching both with headerless URLs sidesteps that
 *    entirely.
 *  - **Prefetches are not cached.** They return a partial payload keyed by the
 *    router state tree, so the same URL legitimately produces different bytes
 *    depending on where the user navigated from. Caching one under the payload's
 *    key would let an offline navigation render a shell that never finishes.
 */
function shellKeyFor(request, url) {
  if (url.searchParams.has("_rsc") && isPrefetchRequest(request.headers)) return null;

  const kind = url.searchParams.has("_rsc") ? "rsc" : "document";
  const key = new URL(url.href);
  for (const param of ["_rsc", "t", "ts", "dpl"]) key.searchParams.delete(param);
  if (kind === "rsc") key.searchParams.set("_ownspece", "rsc");
  // Sorted, so `?a=1&b=2` and `?b=2&a=1` are one entry rather than two copies
  // of the same page — one of which is always the stale one.
  key.searchParams.sort();
  key.pathname = normalisePathname(key.pathname);

  return { key: key.href, kind };
}

function isPrefetchRequest(headers) {
  return headers.has("Next-Router-Prefetch") || headers.has("Next-Router-Segment-Prefetch");
}

/** Network first, then this account's cache, then the static offline page. */
async function shellHandler(request) {
  const userId = await readActiveUser();
  const resolved = shellKeyFor(request, new URL(request.url));

  // No account, no cached page to offer. A signed-out visitor still gets a real
  // network answer, and the `/offline` fallback below if there is not one.
  const cache = userId ? await caches.open(`${SHELL_CACHE_PREFIX}${userId}`) : null;
  const cached = cache && resolved ? await cache.match(resolved.key) : undefined;

  const response = await fetchWithDeadline(request);

  if (response) {
    if (cache && resolved && isStorable(response, resolved.kind)) {
      // Not awaited: the user is looking at the response already, and a slow
      // write must not delay it.
      cache.put(resolved.key, response.clone()).catch(() => {});
    }
    return response;
  }

  if (cached) return cached;

  const offline = await caches.match(OFFLINE_URL);
  if (offline) return offline;

  return new Response(
    "<!doctype html><meta charset=\"utf-8\"><title>Offline</title>" +
      "<body style=\"font:16px system-ui;padding:2rem\">You are offline, and this page " +
      "has not been stored on this device yet.</body>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

// ---------------------------------------------------------------------------
// Warming
// ---------------------------------------------------------------------------

/**
 * Fetches and stores a list of URLs so the app is readable with no connection.
 *
 * This is what turns "offline support" into "open the app once and it is all
 * there". Without it the cache fills one page per visit, which is precisely the
 * page-by-page behaviour a user experiences as broken.
 *
 * Sequential rather than parallel: warming twenty routes at once would open
 * twenty database connections at the moment the user is trying to read the
 * dashboard, and the whole point is that this happens without being noticed.
 * Failures are counted, not thrown — a route that 500s must not stop the other
 * nineteen from being kept.
 */
async function warm(urls) {
  let stored = 0;
  let failed = 0;

  // Read once, not per URL: this is a Cache round trip and the account cannot
  // change while the worker is mid-loop.
  const userId = await readActiveUser();
  if (!userId) return { stored: 0, failed: urls.length, total: urls.length };

  const cache = await caches.open(`${SHELL_CACHE_PREFIX}${userId}`);

  for (const target of urls) {
    try {
      const url = new URL(target, self.location.origin);
      const wantsRsc = url.searchParams.has("_rsc");

      // Reuse the live key function rather than re-deriving it. The stored key
      // must be *exactly* what a real navigation will look up, or the page is
      // stored and never found — and the only symptom is "offline is broken"
      // on a route somebody visited last Tuesday.
      const resolved = shellKeyFor(
        { headers: new Headers(wantsRsc ? { RSC: "1" } : {}) },
        url
      );
      if (!resolved) continue;

      // The `RSC` header, not the `_rsc` param, is what makes Next return a
      // Flight payload. Warming with only the param stores a document under a
      // payload's key, and the first offline navigation then renders blank.
      const response = await fetch(
        new Request(url.href, {
          headers: wantsRsc ? { RSC: "1" } : undefined,
          credentials: "same-origin",
        })
      );

      if (!isStorable(response, resolved.kind)) {
        failed += 1;
        continue;
      }

      await cache.put(resolved.key, response.clone());
      stored += 1;
    } catch {
      failed += 1;
    }
  }

  return { stored, failed, total: urls.length };
}

// ---------------------------------------------------------------------------
// Background Sync: flush queued edits the moment the device reconnects
// ---------------------------------------------------------------------------

/**
 * The queue lives in IndexedDB, written by the tasks and reminders workspaces.
 * The worker only signals, and the page does the actual replay — a service
 * worker has no Supabase session and cannot call the Server Actions, so this
 * deliberately does not try.
 */
const SYNC_MESSAGES = {
  "ownspece-task-sync": "TASK_SYNC_REQUESTED",
  "ownspece-reminder-sync": "REMINDER_SYNC_REQUESTED",
  "ownspece-row-sync": "ROW_SYNC_REQUESTED",
};

self.addEventListener("sync", (event) => {
  const message = SYNC_MESSAGES[event.tag];
  if (!message) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        client.postMessage({ type: message });
      }
    })
  );
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  // Dev serves everything straight from the network. The worker is registered
  // here for push, not for caching.
  if (IS_DEV) return;

  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (pathIsNeverCached(url.pathname)) return;

  if (request.mode === "navigate") {
    event.respondWith(shellHandler(request));
    return;
  }

  // Next's soft navigation: a `fetch` for the RSC payload of another route.
  // Cached for the same reason documents are — without it, every link tap
  // offline fails and falls back, so the app feels broken one interaction
  // after opening.
  if (url.searchParams.has("_rsc")) {
    // A prefetch is left to the network entirely: it is a partial payload keyed
    // by where the user came from, and it only ever happens while online.
    if (!isPrefetchRequest(request.headers)) {
      event.respondWith(shellHandler(request));
    }
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
        // A critical reminder stays on screen until it is dealt with; an
        // ordinary one goes away on its own.
        requireInteraction: payload.requireInteraction === true,
        silent: false,
        // The buzz. Android honours the pattern, iOS ignores it, and every
        // other platform simply ignores the field.
        vibrate: payload.vibrate === false ? undefined : [80, 40, 80],
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
          return client.focus();
        }

        // Nothing open: park it so the next launch can apply it.
        await rememberAction(record);
        return undefined;
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