"use client";

import { Toaster } from "sonner";
import { useToasterTheme } from "@/components/providers/theme-chrome-sync";

/**
 * Sonner toaster bound to the active theme.
 *
 * Must be rendered inside `<ThemeProvider>` — `useToasterTheme` reads the
 * resolved theme from context, and outside the provider next-themes hands back
 * an inert default that would pin every toast to light.
 */
export function ThemedToaster() {
  const theme = useToasterTheme();

  return (
    <Toaster
      position="bottom-right"
      richColors
      expand
      closeButton
      theme={theme}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-lg",
        },
      }}
    />
  );
}