"use client";

import { Toaster } from "sonner";
import { useToasterTheme } from "@/components/providers/theme-chrome-sync";

/**
 * Sonner toaster bound to the active theme.
 *
 * Must be rendered inside `<ThemeProvider>` — `useToasterTheme` reads the
 * resolved theme from context, and outside the provider next-themes hands back
 * an inert default that would pin every toast to light.
 *
 * Top-right, not bottom-right
 * --------------------------
 * Sonner's default is the bottom corner, which is where a notification belongs
 * on a desktop and is wrong everywhere else. On a phone it sits on top of the
 * bottom navigation, and — the real reason this moved — it is exactly where a
 * thumb already is, so an error the user never noticed has to survive a
 * second tap to be read.
 *
 * The offset clears the topbar instead of a guessed number: `3.5rem` is the
 * topbar's own height plus its safe-area inset, so the first toast always lands
 * under it rather than behind it, on a notched phone and a laptop alike.
 *
 * On small screens the toaster goes full-width, because a 356-pixel toast
 * pinned to the right edge of a 390-pixel viewport is worse than useless — it
 * wraps mid-word. Sonner sizes its toasts from `--toast-max-width`, so the
 * override is one CSS variable rather than a `window.innerWidth` read that
 * would render one width on the server and another on the phone.
 */
export function ThemedToaster() {
  const theme = useToasterTheme();

  return (
    <Toaster
      position="top-right"
      richColors
      expand
      closeButton
      theme={theme}
      offset="3.5rem"
      className="[--toast-max-width:calc(100vw-1.5rem)] sm:[--toast-max-width:22.25rem]"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg",
        },
      }}
    />
  );
}