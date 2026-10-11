"use client";

import * as React from "react";
import { readActiveUser, readTaskCache } from "@/lib/offline/task-cache.client";
import type { CachedTask } from "@/lib/offline/task-cache";

type BakedState = {
  /** The user id these rows belong to — a snapshot from another account is
   *  never shown, even if the cache somehow handed one back. */
  key: string | null;
  tasks: CachedTask[];
  cachedAt: string | null;
};

/**
 * The baked task snapshot.
 *
 * Reads IndexedDB once per user and hands back the last payload the server
 * sent, so a cold start, a soft navigation, or an offline reload renders real
 * task rows instead of an empty shell.
 *
 * Readiness is derived from `key` rather than a separate boolean, so the hook
 * never needs a synchronous `setState` in an effect body — the rows are simply
 * not reported until a read for *this* user has actually resolved.
 */
export function useBakedTasks(userId: string | null): {
  tasks: CachedTask[];
  cachedAt: string | null;
  /** True while a read is in flight, so the UI can hold a skeleton instead of
   *  flashing an empty state before the rows arrive. */
  reading: boolean;
} {
  const [state, setState] = React.useState<BakedState>({
    key: null,
    tasks: [],
    cachedAt: null,
  });

  React.useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    void readTaskCache(userId).then((snapshot) => {
      if (cancelled) return;
      setState({
        key: userId,
        tasks: snapshot?.tasks ?? [],
        cachedAt: snapshot?.cachedAt ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const ready = Boolean(userId) && state.key === userId;

  return {
    tasks: ready ? state.tasks : [],
    cachedAt: ready ? state.cachedAt : null,
    reading: Boolean(userId) && !ready,
  };
}

/**
 * The baked snapshot for whichever account was last active on this device.
 *
 * This exists for the route shell. `loading.tsx` renders before any server
 * component runs, so it has no user id in props — and offline it is the *only*
 * thing on screen, because the RSC payload behind it is still pending. Reading
 * the last-active namespace is what turns a cold offline launch into your real
 * task list instead of a spinner.
 */
export function useBakedTasksForLastUser(): {
  tasks: CachedTask[];
  cachedAt: string | null;
  reading: boolean;
} {
  const [state, setState] = React.useState<BakedState>({
    key: null,
    tasks: [],
    cachedAt: null,
  });

  React.useEffect(() => {
    const userId = readActiveUser();
    if (!userId) return;

    let cancelled = false;
    void readTaskCache(userId).then((snapshot) => {
      if (cancelled) return;
      setState({
        key: userId,
        tasks: snapshot?.tasks ?? [],
        cachedAt: snapshot?.cachedAt ?? null,
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const ready = state.key !== null;
  return {
    tasks: ready ? state.tasks : [],
    cachedAt: ready ? state.cachedAt : null,
    reading: !ready,
  };
}