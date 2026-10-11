import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { ServiceWorkerRegister } from "@/components/providers/service-worker-register";
import { ThemedToaster } from "@/components/providers/themed-toaster";
import { ThemeChromeSync } from "@/components/providers/theme-chrome-sync";
import { ThemeScript } from "@/components/providers/theme-script";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Ownspece",
    template: "%s | Ownspece",
  },
  description:
    "Personal project operating system for managing software, technical, and personal projects from planning to deployment.",
  applicationName: "Ownspece",
  appleWebApp: {
    capable: true,
    title: "Ownspece",
    // Lets the app draw under the notch so the topbar owns the safe-area inset.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  // Three entries so a manual dark/AMOLED pick is honoured on first paint even
  // before ThemeChromeSync runs; the script then keeps it in sync.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0c11" },
  ],
  width: "device-width",
  initialScale: 1,
  // Deliberately no `maximumScale`. Pinning zoom to 1 breaks pinch-to-zoom and
  // the WCAG 1.4.4 resize requirement on every mobile browser.
  viewportFit: "cover",
};

/**
 * Root layout.
 *
 * Ordering matters here: `ThemeScript` runs in `<head>` before anything paints,
 * and every theme-aware consumer (toaster, chrome sync, appearance manager)
 * sits *inside* `<ThemeProvider>` — outside it `useTheme()` returns an inert
 * default, which is why the toaster used to be stuck on light.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-accent={DEFAULT_APPEARANCE.accent}
      data-card-style={DEFAULT_APPEARANCE.cardStyle}
      data-density={DEFAULT_APPEARANCE.density}
      data-background={DEFAULT_APPEARANCE.background}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          themes={["light", "dark", "amoled"]}
          enableSystem
          disableTransitionOnChange
        >
          <ThemeChromeSync />
          {children}
          <ServiceWorkerRegister />
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}