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
 * The moment this browser was last unlocked, or null if it is locked.
 *
 * The expiry test lives *here*, inside the snapshot, rather than in the render
 * body. A snapshot is a read of external state; comparing the stored timestamp
 * against the clock is part of that read. Doing it in render instead would mean
 * calling `Date.now()` during a render, which is both an impure read and a way to
 * get two renders of the same locked app disagreeing about whether it is locked.
 *
 * `locked` is passed in because an unlock that came from *skipping* the setup —
 * or from an account whose lock is off — must not quietly expire five minutes
 * later and throw somebody back onto a screen they already dismissed. Only a real
 * lock has a duration to run out.
 */
function readUnlockAt(durationMs: number, locked: boolean, userId: string): number | null {
  const raw = window.sessionStorage.getItem(unlockKey(userId));
  const at = raw ? Number(raw) : NaN;
  if (!Number.isFinite(at)) return null;

  // "When the app is closed" never expires on a timer: there is no timer for
  // it, because the lock comes from the app disappearing.
  if (locked && durationMs !== Number.POSITIVE_INFINITY && Date.now() - at >= durationMs) {
    return null;
  }

  return at;
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
      () => readUnlockAt(durationMs, enabled, userId),
      [durationMs, enabled, userId]
    ),
    serverSnapshot
  );

  // Pure: the snapshot already refused to return an expired timestamp.
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
   * The background case is unconditional, and it is the whole promise of the
   * lock: **when the app is closed, the MPIN is asked for again**. A setting
   * that let the app stay open after it had been put away made the lock
   * decorative — a phone in a pocket with the app still running is a phone
   * anybody can pick up and read.
   */
  React.useEffect(() => {
    if (!enabled || !unlocked) return;

    function onHidden() {
      if (document.visibilityState === "hidden") writeUnlockAt(userId, null);
    }
    document.addEventListener("visibilitychange", onHidden);

    // A page restored from the back/forward cache is a page that was
    // backgrounded: the browser kept it, and it must not come back open.
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) writeUnlockAt(userId, null);
    }
    window.addEventListener("pageshow", onPageShow);

    let timer: number | undefined;
    if (durationMs !== Number.POSITIVE_INFINITY) {
      const remaining = durationMs - (Date.now() - (unlockedAt ?? Date.now()));
      if (remaining <= 0) {
        writeUnlockAt(userId, null);
        return;
      }
      timer = window.setTimeout(() => writeUnlockAt(userId, null), remaining);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [enabled, unlocked, unlockedAt, durationMs, userId]);

  // A token the snapshot rejected is dropped rather than left to be re-read on
  // every render. This is a write to an external system, not state, so it does
  // not cause a re-render by itself — but it only fires when there is genuinely
  // something to clear, so a session that was never unlocked stays quiet instead
  // of dispatching an event on every navigation.
  React.useEffect(() => {
    if (unlocked) return;
    if (window.sessionStorage.getItem(unlockKey(userId)) === null) return;
    writeUnlockAt(userId, null);
  }, [unlocked, userId]);

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
