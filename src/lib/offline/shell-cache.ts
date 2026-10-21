/**
 * What Ownspece keeps on this device so it opens with no connection.
 *
 * The shape of the solution
 * -------------------------
 * Two different things are cached, and conflating them is what made earlier
 * attempts at offline support useless:
 *
 * 1. **A row snapshot** — `task-cache.client.ts` and
 *    `reminder-cache.client.ts` hold structured rows in IndexedDB, so a list
 *    can be *edited* offline and the edit replayed later.
 * 2. **A rendered page** — the service worker keeps the HTML and RSC payload of
 *    each route, so the app *opens and navigates* offline.
 *
 * Only the first existed. Opening the installed app with no connection failed at
 * the very first navigation — there was no shell to serve, so the browser showed
 * its own error page. That is what "this page could not load" was, and no amount
 * of row caching fixes it: the request never reached the app.
 *
 * This module owns the *second* thing's inputs. The worker itself is a plain
 * script that cannot import from `src`, so the rules live here, are unit
 * tested, and are mirrored in `public/sw.js` — with the two kept adjacent in
 * spirit and the cache-name format quoted in both files.
 *
 * Why rendered pages are cached at all
 * ------------------------------------
 * The obvious objection is that a rendered page contains the user's own data,
 * and a shared browser's Cache Storage is world-readable by the next person.
 * That is true, and it is why every cached page is namespaced by account and the
 * whole namespace is deleted on sign-out — the same rule the IndexedDB
 * snapshots already follow. The alternative is an app that cannot be opened
 * without a network, which is the larger failure.
 */

/**
 * The routes worth keeping.
 *
 * Exactly the navigation targets, and deliberately not "every URL". The set is
 * finite on purpose: warming is *n* full server renders, and an open-ended
 * crawler would eventually try `/notes/<every note>` and `/projects/<every
 * project>`. Those are reachable offline through the pages that list them, which
 * is where anyone actually goes.
 *
 * `/settings` is in the list because it is where the offline copy is managed, and
 * an offline user has to be able to see and clear it.
 */
export const SHELL_ROUTES: readonly string[] = [
  "/dashboard",
  "/projects",
  "/tasks",
  "/reminders",
  "/notifications",
  "/calendar",
  "/notes",
  "/daily",
  "/finance",
  "/resources",
  "/tags",
  "/timeline",
  "/gdrive",
  "/storage",
  "/analytics",
  "/activity",
  "/time",
  "/lab",
  "/archive",
  "/settings",
];

/**
 * Routes that must never end up in the shell cache.
 *
 * The auth screens are the important ones. `/login` renders differently
 * depending on whether you are signed in, and a cached copy of it would greet
 * the next person on a shared machine with the previous one's session. The
 * callbacks must not be cached for the same reason.
 *
 * Matches by prefix, so `/projects/abc` is also refused: those are per-record
 * pages whose ids are not in `SHELL_ROUTES` anyway.
 */
const NEVER_CACHE: readonly string[] = [
  "/login",
  "/signup",
  "/auth",
  "/forgot-password",
  "/offline",
  "/api",
  "/_next/webpack-hmr",
];

/** True when this path is one of the routes the shell is allowed to hold. */
export function isCacheablePath(pathname: string): boolean {
  if (NEVER_CACHE.some((route) => pathname === route || pathname.startsWith(`${route}/`))) {
    return false;
  }
  // Anything dynamic under a cached prefix is a per-record page. Warming is a
  // fixed list; a record page is only cached if the user actually visited it,
  // which `isCacheablePath` deliberately permits but warming never requests.
  return !/\/(notes|projects|tasks)\/[^/]+/.test(pathname);
}

/**
 * Normalises a path for use as a cache key.
 *
 * `/tasks`, `/tasks/` and `//tasks` are one page, and storing three copies of
 * the same HTML means one of them is always stale. Trailing slashes are
 * dropped rather than redirected for: this is a cache key, not a route.
 */
export function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/{2,}/g, "/");
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed;
}

/**
 * The cache bucket for one account.
 *
 * The account id is *in the cache name* rather than in the entry key. Cache
 * names are free-form strings, and this way the stored `Response` keeps its own
 * real `url` — which matters, because Next.js resolves client-side navigation
 * against the document URL and a synthetic entry URL would silently break
 * every in-app link on an offline page.
 *
 * The worker builds the same string in `public/sw.js`. Keep the two formats in
 * step: `ownspece-v5-shell-<userId>`.
 */
export function shellCacheName(version: string, userId: string): string {
  return `${version}-shell-${userId}`;
}

/**
 * Which of the two bodies a cache entry holds.
 *
 * A route has two: the HTML document, and the RSC payload the router fetches
 * during a soft navigation. They are not interchangeable — handing the router
 * an HTML body where it expects a Flight payload produces a blank page with no
 * error — so they get separate keys.
 */
export type ShellEntryKind = "document" | "rsc";

/** Marks a key as holding the RSC payload. Never sent to the server. */
const RSC_KEY_PARAM = "_ownspece";

/**
 * Query parameters stripped from a cache key.
 *
 *  - `_rsc` — Next's own cache-buster, a per-build hash appended to RSC
 *    requests. Left in, every deploy would produce a second full copy of every
 *    page and orphan the first.
 *  - `t`, `ts` — timestamps appended by retry and revalidation logic.
 *  - `dpl` — the deployment id. Same problem as `_rsc`, and it changes on every
 *    rollout for reasons that have nothing to do with the data.
 *
 * Anything else is kept: `?new=1` really does open a different view, and
 * collapsing those together would cache one form over the other.
 */
const DROPPED_PARAMS = ["_rsc", "t", "ts", "dpl"];

