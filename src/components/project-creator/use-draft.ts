"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export interface ProjectDraft {
  step: number;
  data: Record<string, unknown>;
  updatedAt: number;
  version: number;
}

const DRAFT_KEY = "ownspece:project-creator:draft";
const DRAFT_VERSION = 1;

// The draft lives in a module-level store rather than component state: it is an
// external system (localStorage), and reading it through useSyncExternalStore
// lets the server and the first client render agree on "no draft" while React
// reconciles against storage after hydration. Reading it in a mount effect
// instead was a synchronous setState, which the React Compiler lint rules
// correctly flag as a cascading render.
let snapshot: ProjectDraft | null | undefined;
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

function readStorage(): ProjectDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(DRAFT_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as ProjectDraft;
    if (parsed.version !== DRAFT_VERSION) {
      window.localStorage.removeItem(DRAFT_KEY);
      return null;
    }
    return parsed;
  } catch {
    // Corrupted draft: drop it rather than trapping the user in a broken wizard.
    return null;
  }
}

function getSnapshot(): ProjectDraft | null {
  snapshot ??= readStorage();
  return snapshot;
}

function getServerSnapshot(): ProjectDraft | null {
  return null;
}

function writeStorage(next: ProjectDraft | null) {
  snapshot = next;
  try {
    if (next) {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } else {
      window.localStorage.removeItem(DRAFT_KEY);
    }
  } catch (error) {
    console.warn("Failed to persist draft:", error);
  }
  emit();
}

export function useProjectDraft() {
  const draft = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    },
    []
  );

  const saveDraft = useCallback(
    (step: number, data: Record<string, unknown>) => {
      const newDraft: ProjectDraft = {
        step,
        data,
        updatedAt: Date.now(),
        version: DRAFT_VERSION,
      };

      // Debounced so every keystroke in the wizard is not a storage write.
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => writeStorage(newDraft), 500);
    },
    []
  );

  const clearDraft = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    writeStorage(null);
  }, []);

  return {
    draft,
    isLoading: false,
    lastSaved: draft ? new Date(draft.updatedAt) : null,
    hasDraft: draft !== null,
    saveDraft,
    clearDraft,
    getDraftData: useCallback(() => draft?.data ?? {}, [draft]),
    getDraftStep: useCallback(() => draft?.step ?? 1, [draft]),
  };
}

export function useAutoSave<T extends Record<string, unknown>>(
  getData: () => T,
  getStep: () => number,
  enabled = true
) {
  const { saveDraft } = useProjectDraft();
  const lastDataRef = useRef<string>("");

  useEffect(() => {
    if (!enabled) return;

    const data = getData();
    const dataStr = JSON.stringify(data);

    if (dataStr !== lastDataRef.current) {
      lastDataRef.current = dataStr;
      saveDraft(getStep(), data);
    }
  }, [getData, getStep, saveDraft, enabled]);
}