"use client";

import * as React from "react";
import { AppLockScreen } from "@/components/security/app-lock-screen";
import { MpinEnrolScreen } from "@/components/security/mpin-enrol-screen";
import { clearUnlockGrant } from "@/lib/auth/unlock-grant.client";

const UNLOCK_EVENT = "ownspece:unlock-changed";

/**
 * The moment this browser was last unlocked, or null.
 *
 * `useSyncExternalStore` rather than state set from an effect. Two reasons, and
 * both matter:
 *
 *  - **Hydration.** `sessionStorage` does not exist on the server, so the server
 *    snapshot has to be a fixed "locked" answer. An effect reading storage after
 *    mount would set state immediately and re-render — the cascading render this
 *    avoids, and on a lock screen a wasted render is a wasted frame of the
 *    user's own data.
 *  - **Re-lock.** The token is external state that changes on its own when the
 *    duration expires. An effect watching a clock is the shape that always ends
 *    up re-registering its own timer; a store that reads on every subscription
 *    and is told when to re-read does not.
 *
 * `sessionStorage` and not `localStorage` on purpose: an unlock that outlives the
 * tab would leave a shared machine unlocked for whoever opens it next.
 *
 * The token is keyed by account, so an unlock left over from one account can
 * never open another's workspace in the same tab.
 */
function unlockKey(userId: string): string {
  return `ownspece:unlock-at:${userId}`;
}