/**
 * The path-and-query string a cache entry is stored under.
 *
 * Normalised rather than taken from the request URL verbatim, for two reasons:
 * the same page arrives as `/tasks`, `/tasks/` and `//tasks` over a session, and
 * an un-normalised key would store three copies and serve the stale one
 * eventually. And the `_ownspece` marker is what separates a payload entry from
 * a document entry for the same route.
 *
 * `public/sw.js` mirrors this. Keep the two in step.
 */
export function shellCacheKey(
  pathname: string,
  search: string,
  kind: ShellEntryKind
): string {
  const params = new URLSearchParams(search);
  for (const param of DROPPED_PARAMS) params.delete(param);
  if (kind === "rsc") params.set(RSC_KEY_PARAM, "rsc");

  // Sorted, because `URLSearchParams` preserves insertion order and the browser
  // is free to hand us `?a=1&b=2` on one visit and `?b=2&a=1` on the next. Left
  // unsorted, that is two cache entries for one page, and whichever is found
  // first is whichever was stored first — which is not the one just fetched.
  params.sort();

  const path = normalisePath(pathname);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Whether a request is a route prefetch rather than a real navigation.
 *
 * A prefetch returns a *partial* payload — the shell without the data behind
 * its Suspense boundaries — and it is keyed by the router state tree, so the
 * same URL can legitimately produce different bytes depending on where the user
 * came from. Storing one under the same key as a full payload would let a
 * navigation offline render a page that never finishes loading.
 *
 * Prefetches are therefore never cached. They are cheap to regenerate and they
 * only ever happen while online.
 */
export function isPrefetchRequest(headers: Headers): boolean {
  return headers.has("Next-Router-Prefetch") || headers.has("Next-Router-Segment-Prefetch");
}

/**
 * How stale an offline copy may be before warming it again.
 *
 * Six hours is chosen against how the app is actually used: a dashboard opened
 * at breakfast and again at lunch should reflect lunch, and neither should cost
 * twenty server renders to keep current. Anything older than this is refreshed
 * on the next idle moment, not on a timer — a background task that fires on its
 * own is a background task that runs on someone's phone bill.
 */
export const WARM_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * How many routes are warmed at once.
 *
 * The worker loops sequentially rather than in batches, so this is really a
 * statement of intent about the size of the job: twenty routes is twenty server
 * renders, and it is why the warm is cancellable, staggered and skipped under
 * data saver rather than done eagerly on every load.
 */
export const WARM_CONCURRENCY = 1;

/** What one warm pass reports back. */
export type ShellWarmResult = {
  stored: number;
  failed: number;
  total: number;
  /** True when the pass decided there was nothing to do. */
  skipped?: boolean;
};

/**
 * Decides what to warm, if anything.
 *
 * Pure, so the rules are testable without a worker, a network or a browser —
 * which matters because the failure modes here are quiet. Warming too often
 * looks like a performance bug; warming too rarely looks like "offline is
 * broken", and it is only reproducible by unplugging something.
 *
 * Returns an empty list for every case where warming would be wasteful or
 * wrong: no routes, already fresh, a user who asked for data saver, or a caller
 * that has not said it is online.
 */
export function selectWarmRoutes(options: {
  routes: readonly string[];
  /** URLs already in the shell cache. */
  stored: ReadonlySet<string>;
  lastWarmedAt: number | null;
  now: number;
  ttlMs?: number;
  enabled: boolean;
  online: boolean;
  /** True when the OS or browser reports a metered/save-data preference. */
  saveData?: boolean;
}): string[] {
  const {
    routes,
    stored,
    lastWarmedAt,
    now,
    ttlMs = WARM_TTL_MS,
    enabled,
    online,
    saveData = false,
  } = options;

  // Warming is an optimisation with a real cost. Every reason to skip it is
  // checked before anything is fetched, not after the first route lands.
  if (!enabled || !online || routes.length === 0) return [];
  if (saveData) return [];
  if (lastWarmedAt !== null && now - lastWarmedAt < ttlMs) return [];

  // Deduplicated by normalised path, so a duplicated entry in the route list
  // costs one render and not two.
  const seen = new Set<string>();
  const pending: string[] = [];

  for (const route of routes) {
    const path = normalisePath(route);
    if (seen.has(path)) continue;
    seen.add(path);
    if (stored.has(route)) continue;
    pending.push(route);
  }

  return pending;
}

/**
 * The full set of URLs a warm pass should fetch for these routes.
 *
 * Two per route: the document, for a cold start or a reload, and the RSC
 * payload, for a soft navigation. Warming only the document is what produces
 * the worst version of this feature — every link tap offline still has to fail
 * and fall back, so the app feels broken one interaction after opening.
 */
export function warmUrlsFor(routes: readonly string[]): string[] {
  return routes.flatMap((route) => {
    const path = normalisePath(route);
    return [path, `${path}?_rsc=${WARM_RSC_TOKEN}`];
  });
}

/**
 * A fixed RSC token for warming.
 *
 * The real one changes per build. Using a constant here means the warmed entry
 * is keyed predictably and, more usefully, is *not* mistaken for the live
 * payload of the current build — after a deploy the app fetches the real one
 * and overwrites it, instead of serving a payload whose chunk ids no longer
 * exist.
 */
export const WARM_RSC_TOKEN = "warm";

/**
 * Headers the worker attaches when it fetches a URL to warm.
 *
 * The `_rsc` query param alone does not make a request an RSC request. Next
 * signals it with an `RSC` header, and the query param is only a cache-buster
 * the client appends. Warming without the header therefore returns HTML, stored
 * under a payload's key — which offline looks like the router receiving a
 * document where it expected a Flight payload, and rendering a blank page with
 * no error to explain it.
 */
export function warmHeadersFor(url: string): Record<string, string> {
  return url.includes("_rsc=") ? { RSC: "1" } : {};
}