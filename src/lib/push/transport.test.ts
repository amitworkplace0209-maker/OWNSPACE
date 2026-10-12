import { describe, expect, it } from "vitest";
import { createECDH } from "node:crypto";

/**
 * Transport checks that need a real VAPID key pair.
 *
 * Skipped automatically when the keys are absent, so `npm test` stays green on a
 * fresh clone — and run for real once `npm run push:keys` has been followed. The
 * pure crypto in `encrypt.ts` is covered unconditionally by
 * `web-push-crypto.test.ts`; this file covers what only a configured deployment
 * can check.
 *
 * These run under vitest rather than a standalone script because vitest already
 * resolves the `@/` path alias and the `server-only` conditions that
 * `send.ts` needs — a hand-rolled runner would need both re-implemented.
 */

// `send.ts` imports `server-only`, which throws unless React's server condition
// is resolved. `readVapidKeys` is a pure env read, so the import is deferred
// until after the skip check below.
function keysPresent(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  );
}

const configured = keysPresent();

describe.skipIf(!configured)("push transport with a configured key pair", () => {
  it("parses the configured key pair", async () => {
    const { validateVapidKeys, publicVapidKey } = await import("@/lib/push/send");

    const validation = validateVapidKeys();
    expect(validation.error ?? "").toBe("");
    expect(validation.ok).toBe(true);
    expect(publicVapidKey()).toBe(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  });

  it("exposes a 65-byte uncompressed public key to the browser", async () => {
    const { vapidApplicationServerKey } = await import("@/lib/push/vapid");

    const key = vapidApplicationServerKey();
    expect(key).not.toBeNull();
    // Chromium rejects a subscription whose key is not exactly this shape.
    expect(key!.length).toBe(65);
    expect(key![0]).toBe(0x04);
  });

  it("fails a delivery to an unreachable endpoint without throwing", async () => {
    const { sendPush } = await import("@/lib/push/send");
    const { bytesToBase64Url } = await import("@/lib/push/vapid");

    const receiver = createECDH("prime256v1");
    receiver.generateKeys();

    const result = await sendPush(
      {
        id: "unreachable",
        // Reserved TEST-NET address: routable-looking, guaranteed unreachable.
        endpoint: "https://push.invalid/subscribe/abc",
        p256dh: bytesToBase64Url(Buffer.from(receiver.getPublicKey())),
        auth: bytesToBase64Url(Buffer.alloc(16, 1)),
      },
      { title: "Test" }
    );

    // A push that cannot be delivered must be reported, never thrown — a
    // failed notification must never fail the action that produced it.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("failed");
  });

  it("reports a malformed subscription rather than throwing", async () => {
    const { sendPush } = await import("@/lib/push/send");

    const result = await sendPush(
      {
        id: "malformed",
        endpoint: "https://push.invalid/x",
        // Not a P-256 point, so the encryption step cannot run.
        p256dh: Buffer.alloc(10).toString("base64url"),
        auth: Buffer.alloc(16).toString("base64url"),
      },
      { title: "Test" }
    );

    expect(result.ok).toBe(false);
  });
});

describe("push transport without a key pair", () => {
  it.skipIf(configured)("reports that push is not configured", async () => {
    const { validateVapidKeys, sendPushToUser } = await import("@/lib/push/send");

    expect(validateVapidKeys().ok).toBe(false);
    // Must be a no-op rather than an error, so an unconfigured deployment
    // still runs every other notification path.
    expect(await sendPushToUser([], { title: "x" })).toEqual({ delivered: 0, dead: [] });
  });
});