import { NextResponse } from "next/server";
import { publicVapidKey, validateVapidKeys } from "@/lib/push/send";

/**
 * The VAPID public key, for the browser to subscribe with.
 *
 * A separate endpoint rather than a build-time constant because the key pair
 * has to be rotatable — baking it into the bundle would make rotating it require
 * a full rebuild and a re-release.
 *
 * Only the *public* half is served. It is the same value the browser already
 * needs in order to identify the application, and it carries no secret: the
 * private key never leaves the server.
 */
export async function GET() {
  const validation = validateVapidKeys();

  if (!validation.ok || !publicVapidKey()) {
    return NextResponse.json(
      { error: validation.error ?? "Push is not configured." },
      { status: 503 }
    );
  }

  // `no-store` is deliberate: a cached "not configured" response from before the
  // keys were added would keep the UI permanently disabled.
  return NextResponse.json(
    { publicKey: publicVapidKey() },
    { headers: { "Cache-Control": "no-store" } }
  );
}