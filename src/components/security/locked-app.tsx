"use client";

import * as React from "react";
import { AppLockGate } from "@/components/security/app-lock-gate";

/**
 * Puts the lock in front of the app.
 *
 * A client component because the decision to render the app at all depends on
 * `sessionStorage`, which does not exist on the server. The lock state itself
 * is read on the server and passed in, so the very first paint already knows
 * whether a lock exists.
 *
 * The three ways in are decided by the lock screen itself: the account's MPIN,
 * a device PIN kept on this machine, and the device's own fingerprint. This
 * device's copy of the MPIN is read by the lock screen, so it can unlock with
 * no connection at all.
 */
export function LockedApp({
  lockEnabled,
  setupRequired,
  userId,
  durationMs,
  signedInGrant,
  children,
}: {
  lockEnabled: boolean;
  setupRequired: boolean;
  /** Scopes the device-local MPIN copy to this account. */
  userId: string;
  /** How long an unlock lasts before the lock screen comes back. */
  durationMs: number;
  /** True when this session has just signed in and proved the MPIN. */
  signedInGrant: boolean;
  children: React.ReactNode;
}) {
  return (
    <AppLockGate
      enabled={lockEnabled}
      setupRequired={setupRequired}
      userId={userId}
      durationMs={durationMs}
      signedInGrant={signedInGrant}
    >
      {children}
    </AppLockGate>
  );
}
