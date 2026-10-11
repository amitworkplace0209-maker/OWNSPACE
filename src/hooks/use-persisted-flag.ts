import * as React from "react";

/**
 * A boolean persisted in localStorage, read through `useSyncExternalStore`.
 *
 * Reading storage in a `useState` initializer would return different values on
 * the server and the client, and reading it in an effect is a synchronous
 * `setState` — both produce a hydration mismatch or a wasted render. The store
 * gives the server a fixed snapshot and lets React reconcile afterwards.
 */

const listeners = new Map<string, Set<() => void>>();

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Private mode and blocked storage both land here; treat as "not set".
    return false;
  }
}

export function setPersistedFlag(key: string, value: boolean): void {
  try {
    if (value) {
      window.localStorage.setItem(key, "1");
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do: the flag is a convenience, not a requirement.
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribe(key: string) {
  return (listener: () => void) => {
    const set = listeners.get(key) ?? new Set();
    set.add(listener);
    listeners.set(key, set);
    return () => {
      set.delete(listener);
    };
  };
}

export function usePersistedFlag(
  key: string
): [boolean, (value: boolean) => void] {
  const value = React.useSyncExternalStore(
    subscribe(key),
    () => read(key),
    // Server and first client render must agree, so start from "not set" and
    // let React reconcile against storage once hydration completes.
    () => false
  );

  const setValue = React.useCallback(
    (next: boolean) => setPersistedFlag(key, next),
    [key]
  );

  return [value, setValue];
}