/**
 * VAPID identity and base64url helpers.
 *
 * Web push is authenticated by a per-application key pair (RFC 8292). Without it
 * a browser's push service will reject every message, so this is the single
 * place that knows how to read the keys and how to hand the browser the
 * `applicationServerKey` it needs to subscribe.
 *
 * Everything degrades quietly when the keys are absent: the notifications page
 * still works as an in-app inbox, it just cannot deliver a real push, and the
 * UI says so rather than showing a toggle that silently does nothing.
 *
 * Deliberately not marked `server-only`: it only reads `process.env` and returns
 * public material, and the encoding helpers at the bottom are unit tested, which
 * a `server-only` module cannot be imported from. The private key is never
 * returned by any function here — `send.ts` reads it directly and is marked
 * `server-only`.
 */

export type VapidKeys = {
  publicKey: string;
  privateKey: string;
};

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

/** The configured key pair, or null when push is not set up. */
export function readVapidKeys(): VapidKeys | null {
  const publicKey = env("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

export function isPushConfigured(): boolean {
  return readVapidKeys() !== null;
}

/**
 * The contact a push service uses to reach the application author when a
 * subscription expires. Shown by browsers in their own UI, so it should be a
 * real mailbox rather than a placeholder.
 */
export function pushContact(): string {
  return env("VAPID_SUBJECT") ?? "mailto:support@ownspece.app";
}

/**
 * Decodes a base64url VAPID public key into the uncompressed P-256 point the
 * browser's `pushManager.subscribe()` expects.
 *
 * The key is 65 bytes: a 0x04 uncompressed-point prefix followed by X and Y.
 * Chromium throws if that prefix is wrong, which is otherwise an opaque
 * "subscribe failed" with no useful cause.
 */
export function vapidApplicationServerKey(): Uint8Array | null {
  const keys = readVapidKeys();
  if (!keys) return null;

  const raw = base64UrlToBytes(keys.publicKey);
  if (raw.length !== 65 || raw[0] !== 0x04) return null;
  return raw;
}

/** base64url -> bytes, without assuming Node's Buffer. */
export function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("binary");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** bytes -> base64url, unpadded, which is what every push header expects. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 =
    typeof btoa === "function"
      ? btoa(binary)
      : Buffer.from(binary, "binary").toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}