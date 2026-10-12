import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/update-session";

const publicRoutes = [
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/auth/confirm",
  "/auth/gdrive",
  // Served by the service worker when the network is gone. It carries no user
  // data, so it must render for a signed-out visitor too — otherwise the
  // offline fallback bounces an authenticated user to the login screen.
  "/offline",
];

const publicAssets = [
  "/manifest.webmanifest",
  "/sw.js",
  "/offline",
  "/icon.svg",
  "/icon-192x192.png",
  "/icon-512x512.png",
  // The VAPID *public* key, which the browser needs in order to subscribe. It
  // identifies the application and carries no secret — the private half never
  // leaves the server — so it is safe to serve unauthenticated. Exempting it
  // also means a signed-out or expired session gets the route's own JSON error
  // instead of an HTML redirect the caller cannot parse.
  "/api/push/public-key",
];

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);

  const pathname = request.nextUrl.pathname;

  // Static PWA and public assets must never be redirected to login.
  if (publicAssets.includes(pathname)) {
    return supabaseResponse;
  }

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Authenticated users should not see public-only routes.
  if (user && isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // Unauthenticated users are redirected to login, preserving the next path.
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all routes except:
     * - Next.js internals (_next/static, _next/image)
     * - Static files (favicon, icons, images, fonts)
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|icns|ico)$).*)",
  ],
};