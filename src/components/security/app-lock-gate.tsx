"use client";

import * as React from "react";
import { AppLockScreen } from "@/components/security/app-lock-screen";
import { MpinEnrolScreen } from "@/components/security/mpin-enrol-screen";

const UNLOCK_TOKEN_KEY = "ownspece:unlock-at";
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
 */
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
function readUnlockAt(durationMs: number, locked: boolean): number | null {
  const raw = window.sessionStorage.getItem(UNLOCK_TOKEN_KEY);
  const at = raw ? Number(raw) : NaN;
  if (!Number.isFinite(at)) return null;

  // "Until I sign out" never expires on a timer.
  if (locked && durationMs !== Number.POSITIVE_INFINITY && Date.now() - at >= durationMs) {
    return null;
  }

  return at;
}

/** The server has no session storage, so it always sees a locked app. */
function serverSnapshot(): null {
  return null;
}

function writeUnlockAt(at: number | null): void {
  if (at === null) window.sessionStorage.removeItem(UNLOCK_TOKEN_KEY);
  else window.sessionStorage.setItem(UNLOCK_TOKEN_KEY, String(at));
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
  biometricAvailable,
  onUseBiometric,
  durationMs,
  children,
}: {
  enabled: boolean;
  /** The account has never chosen an MPIN — show the one-time setup instead. */
  setupRequired: boolean;
  biometricAvailable: boolean;
  onUseBiometric: () => Promise<boolean>;
  /** How long an unlock lasts before the lock screen comes back. */
  durationMs: number;
  children: React.ReactNode;
}) {
  const unlockedAt = React.useSyncExternalStore(
    React.useCallback(
      (onChange: () => void) => subscribeToUnlock(onChange),
      []
    ),
    React.useCallback(() => readUnlockAt(durationMs, enabled), [durationMs, enabled]),
    serverSnapshot
  );

  // Pure: the snapshot already refused to return an expired timestamp.
  const unlocked = unlockedAt !== null;

  // Re-locks on the expiry timer, and on the page being backgrounded — the moment
  // a lock is most wanted. "Until I sign out" is the one duration where that
  // must not apply: someone who chose it does not want to retype a PIN every
  // time they alt-tab to check something.
  React.useEffect(() => {
    if (!enabled || !unlocked || durationMs === Number.POSITIVE_INFINITY) return;

    const remaining = durationMs - (Date.now() - (unlockedAt ?? 0));
    if (remaining <= 0) {
      writeUnlockAt(null);
      return;
    }

    const timer = window.setTimeout(() => writeUnlockAt(null), remaining);

    function onHidden() {
      if (document.visibilityState === "hidden") writeUnlockAt(null);
    }
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, [enabled, unlocked, unlockedAt, durationMs]);

  // A token the snapshot rejected is dropped rather than left to be re-read on
  // every render. This is a write to an external system, not state, so it does
  // not cause a re-render by itself — but it only fires when there is genuinely
  // something to clear, so a session that was never unlocked stays quiet instead
  // of dispatching an event on every navigation.
  React.useEffect(() => {
    if (unlocked) return;
    if (window.sessionStorage.getItem(UNLOCK_TOKEN_KEY) === null) return;
    writeUnlockAt(null);
  }, [unlocked]);

  // The one-time setup comes first, and it is not a lock: there is no PIN yet to
  // be asked for. Until it is done the app stays unmounted, which also means a
  // user who abandoned setup half-way does not walk into an unlocked workspace.
  if (setupRequired && !unlocked) {
    return (
      <MpinEnrolScreen
        onDone={() => writeUnlockAt(Date.now())}
        onSkip={() => writeUnlockAt(Date.now())}
      />
    );
  }

  if (enabled && !unlocked) {
    return (
      <AppLockScreen
        biometricAvailable={biometricAvailable}
        onUseBiometric={onUseBiometric}
        onUnlocked={() => writeUnlockAt(Date.now())}
      />
    );
  }

  return <>{children}</>;
}
