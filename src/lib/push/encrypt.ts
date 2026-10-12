import { createCipheriv, createDecipheriv, createECDH, createHmac, randomBytes } from "node:crypto";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/push/vapid";

/**
 * Web push message encryption — RFC 8291 §3.
 *
 * Split out from `send.ts` and deliberately *not* marked `server-only` for two
 * reasons: it holds no secrets (the subscription keys arrive as arguments), and
 * the test suite needs to run it. An encrypted push whose derivation is subtly
 * wrong is silently discarded by the browser with no error anywhere, so it has
 * to be covered by a test that decrypts with the receiver's independent half of
 * the spec — see `web-push-crypto.test.ts`.
 *
 * The derivation, spelled out because getting it wrong is invisible:
 *
 *   ecdh_secret = ECDH(sender ephemeral private, receiver public)
 *   PRK_key     = HMAC(auth_secret, ecdh_secret)          <- auth is the HMAC *key*
 *   key_info    = "WebPush: info" || 0x00 || ua_public || as_public
 *   IKM         = HMAC(salt, PRK_key || key_info)
 *   CEK         = HMAC(salt, IKM || "Content-Encoding: aes128gcm" || 0x00)
 *   NONCE       = HMAC(salt, IKM || "Content-Encoding: nonce" || 0x00)
 */

/** Content-Encoding label Web Push uses for its single supported scheme. */
const CONTENT_ENCODING = "Content-Encoding";

/**
 * HMAC-based KDF step.
 *
 * Every use here is a single output block of 32 bytes or fewer, so the expand
 * loop never needs a second iteration. `context` is whatever precedes the
 * label — the IKM, or the PRK in `PRK_key`'s case.
 */
function hkdf(
  key: Buffer,
  context: Uint8Array,
  label: string,
  length: number
): Uint8Array {
  const prk = createHmac("sha256", key).update(Buffer.from(context)).digest();
  return new Uint8Array(
    createHmac("sha256", prk)
      .update(Buffer.concat([Buffer.from(label, "utf8"), Buffer.from([1])]))
      .digest()
      .subarray(0, length)
  );
}

export type EncryptedPush = {
  body: Uint8Array;
  /** Public key the receiver needs, base64url — kept for tests and debugging. */
  senderPublicKey: string;
};

/**
 * Encrypts one notification for one subscription.
 *
 * A fresh salt and a fresh ephemeral key pair are generated per message, so two
 * identical notifications never produce identical ciphertext and an observer
 * cannot correlate them.
 */
export function encryptPushPayload(
  plaintext: string,
  receiverPublicKey: string,
  receiverAuthSecret: string
): EncryptedPush {
  const uaPublic = base64UrlToBytes(receiverPublicKey);
  if (uaPublic.length !== 65 || uaPublic[0] !== 0x04) {
    throw new Error("Subscription public key is not an uncompressed P-256 point.");
  }

  const authSecret = base64UrlToBytes(receiverAuthSecret);
  const salt = randomBytes(16);

  // An ephemeral key pair per message. Node's `computeSecret` returns the raw
  // X coordinate of the shared point, which is exactly the 32-byte
  // `ecdh_secret` the spec wants — no KDF of it here, that happens below.
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const senderPublic = Buffer.from(ecdh.getPublicKey());
  const ecdhSecret = ecdh.computeSecret(Buffer.from(uaPublic));

  // `auth_secret` is the HMAC key and the ECDH output is its message. This is
  // the line that is easy to write as a concatenation, which silently produces
  // a push no browser will ever decrypt.
  const prkKey = createHmac("sha256", Buffer.from(authSecret))
    .update(Buffer.from(ecdhSecret))
    .digest();

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    Buffer.from(uaPublic),
    senderPublic,
  ]);

  const ikm = createHmac("sha256", salt)
    .update(Buffer.concat([prkKey, keyInfo]))
    .digest();

  const cek = hkdf(salt, ikm, `${CONTENT_ENCODING}: aes128gcm\0`, 16);
  const nonce = hkdf(salt, ikm, `${CONTENT_ENCODING}: nonce\0`, 12);

  const body = Buffer.from(plaintext, "utf8");
  const cipher = createCipheriv("aes-128-gcm", Buffer.from(cek), Buffer.from(nonce));
  // Web Push transmits the GCM tag in the clear at the end of the record rather
  // than in a separate header, which is what `authTagLength: 16` expresses.
  const sealed = Buffer.concat([cipher.update(body), cipher.final(), cipher.getAuthTag()]);

  // header = salt(16) || rs(4, record size) || idlen(1) || keyid
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  const keyid = Buffer.concat([senderPublic, Buffer.from(authSecret)]);
  const header = Buffer.concat([salt, rs, Buffer.from([keyid.length]), keyid]);

  return {
    body: new Uint8Array(Buffer.concat([header, sealed])),
    senderPublicKey: bytesToBase64Url(senderPublic),
  };
}

/**
 * The receiver's half of the spec, used by the tests.
 *
 * Kept here beside the sender rather than in the test file so the two are
 * obviously paired, and exported only because a test has to be able to check a
 * sender against an independently-written receiver.
 */
export function decryptPushPayload(
  body: Uint8Array,
  receiverPrivateKey: Uint8Array,
  receiverAuthSecret: Uint8Array
): string {
  const headerLength = 16 + 4 + 1;
  const idLength = body[20];
  const keyidLength = idLength;
  const senderPublic = body.subarray(headerLength, headerLength + keyidLength - 16);
  const sealed = Buffer.from(
    body.subarray(headerLength + keyidLength)
  );

  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(Buffer.from(receiverPrivateKey));
  const ecdhSecret = ecdh.computeSecret(Buffer.from(senderPublic));

  const prkKey = createHmac("sha256", Buffer.from(receiverAuthSecret))
    .update(Buffer.from(ecdhSecret))
    .digest();

  // `getPublicKey()` already includes the 0x04 uncompressed-point prefix.
  // Prepending another would make a 66-byte key, which changes `key_info` and
  // silently derives the wrong content key.
  const receiverPublic = Buffer.from(ecdh.getPublicKey());

  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0", "utf8"),
    receiverPublic,
    Buffer.from(senderPublic),
  ]);

  const salt = Buffer.from(body.subarray(0, 16));
  const ikm = createHmac("sha256", salt)
    .update(Buffer.concat([prkKey, keyInfo]))
    .digest();

  const cek = hkdf(salt, ikm, `${CONTENT_ENCODING}: aes128gcm\0`, 16);
  const nonce = hkdf(salt, ikm, `${CONTENT_ENCODING}: nonce\0`, 12);

  const tag = sealed.subarray(sealed.length - 16);
  const ciphertext = sealed.subarray(0, sealed.length - 16);

  const decipher = createDecipheriv("aes-128-gcm", Buffer.from(cek), Buffer.from(nonce));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}