"use client";

/**
 * The page half of the offline shell.
 *
 * `public/sw.js` owns the caching; this owns the decisions. The worker cannot
 * know who is signed in (Supabase's session cookie is opaque to it) and has no
 * way to know whether warming is welcome right now, so both facts are told to it
 * from here.
 *
 * The three jobs:
 *
 * 1. **Identify the account**, so the worker knows which cached pages it is
 *    allowed to serve. Without this the worker serves nobody, because it cannot
 *    guess, and an offline reopen falls straight back to the browser's own error
 *    page.
 * 2. **Warm the shell** — fetch every route once, so the app opens and navigates
 *    with no connection instead of filling in one page per visit.
 * 3. **Remember the preference**, per account, in `localStorage`.
 *
 * Every function is best-effort. A browser with no service worker, a private
 * window, or a worker that never activates must leave the app fully working —
 * it just is not offline-capable, which is not a reason to break the page.
 */

import {
  selectWarmRoutes,
  warmUrlsFor,
  WARM_TTL_MS,
  type ShellWarmResult,
} from "@/lib/offline/shell-cache";

/**
 * How long to wait for a worker before giving up on all of this.
 *
 * `navigator.serviceWorker.ready` resolves as soon as a registration is
 * *active*, which on a cold start can mean a second or two on a slow phone. It
 * can also mean never, on a browser that refuses workers outright. So this is a
 * hard ceiling rather than an open-ended await.
 */
const READY_TIMEOUT_MS = 8_000;

/**
 * Allowance per URL in a warm pass.
 *
 * A warm is forty sequential requests — a document and a payload for each of
 * twenty routes — and the worker reports back only at the end. A flat timeout
 * short enough for a single reply would cut a healthy pass in half on a phone,
 * and the caller, seeing no reply, would report that the browser cannot store
 * anything. Wrong diagnosis, and the user is told their device is incapable
 * when it is merely slow.
 */
const WARM_MS_PER_URL = 1_500;
const WARM_MIN_TIMEOUT_MS = 20_000;

const PREFIX = "ownspece:shell:v1";

type Preference = {
  /** Keep the whole app on this device. Off means "never warm". */
  enabled: boolean;
  lastWarmedAt: number | null;
};

function preferenceKey(userId: string): string {
  return `${PREFIX}:${userId}`;
}

export function readShellPreference(userId: string): Preference {
  const fallback: Preference = { enabled: true, lastWarmedAt: null };
  try {
    const raw = window.localStorage.getItem(preferenceKey(userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Preference>;
    return {
      enabled: parsed.enabled !== false,
      lastWarmedAt: typeof parsed.lastWarmedAt === "number" ? parsed.lastWarmedAt : null,
    };
  } catch {
    return fallback;
  }
}

function writeShellPreference(userId: string, next: Preference): void {
  try {
    window.localStorage.setItem(preferenceKey(userId), JSON.stringify(next));
  } catch {
    // Storage unavailable; warming still works, it just runs more often.
  }
}

/**
 * Whether this browser has a worker to talk to.
 *
 * `localhost` is excluded because the worker in development is a deliberate
 * no-op: Turbopack rewrites its output on every save, so a cached page would be
 * yesterday's page and warming would only produce confusion. Push is the reason
 * a worker is registered in dev at all, and push does not need any of this.
 */
function workerWorthTalkingTo(): boolean {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

/**
 * The active worker, or null.
 *
 * `controller` is the worker actually in charge of this page. `registration.active`
 * is the fallback for the very first load after an install, where the worker is
 * active but has not claimed the page yet — using the wrong one of those is
 * what makes a `postMessage` vanish with no reply and no error.
 */
async function activeWorker(): Promise<ServiceWorker | null> {
  if (!workerWorthTalkingTo()) return null;

  try {
    const timeout = new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), READY_TIMEOUT_MS);
    });
    const registration = await Promise.race([navigator.serviceWorker.ready, timeout]);
    if (!registration) return null;
    return navigator.serviceWorker.controller ?? registration.active ?? null;
  } catch {
    return null;
  }
}

