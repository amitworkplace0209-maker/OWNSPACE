import "server-only";

import { headers } from "next/headers";

/**
 * The origin this request came in on.
 *
 * Used for the links Supabase emails out — the confirmation link, the
 * password-reset link, the MPIN-reset link. They have to point back at the
 * host the person is actually using, or the link lands on the wrong
 * deployment.
 *
 * A configured `NEXT_PUBLIC_SITE_URL` wins when there is one, because behind
 * a proxy the forwarded headers can be the proxy's own host. Without it, the
 * forwarded headers are used, and failing that the host the request arrived
 * on. Never a hardcoded domain: an app that is deployed to two hosts would
 * send half its emails to the wrong one.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const headerStore = await headers();
  const proto =
    headerStore.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";

  return `${proto}://${host}`;
}
