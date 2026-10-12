import "server-only";

import { createPrivateKey, sign } from "node:crypto";
import { bytesToBase64Url } from "@/lib/push/vapid";
import { encryptPushPayload } from "@/lib/push/encrypt";
import { pushContact, readVapidKeys } from "@/lib/push/vapid";

/**
 * Web push transport — VAPID (RFC 8292) and delivery.
 *
 * Payload encryption lives in `encrypt.ts`, which is unit tested against an
 * independently written receiver. This file only handles the two things that
 * genuinely need the server: signing the request, and talking to the push
 * service.
 *
 * Everything is best-effort by design. A push that cannot be delivered is
 * dropped, never thrown — a failed notification must never fail the action that
 * produced it.
 */

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushPayload = {
  title: string;
  body?: string | null;
  /** Groups and replaces: one notification per id, not one per message. */
  tag?: string;
  url?: string;
  /** Notification type, so the client knows which action to offer. */
  type?: string;
  /** The underlying row id, needed to act on the notification. */
  entityId?: string;
  actions?: Array<{ action: string; title: string }>;
  renotify?: boolean;
};

export type SendResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "gone" | "failed"; status?: number };

/** Push services signal a dead subscription with 404 or 410. */
function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

function b64url(input: Buffer | Uint8Array | string): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  return bytesToBase64Url(bytes);
}

/**
 * Signs the JWT that authenticates a push.
 *
 * The audience is the push service's *origin*, not the endpoint host — that
 * detail is the usual reason a correctly-keyed push comes back 401.
 */
function vapidToken(audience: string, subject: string, keys: { publicKey: string; privateKey: string }): string {
  const header = b64url(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64url(
    JSON.stringify({
      aud: audience,
      // Long enough to cover a queue that retries, short enough that a leaked
      // token stops being useful.
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    })
  );

  const signingInput = `${header}.${claims}`;
  const signature = sign(
    "sha256",
    Buffer.from(signingInput),
    createPrivateKey({
      key: Buffer.from(keys.privateKey, "base64url"),
      format: "der",
      type: "pkcs8",
    })
  );

  // Node signs raw r||s, which is exactly what JWS wants — no conversion.
  return `${signingInput}.${b64url(signature)}`;
}

function endpointOrigin(endpoint: string): string {
  try {
    return new URL(endpoint).origin;
  } catch {
    return "";
  }
}

/**
 * Delivers one notification to one device.
 *
 * Returns `{ reason: "gone" }` when the push service says the subscription is
 * dead, which is the caller's signal to delete the row — a browser that revoked
 * permission or was uninstalled never recovers.
 */
export async function sendPush(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<SendResult> {
  const keys = readVapidKeys();
  if (!keys) return { ok: false, reason: "not-configured" };

  const audience = endpointOrigin(subscription.endpoint);
  if (!audience) return { ok: false, reason: "failed" };

  let body: Uint8Array;
  try {
    body = encryptPushPayload(
      JSON.stringify(payload),
      subscription.p256dh,
      subscription.auth
    ).body;
  } catch {
    // A malformed subscription cannot be fixed by retrying.
    return { ok: false, reason: "failed" };
  }

  try {
    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        // A day is the longest a push service should hold a message for a
        // personal productivity app; anything staler is noise by then.
        TTL: "86400",
        Urgency: "high",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.length),
        Authorization: `vapid t=${vapidToken(audience, pushContact(), keys)}, k=${keys.publicKey}`,
      },
      body: body as unknown as BodyInit,
    });

    if (response.ok) return { ok: true };
    if (isGone(response.status)) return { ok: false, reason: "gone", status: response.status };
    return { ok: false, reason: "failed", status: response.status };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

/**
 * Fans a notification out to every device a user has subscribed.
 *
 * Returns how many devices accepted it and which subscription ids are dead, so
 * the caller can prune them in one place. Individual failures never abort the
 * fan-out — one revoked browser must not stop the others being notified.
 */
export async function sendPushToUser(
  subscriptions: PushSubscriptionRecord[],
  payload: PushPayload
): Promise<{ delivered: number; dead: string[] }> {
  const keys = readVapidKeys();
  if (!keys || subscriptions.length === 0) return { delivered: 0, dead: [] };

  const results = await Promise.all(
    subscriptions.map(async (subscription) => ({
      id: subscription.id,
      result: await sendPush(subscription, payload),
    }))
  );

  return {
    delivered: results.filter((entry) => entry.result.ok).length,
    dead: results
      .filter((entry) => !entry.result.ok && entry.result.reason === "gone")
      .map((entry) => entry.id),
  };
}

/** The public key a browser needs — used by the settings UI to confirm config. */
export function publicVapidKey(): string | null {
  return readVapidKeys()?.publicKey ?? null;
}

/** Verifies the configured keys actually parse, so bad config fails loudly. */
export function validateVapidKeys(): { ok: boolean; error?: string } {
  const keys = readVapidKeys();
  if (!keys) return { ok: false, error: "VAPID keys are not configured." };
  try {
    createPrivateKey({
      key: Buffer.from(keys.privateKey, "base64url"),
      format: "der",
      type: "pkcs8",
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid VAPID keys." };
  }
}