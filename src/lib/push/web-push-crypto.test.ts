import { describe, expect, it } from "vitest";
import { createECDH } from "node:crypto";
import { bytesToBase64Url } from "@/lib/push/vapid";
import { decryptPushPayload, encryptPushPayload } from "@/lib/push/encrypt";

/**
 * Checks the sender against a receiver written from the spec.
 *
 * This matters more than it looks. A web push whose RFC 8291 derivation is
 * wrong is accepted by the push service and then **silently discarded** by the
 * browser — no console error, no failed request, nothing. The only way to know
 * the derivation is right is to run the receiving half and check the plaintext
 * comes back, which is what this does.
 */

/**
 * A real receiver key pair, in the exact shape a browser's subscription has:
 * the public key as a base64url uncompressed point, and the private scalar raw.
 *
 * `createECDH.generateKeys()` is used rather than a generated PKCS#8 envelope,
 * because an ECPrivateKey carries optional trailing fields and its private
 * scalar is therefore not reliably the last 32 bytes of the DER.
 */
function receiverKeyPair() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();

  // `getPublicKey()` already returns the 65-byte uncompressed point, 0x04
  // prefix included — prepending another would produce a 66-byte key that the
  // encryptor correctly rejects.
  return {
    publicKey: bytesToBase64Url(Buffer.from(ecdh.getPublicKey())),
    privateKey: Buffer.from(ecdh.getPrivateKey()),
  };
}

const AUTH_SECRET = bytesToBase64Url(Buffer.alloc(16, 7));

describe("web push payload encryption", () => {
  it("round-trips a payload through the receiver's half of the spec", () => {
    const receiver = receiverKeyPair();
    const plaintext = JSON.stringify({
      title: "Standup",
      body: "in 5 minutes",
      tag: "reminder-abc",
    });

    const { body } = encryptPushPayload(plaintext, receiver.publicKey, AUTH_SECRET);
    const decrypted = decryptPushPayload(body, receiver.privateKey, Buffer.from(AUTH_SECRET, "base64url").subarray(0, 16));

    expect(decrypted).toBe(plaintext);
    expect(JSON.parse(decrypted)).toMatchObject({ title: "Standup", tag: "reminder-abc" });
  });

  it("round-trips an empty body and unicode", () => {
    const receiver = receiverKeyPair();
    const authSecret = Buffer.alloc(16, 3);
    const authB64 = bytesToBase64Url(authSecret);

    for (const plaintext of ["", "Réunion à 9h — 引越 💡", "x".repeat(4000)]) {
      const { body } = encryptPushPayload(plaintext, receiver.publicKey, authB64);
      expect(decryptPushPayload(body, receiver.privateKey, authSecret)).toBe(plaintext);
    }
  });

  it("uses the header layout the push service expects", () => {
    const receiver = receiverKeyPair();

    const { body } = encryptPushPayload("hi", receiver.publicKey, AUTH_SECRET);

    // salt(16) + rs(4) + idlen(1) + keyid(65 public + 16 auth) = 102 bytes.
    expect(body[20]).toBe(81);
    expect(body[21]).toBe(0x04);

    // Record size, big-endian at offset 16.
    const rs = (body[16] << 24) | (body[17] << 16) | (body[18] << 8) | body[19];
    expect(rs).toBe(4096);
  });

  it("never reuses salt or key, so repeated messages are unlinkable", () => {
    const receiver = receiverKeyPair();

    const first = encryptPushPayload("same message", receiver.publicKey, AUTH_SECRET);
    const second = encryptPushPayload("same message", receiver.publicKey, AUTH_SECRET);

    // Salt alone is enough to prove this, and it is what an observer would key
    // on. The ephemeral key differs too, so the whole keyid differs.
    expect(Buffer.from(first.body.subarray(0, 16)).equals(Buffer.from(second.body.subarray(0, 16)))).toBe(false);
    expect(Buffer.from(first.body).equals(Buffer.from(second.body))).toBe(false);
  });

  it("rejects a subscription key that is not an uncompressed P-256 point", () => {
    expect(() => encryptPushPayload("hi", bytesToBase64Url(Buffer.alloc(10)), AUTH_SECRET)).toThrow(
      /uncompressed P-256/
    );
    // Right length, wrong prefix.
    const bad = Buffer.alloc(65, 2);
    expect(() => encryptPushPayload("hi", bytesToBase64Url(bad), AUTH_SECRET)).toThrow(
      /uncompressed P-256/
    );
  });

  it("only decrypts for the right receiver", () => {
    const receiver = receiverKeyPair();
    const stranger = receiverKeyPair();

    const { body } = encryptPushPayload("private", receiver.publicKey, AUTH_SECRET);

    expect(() =>
      decryptPushPayload(body, stranger.privateKey, Buffer.alloc(16, 7))
    ).toThrow();
  });
});