import * as React from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/**
 * True when the page is running as an installed app rather than a browser tab.
 *
 * Three checks because no single one is reliable: `display-mode` covers modern
 * Chromium and iOS standalone, while `navigator.standalone` is Safari's own
 * (now deprecated but still the only signal on older iOS) flag.
 */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  if (window.matchMedia?.("(display-mode: minimal-ui)").matches) return true;
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/**
 * iOS Safari never fires `beforeinstallprompt`, so an install button built only
 * on that event is permanently invisible on iPhones — the exact platform where
 * "Add to Home Screen" matters most. These flags let the UI show the manual
 * instructions instead of nothing.
 */
function detectIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as a Mac; the touch-point count is what separates it.
  const iPadOS = /Macintosh/.test(ua) && (window.navigator.maxTouchPoints ?? 0) > 1;
  return iOS || iPadOS;
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Chrome only surfaces the prompt if the page didn't prevent it.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot() {
  return !installed && !isStandalone() && deferredPrompt !== null;
}

function getServerSnapshot() {
  return false;
}

function getInstalledSnapshot() {
  return installed || isStandalone();
}

function getIosSnapshot() {
  return detectIos();
}

/**
 * PWA installation.
 *
 * `canInstall` only turns true once the browser has actually offered a prompt,
 * so the install button never appears somewhere it would do nothing. `needsIosHelp`
 * covers the platform that has no prompt at all.
 */
export function usePwaInstall(): {
  canInstall: boolean;
  isInstalled: boolean;
  needsIosHelp: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
} {
  const canInstall = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const isInstalled = React.useSyncExternalStore(
    subscribe,
    getInstalledSnapshot,
    () => false
  );
  const needsIosHelp = React.useSyncExternalStore(
    subscribe,
    getIosSnapshot,
    () => false
  );

  const promptInstall = React.useCallback(async () => {
    const event = deferredPrompt;
    if (!event) return "unavailable" as const;

    // The browser event is single-use: clear it before prompting so a second
    // click cannot fire a prompt the browser has already consumed.
    deferredPrompt = null;
    emit();

    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === "accepted") {
        installed = true;
        emit();
      }
      return choice.outcome;
    } catch {
      return "dismissed" as const;
    }
  }, []);

  return { canInstall, isInstalled, needsIosHelp, promptInstall };
}