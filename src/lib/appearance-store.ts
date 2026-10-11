"use client";

import * as React from "react";
import {
  DEFAULT_APPEARANCE,
  applyAppearanceToDocument,
  readStoredAppearance,
  resolveAppearance,
  sanitizeAppearance,
  writeStoredAppearance,
  type Appearance,
} from "@/lib/appearance";

/**
 * Single owner of the appearance state on the client.
 *
 * Before this existed, `AppearanceManager` and `AppearanceSettings` each had
 * their own copy of "write these four data attributes to `<html>`", so the
 * settings panel could repaint the DOM and the manager could immediately repaint
 * it back. One store, one writer, and every change is persisted at the same
 * time so the pre-paint script has something to read on the next load.
 */

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Seeded from storage on first read so a client-side navigation into the app —
// which never runs the inline script again — still starts from the right
// appearance instead of the server-rendered default.
let current: Appearance | null = null;

function getSnapshot(): Appearance {
  current ??= readStoredAppearance() ?? DEFAULT_APPEARANCE;
  return current;
}

function getServerSnapshot(): Appearance {
  return DEFAULT_APPEARANCE;
}

function commit(next: Appearance, savedAt = Date.now()) {
  current = next;
  applyAppearanceToDocument(next);
  writeStoredAppearance(next, savedAt);
  emit();
  return next;
}

/**
 * Apply a partial appearance change immediately: DOM now, localStorage now,
 * account later (the caller owns the server write).
 */
export function updateAppearance(patch: Partial<Appearance>): Appearance {
  return commit(sanitizeAppearance({ ...getSnapshot(), ...patch }));
}

/**
 * Reconcile the account's preferences into the store. Called by
 * `AppearanceManager` once the server preferences are known.
 *
 * The local copy wins when it is newer, so a change made on another device is
 * picked up on the next load without undoing a change made here a moment ago.
 *
 * The stored timestamp is re-stamped with the *winning* source's clock. Keeping
 * the loser's timestamp would make the same comparison resolve the same way on
 * every future sync, so a later local change could never take back control.
 */
export function syncAppearanceFromAccount(
  account: Appearance,
  accountUpdatedAt?: string | null
): { appearance: Appearance; source: "local" | "account" } {
  const stored = readStoredAppearance();
  const resolved = resolveAppearance(stored, account, accountUpdatedAt);

  const accountTime = accountUpdatedAt ? Date.parse(accountUpdatedAt) : Number.NaN;
  const savedAt =
    resolved.source === "account"
      ? Number.isFinite(accountTime)
        ? accountTime
        : Date.now()
      : (stored?.savedAt ?? Date.now());

  commit(resolved.appearance, savedAt);
  return { appearance: resolved.appearance, source: resolved.source };
}

export function useAppearance(): {
  appearance: Appearance;
  updateAppearance: (patch: Partial<Appearance>) => Appearance;
} {
  const appearance = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { appearance, updateAppearance };
}