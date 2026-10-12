"use client";

import * as React from "react";
import { AppLockGate } from "@/components/security/app-lock-gate";
import { tryWebauthnUnlock, webauthnSupported } from "@/lib/security/webauthn.client";

/**
 * Puts the lock in front of the app.
 *
 * A client component because the decision to render the app at all depends on
 * `sessionStorage`, which does not exist on the server. The lock state itself is
 * read on the server and passed in, so the very first paint already knows whether
 * a lock exists.
 */
export function LockedApp({
  lockEnabled,
  setupRequired,
  biometricEnabled,
  durationMs,
  children,
}: {
  lockEnabled: boolean;
  setupRequired: boolean;
  biometricEnabled: boolean;
  /** How long an unlock lasts before the lock screen returns. */
  durationMs: number;
  children: React.ReactNode;
}) {
  // Whether this browser has an authenticator is a fact about the browser, not
  // about React state, so it is read as an external store rather than copied into
  // state by an effect. Two reasons that matters here: the server snapshot has to
  // be a fixed `false` or hydration fails, and an effect would mean the lock
  // screen paints one frame with no fingerprint button and then adds it — a
  // flicker on the one screen where a flicker is worst.
  const browserSupports = React.useSyncExternalStore(
    subscribeToNothing,
    () => webauthnSupported(),
    () => false
  );

  return (
    <AppLockGate
      enabled={lockEnabled}
      setupRequired={setupRequired}
      biometricAvailable={biometricEnabled && browserSupports}
      onUseBiometric={tryWebauthnUnlock}
      durationMs={durationMs}
    >
      {children}
    </AppLockGate>
  );
}

/**
 * Browser capability does not change while the tab is open — a browser either has
 * `PublicKeyCredential` or it does not, and it cannot grow one mid-session. So
 * there is nothing to subscribe to; React only calls `getSnapshot` once.
 */
function subscribeToNothing() {
  return () => {};
}