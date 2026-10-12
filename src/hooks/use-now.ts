"use client";

import * as React from "react";

/**
 * The current time, as a store.
 *
 * `Date.now()` is an impure function, so reading it during render is a lint error
 * and, more importantly, a correctness hazard: two renders of the same component
 * can disagree about the answer, which is exactly how a lock screen ends up
 * disagreeing with itself about whether the lock is still on.
 *
 * Routing the clock through `useSyncExternalStore` puts it in the same category
 * as `sessionStorage` — external state that changes on its own and that React
 * should be told about — so the read during render is a plain snapshot lookup.
 *
 * The ticking interval is only started while someone is actually looking at a
 * countdown. A permanently mounted one-second timer on the app lock screen would
 * wake the browser sixty times a minute for a timestamp nobody is reading.
 *
 * Every caller gets its own interval, which is the point of taking the interval
 * as an argument: a countdown to the second and a "still valid?" check that only
 * needs to be right within a second do not need the same resolution.
 */
export function useNow(intervalMs: number): number {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const timer = window.setInterval(onChange, intervalMs);
      return () => window.clearInterval(timer);
    },
    [intervalMs]
  );

  // `Date.now` on the server would be a second impure read, but the server and
  // the first client render must agree or React discards the hydration. Zero is
  // a value no comparison depends on, because every use of it is relative to a
  // token the server never has.
  return React.useSyncExternalStore(subscribe, () => Date.now(), () => 0);
}