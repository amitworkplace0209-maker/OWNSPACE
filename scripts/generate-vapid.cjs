#!/usr/bin/env node
/**
 * Generates a VAPID key pair for web push.
 *
 * Run once, then paste the output into `.env.local`:
 *
 *     node scripts/generate-vapid.cjs
 *
 * The private key is a signing secret: it never leaves the server, never goes in
 * the database, and must never be committed. Only the public key is exposed to
 * the browser (as `NEXT_PUBLIC_VAPID_PUBLIC_KEY`), because the browser needs it
 * to identify the application when subscribing.
 *
 * Generating a new pair invalidates every existing push subscription — browsers
 * reject pushes signed by an unknown key — so every device has to re-subscribe.
 */

const { generateKeyPairSync } = require("crypto");

function toBase64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function main() {
  // Node emits the raw P-256 point in DER as a BIT STRING; the last 65 bytes
  // are the uncompressed point the spec (and the browser) expects.
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

  const spki = publicKey.export({ format: "der", type: "spki" });
  const uncompressedPoint = spki.subarray(spki.length - 65);
  if (uncompressedPoint[0] !== 0x04) {
    console.error("Could not extract an uncompressed P-256 point from the generated key.");
    process.exit(1);
  }

  const pkcs8 = privateKey.export({ format: "der", type: "pkcs8" });

  console.log("# Add these to .env.local (server-side secrets — never commit)\n");
  console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${toBase64Url(uncompressedPoint)}`);
  console.log(`VAPID_PRIVATE_KEY=${toBase64Url(pkcs8)}`);
  console.log("VAPID_SUBJECT=mailto:you@example.com\n");
  console.log("# Changing the key pair invalidates every existing push subscription,");
  console.log("# so each device has to be re-subscribed. Only re-generate deliberately.");
}

main();