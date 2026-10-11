"use client";

import * as React from "react";
import {
  localDateIso,
  msUntilRollover,
  ROLLOVER_GRACE_MS,
} from "@/lib/daily-logic";

/**
 * Live journal day.
 *
 * The daily page has to roll over on its own: a page left open at 23:58 would
 * otherwise keep showing yesterday until it was reloaded by hand, and the next
 * morning's note would be written against the wrong date.
 *
 * Three signals, because no single one is reliable:
 *
 *  1. A timer aimed at the next local midnight (+ one minute of grace).
 *  2. `focus` / `visibilitychange`. A backgrounded tab has its timers throttled
 *     or suspended entirely, so a laptop closed overnight would otherwise miss
 *     the rollover entirely and wake up stale.
 *  3. A long interval as a backstop for a tab that was visible the whole time
 *     but whose timer was throttled.
 *
 * The day itself is read through `useSyncExternalStore` rather than mirrored
 * into state, so the first client paint agrees with the server render and
 * cannot hydrate-mismatch — the server's value is the snapshot until the
 * browser takes over.
 */

type DayStore = {
  today: string;
  /** Increments every time the local date changes. */
  bump: number;
  /** Milliseconds until the next journal day, for the countdown chip. */
  msUntilNext: number;
};

// One store per page, shared by every subscriber on it.
let current: DayStore = {
  today: localDateIso(),
  bump: 0,
  msUntilNext: msUntilRollover(),
};
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let interval: ReturnType<typeof setInterval> | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function getSnapshot(): DayStore {
  return current;
}

/**
 * What the server rendered.
 *
 * The server has no idea what time zone the viewer is in, so it sends whatever
 * it computed; the client reconciles on the first tick after hydration rather
 * than guessing on the first paint and risking a mismatch.
 */
function getServerSnapshot(serverToday: string): DayStore {
  return { today: serverToday, bump: 0, msUntilNext: 0 };
}

/**
 * Recomputes the day and the countdown, and notifies subscribers.
 *
 * The countdown is part of the same store rather than separate state so there
 * is exactly one timer on this page: no effect, no cascading render, and the
 * day and its countdown can never disagree with each other.
 */
function tick() {
  const actual = localDateIso();
  const rolled = actual !== current.today;
  current = {
    today: actual,
    bump: rolled ? current.bump + 1 : current.bump,
    msUntilNext: msUntilRollover(),
  };
  emit();
}

function schedule() {
  if (timer) clearTimeout(timer);
  const ms = msUntilRollover();
  // setTimeout saturates above ~24.8 days and fires immediately below 1 ms, so
  // both ends are clamped into a range it actually handles.
  timer = setTimeout(tick, Math.min(Math.max(ms, 250), 2_147_483_000));
}

function start() {
  if (timer || interval) return;
  tick();
  schedule();
  // 60s cadence: cheap, keeps the countdown honest, and catches a rollover a
  // clamped or throttled timer managed to skip.
  interval = setInterval(tick, 60_000);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", onVisibility);
}

function onVisibility() {
  if (document.visibilityState === "visible") {
    tick();
    schedule();
  }
}

function stop() {
  if (timer) clearTimeout(timer);
  if (interval) clearInterval(interval);
  timer = null;
  interval = null;
  window.removeEventListener("focus", tick);
  document.removeEventListener("visibilitychange", onVisibility);
}

/**
 * `serverToday` is what the route computed. It seeds the server snapshot and,
 * once the browser takes over, `today` is the viewer's own local date.
 */
export function useDayRollover(serverToday: string): {
  /** The viewer's current local date, YYYY-MM-DD. */
  today: string;
  /** Increments on every observed day change — the effect signal to reload on. */
  rolloverCount: number;
  /** Milliseconds until the next journal day, for the countdown chip. */
  msUntilNext: number;
  /** False until the browser has taken over from the server's date. */
  synced: boolean;
} {
  const subscribe = React.useCallback((listener: () => void) => {
    listeners.add(listener);
    if (listeners.size === 1) start();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) stop();
    };
  }, []);

  const serverSnapshot = React.useCallback(
    () => getServerSnapshot(serverToday),
    [serverToday]
  );

  const store = React.useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);

  return {
    today: store.today,
    rolloverCount: store.bump,
    msUntilNext: store.msUntilNext,
    synced: store.today === localDateIso(),
  };
}

export { ROLLOVER_GRACE_MS };

/**
 * Tests and the offline cache both need a way to put the shared store back to
 * a known day without a real midnight passing.
 */
export function __setDayForTesting(today: string): void {
  current = { today, bump: current.bump, msUntilNext: msUntilRollover() };
  emit();
}