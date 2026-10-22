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
 * Why the clock is held rather than read
 * ------------------------------------
 * `useSyncExternalStore` compares the snapshot it is given with the one from
 * the last render, and re-renders when they differ. A snapshot of
 * `() => Date.now()` therefore *always* differs — it changes between two reads
 * a microsecond apart — and React ends up in an endless render loop, throwing
 * "Maximum update depth exceeded" the moment the screen is opened.
 *
 * So the clock holds a value and only changes it when it ticks. Between ticks
 * the snapshot is the same number every time, which is what the primitive
 * needs; the interval is what tells React the number has moved on.
 *
 * The ticking interval is only started while someone is actually looking at a
 * countdown. A permanently mounted one-second timer on the app lock screen would
 * wake the browser sixty times a minute for a timestamp nobody is reading.
 *
 * Every caller gets its own clock and its own interval, which is the point of
 * taking the interval as an argument: a countdown to the second and a "still
 * valid?" check that only needs to be right within a second do not need the
 * same resolution.
 */

/**
 * A clock that only moves when it is told to.
 *
 * One per caller, so two screens with different intervals do not fight over
 * one value.
 */
type Clock = {
  /** The current reading. The same number until the clock ticks. */
  read: () => number;
  /** Moves the clock to now. */
  advance: () => void;
};

function createClock(): Clock {
  let value = 0;

  return {
    read: () => value,
    advance: () => {
      value = Date.now();
    },
  };
}

export function useNow(intervalMs: number): number {
  // `useState` with a lazy initialiser rather than a ref: the clock has to be
  // the *same* object for the life of the component, and a ref read during
  // render is exactly what the React compiler rules forbid. The initialiser
  // runs once and the state is never replaced.
  const [clock] = React.useState(createClock);

  const subscribe = React.useCallback(
    (onChange: () => void) => {
      // Ticked straight away, so the first reading is the real time rather
      // than the placeholder. The notification that follows is what makes
      // React re-read it.
      clock.advance();
      onChange();

      const timer = window.setInterval(() => {
        clock.advance();
        onChange();
      }, intervalMs);

      return () => window.clearInterval(timer);
    },
    [clock, intervalMs]
  );

  // `Date.now` on the server would be a second impure read, but the server and
  // the first client render must agree or React discards the hydration. Zero is
  // a value no comparison depends on, because every use of it is relative to a
  // token the server never has.
  return React.useSyncExternalStore(subscribe, clock.read, () => 0);
}
