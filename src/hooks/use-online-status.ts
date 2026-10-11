import * as React from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

/** Assume online during SSR — the server has no network opinion to offer. */
function getServerSnapshot() {
  return true;
}

/**
 * Live browser connectivity.
 *
 * Rendered with `useSyncExternalStore` rather than a `useState` + `useEffect`
 * pair so the first client paint already agrees with the server snapshot and
 * no hydration mismatch is possible.
 */
export function useOnlineStatus(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