/** Sends a message and waits for the worker's reply, if it sends one. */
async function ask<T>(
  type: string,
  payload: Record<string, unknown> = {},
  timeoutMs = 5_000
): Promise<T | null> {
  const worker = await activeWorker();
  if (!worker) return null;

  return new Promise<T | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      resolve(null);
    }, timeoutMs);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data as T);
    };

    try {
      worker.postMessage({ type, ...payload }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      channel.port1.close();
      resolve(null);
    }
  });
}

/** Fire-and-forget: used for the messages with no useful answer. */
async function tell(type: string, payload: Record<string, unknown> = {}): Promise<void> {
  const worker = await activeWorker();
  if (!worker) return;
  try {
    worker.postMessage({ type, ...payload });
  } catch {
    // Worker went away mid-flight. The next load will try again.
  }
}

/** Tells the worker which account's pages it may cache and serve. */
export async function registerShellUser(userId: string): Promise<boolean> {
  await tell("SET_USER", { userId });
  return workerWorthTalkingTo();
}

/**
 * Runs a warm pass if the stored copy is due for one.
 *
 * `force` is what Settings calls when the user asks for it explicitly; the
 * automatic path never forces, because a stale copy is not worth twenty server
 * renders on every single page load.
 */
export async function warmShell(options: {
  userId: string;
  routes: readonly string[];
  force?: boolean;
}): Promise<ShellWarmResult | null> {
  const preference = readShellPreference(options.userId);

  const pending = selectWarmRoutes({
    routes: options.routes,
    stored: new Set<string>(),
    lastWarmedAt: options.force ? null : preference.lastWarmedAt,
    now: Date.now(),
    ttlMs: WARM_TTL_MS,
    enabled: preference.enabled,
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    saveData: prefersReducedData(),
  });

  if (pending.length === 0) {
    return { stored: 0, failed: 0, total: 0, skipped: true };
  }

  const urls = warmUrlsFor(pending);
  const result = await ask<ShellWarmResult>(
    "WARM",
    { urls },
    Math.max(WARM_MIN_TIMEOUT_MS, urls.length * WARM_MS_PER_URL)
  );
  // No reply means the pass did not finish — a closed tab, a worker that went
  // away mid-loop, a network that dropped. Deliberately *not* reported as an
  // error: the clock has not moved, so the next load tries again and finishes
  // the job, which is the right outcome for a dropped connection.
  if (!result) return null;

  // Only a completed pass moves the clock. A partial one — six routes of
  // twenty — leaves the copy due, so the next visit tries again and finishes
  // the job, which is the behaviour a dropped connection should produce.
  if (result.failed === 0) {
    writeShellPreference(options.userId, {
      ...preference,
      lastWarmedAt: Date.now(),
    });
  }

  return result;
}

/**
 * Whether the OS or browser asked us to be careful with someone's data.
 *
 * `saveData` is the explicit request. `effectiveType` on a metered connection
 * counts too, because twenty full server renders is not something to do over a
 * phone's cellular data without being asked.
 */
function prefersReducedData(): boolean {
  if (typeof navigator === "undefined") return false;

  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;

  if (!connection) return false;
  if (connection.saveData === true) return true;
  return connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}

/** How many pages this device currently holds for an account. */
export async function readShellEntryCount(userId: string): Promise<number | null> {
  const status = await ask<{ userId: string | null; entries: number }>("SHELL_STATUS");
  if (!status) return null;
  // A `null` user id means the worker has not been told about this account, so
  // any count it could give belongs to somebody else.
  if (status.userId !== userId) return null;
  return status.entries;
}

/**
 * Deletes this account's stored pages and forgets the preference.
 *
 * Called on sign-out alongside the IndexedDB caches. This one matters more than
 * the others: the row caches hold structured rows the app can re-fetch, whereas
 * this holds a rendered copy of every page, and it is the one that would let a
 * shared machine show one person's whole workspace to the next.
 */
export async function clearShell(userId: string): Promise<void> {
  await tell("CLEAR_USER", { userId });
  try {
    window.localStorage.removeItem(preferenceKey(userId));
  } catch {
    // Nothing to clean up.
  }
}

export async function setShellEnabled(
  userId: string,
  enabled: boolean
): Promise<Preference> {
  const next: Preference = { ...readShellPreference(userId), enabled, lastWarmedAt: null };
  writeShellPreference(userId, next);
  return next;
}