function subscribeToUnlock(onChange: () => void) {
  window.addEventListener(UNLOCK_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(UNLOCK_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The stored unlock, exactly as it is.
 *
 * No expiry test here, and that is the whole point of this function. A
 * snapshot has to be **stable**: React compares the value it is given with the
 * one from the last render, and re-renders whenever they differ. A snapshot
 * that folded the clock into its answer would change between two reads a
 * microsecond apart, and React would re-render forever.
 *
 * So the store holds the timestamp and nothing else. Whether it has *run out*
 * is a comparison, and comparisons belong in the render body — see `expired`
 * below.
 */
function readUnlockAt(userId: string): number | null {
  const raw = window.sessionStorage.getItem(unlockKey(userId));
  const at = raw ? Number(raw) : NaN;
  return Number.isFinite(at) ? at : null;
}

/** The server has no session storage, so it always sees a locked app. */
function serverSnapshot(): null {
  return null;
}

function writeUnlockAt(userId: string, at: number | null): void {
  if (at === null) window.sessionStorage.removeItem(unlockKey(userId));
  else window.sessionStorage.setItem(unlockKey(userId), String(at));
  // The store has to be told. Nothing else would: this is the app's own state,
  // not a browser event.
  window.dispatchEvent(new Event(UNLOCK_EVENT));
}

/**
 * Wraps the app in the lock screen when it is on and this browser is not
 * currently unlocked.
 *
 * Deciding *not* to render the app at all is the whole design. A lock drawn on
 * top of a mounted app leaves every task title, every balance and every note in
 * the DOM behind an overlay — readable with devtools, readable by anything
 * already injected into the page, and readable by a screen reader that walks the
 * page regardless of what is visually on top. So while locked, the app's children
 * are simply not rendered.
 *
 * Mounted once, in the app layout, so a reminder can never surface a title from
 * behind a lock the user never opened.
 */
export function AppLockGate({
  enabled,
  setupRequired,
  userId,
  durationMs,
  signedInGrant,
  children,
}: {
  enabled: boolean;
  /** The account has never chosen an MPIN — show the one-time setup instead. */
  setupRequired: boolean;
  /** Scopes the device-local MPIN copy to this account. */
  userId: string;
  /** How long an unlock lasts before the lock screen comes back. */
  durationMs: number;
  /**
   * True when this session has just proved the MPIN by signing in.
   *
   * Read on the server so the first paint is already right: the workspace
   * opens without asking for the MPIN a second time, and — because the ticket
   * is consumed here — it locks again the moment the app is closed.
   */
  signedInGrant: boolean;
  children: React.ReactNode;
}) {
  const unlockedAt = React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => subscribeToUnlock(onChange),
      []
    ),
    React.useCallback(
      () => readUnlockAt(userId),
      [userId]
    ),
    serverSnapshot
  );

  /**
   * Whether the app is open.
   *
   * No clock here on purpose. Whether the stored unlock has *run out* needs
   * the current time, and `Date.now()` during a render is an impure read —
   * two renders a millisecond apart would disagree about it. The expiry is
   * settled by the effect below, which owns the timer and removes the token
   * the moment it is spent; React batches that with the store's own update,
   * so a lock that has run out never paints the app on the way to locking.
   */
  const unlocked = unlockedAt !== null || (enabled && signedInGrant);

  /**
   * The sign-in ticket is spent here.
   *
   * The unlock token takes over — it is what keeps the app open while it is in
   * use — and the ticket is deleted, so that closing the app locks it even
   * though the sign-in was a moment ago.
   */
  React.useEffect(() => {
    if (!signedInGrant) return;

    if (unlockedAt === null) writeUnlockAt(userId, Date.now());
    clearUnlockGrant();
  }, [signedInGrant, unlockedAt, userId]);

  /**
   * Re-locks when the app is closed or sent to the background, and on the
   * timer for the durations that name one.
   *
   * The background case is the whole promise of the lock: **when the app is
   * closed, the MPIN is asked for again**. A setting that let the app stay
   * open after it had been put away made the lock decorative — a phone in a
   * pocket with the app still running is a phone anybody can pick up and read.
   *
   * "Closed" has to be told apart from "navigated", and the two look the same
   * from the page's side: a full page load hides the old document exactly like
   * switching apps does. The difference is that a navigation is followed by
   * `pagehide` — the document is on its way out — while a backgrounded app
   * stays alive and quiet.
   *
   * So the token is dropped a moment *after* the app goes to the background,
   * and `pagehide` cancels that. A link that reloads the page keeps the
   * unlock; an app that is put away loses it.
   */
  React.useEffect(() => {
    if (!enabled || !unlocked) return;

    /**
     * How long the app may stay in the background before the lock comes back.
     *
     * Long enough for a `pagehide` to arrive — it comes within milliseconds —
     * and short enough that putting the phone down is enough to lock it.
     */
    const HIDDEN_GRACE_MS = 1000;

    let hiddenTimer: number | undefined;

    function clearHiddenTimer() {
      if (hiddenTimer === undefined) return;
      window.clearTimeout(hiddenTimer);
      hiddenTimer = undefined;
    }

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        clearHiddenTimer();
        hiddenTimer = window.setTimeout(() => {
          hiddenTimer = undefined;
          // Still hidden, so the app really was put away rather than
          // navigated: this is the moment the lock comes back.
          if (document.visibilityState === "hidden") writeUnlockAt(userId, null);
        }, HIDDEN_GRACE_MS);
        return;
      }

      // Back in the foreground before the grace ran out: the app was glanced
      // at, not closed.
      clearHiddenTimer();
    }

    /**
     * The document is on its way out.
     *
     * A navigation and a closed tab look the same from here, and that is
     * fine: the unlock token lives in `sessionStorage`, which belongs to the
     * *tab*. A navigation keeps the tab — and the token — and a closed tab
     * takes both. So the only thing to do here is cancel the background
     * timer, which was about to lock an app that is merely being navigated.
     */
    function onPageHide() {
      clearHiddenTimer();
    }

    function onPageShow(event: PageTransitionEvent) {
      // A page restored from the back/forward cache is a page that was
      // backgrounded: the browser kept it, and it must not come back open.
      if (event.persisted) writeUnlockAt(userId, null);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);

    let timer: number | undefined;
    if (durationMs !== Number.POSITIVE_INFINITY) {
      // "When the app is closed" never expires on a timer: there is no timer
      // for it, because the lock comes from the app disappearing.
      const remaining = durationMs - (Date.now() - (unlockedAt ?? Date.now()));
      if (remaining <= 0) {
        // An unlock that ran out while the app was shut. Removing the token
        // here — rather than during a render — is what keeps the comparison
        // against the clock out of the render body.
        writeUnlockAt(userId, null);
      } else {
        timer = window.setTimeout(() => writeUnlockAt(userId, null), remaining);
      }
    }

    // The cleanup is returned whatever happened above. An early `return` in the
    // middle of the body would leave the listeners registered — and this
    // effect re-runs every time the unlock token changes, so the listeners
    // would pile up one pair per render.
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      clearHiddenTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled, unlocked, unlockedAt, durationMs, userId]);

  /**
   * An unlock that has run out is dropped rather than left to be re-read on
   * every render.
   *
   * The timer above removes the token the moment it is spent, so this only
   * has one job left: making sure a token that is already spent when the app
   * is opened does not sit in storage. A *valid* token is the app's own
   * record that it is open, and removing it here would lock the app on every
   * full page load.
   */
  React.useEffect(() => {
    if (unlockedAt === null) return;
    if (!enabled) return;
    if (durationMs === Number.POSITIVE_INFINITY) return;
    if (Date.now() - unlockedAt < durationMs) return;

    writeUnlockAt(userId, null);
  }, [unlockedAt, enabled, durationMs, userId]);

  // The one-time setup comes first, and it is not a lock: there is no PIN yet to
  // be asked for. Until it is done the app stays unmounted, which also means a
  // user who abandoned setup half-way does not walk into an unlocked workspace.
  if (setupRequired && !unlocked) {
    return (
      <MpinEnrolScreen
        userId={userId}
        onDone={() => writeUnlockAt(userId, Date.now())}
        onSkip={() => writeUnlockAt(userId, Date.now())}
      />
    );
  }

  if (enabled && !unlocked) {
    return (
      <AppLockScreen userId={userId} onUnlocked={() => writeUnlockAt(userId, Date.now())} />
    );
  }

  return <>{children}</>;
}
