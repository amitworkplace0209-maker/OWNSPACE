"use client";

/**
 * Unlocking with the *device's* own secret, instead of the account's MPIN.
 *
 * What this is for
 * ----------------
 * On a laptop, typing a six-digit number every time you alt-tab back into
 * your own workspace is the thing that makes people turn the app lock off.
 * The machine already knows who you are — it has a fingerprint reader, it has
 * a screen lock — and an installed app can ask it.
 *
 * So this device gets two extra ways in, both of them local:
 *
 *  - **A device PIN.** A number chosen on this machine, stored here and
 *    nowhere else. It is not the account's MPIN and it does not travel: it
 *    unlocks the app *on this device*, and it stops existing the moment the
 *    account signs out.
 *  - **A fingerprint.** A WebAuthn *platform* credential — the phone's own
 *    secure hardware. The private key never leaves the device, and the public
 *    key that verifies it is kept here, locally. The server is not involved
 *    at any point: this is a door key for this machine, not a second way into
 *    the account.
 *
 * Why it is local rather than on the account
 * ------------------------------------------
 * A credential stored on the account is a credential that can be phished from
 * a server, replayed from a backup, or used from another device. A credential
 * that never leaves the device's own secure hardware cannot. The trade is
 * honest and worth stating: **losing the fingerprint enrolment means falling
 * back to the account MPIN**, and that is exactly the escape hatch that has
 * to exist.
 *
 * Both are scoped to one account, so a shared machine never lets the second
 * person in with the first person's finger, and both are wiped on sign-out.
 */

import { MPIN_MAX, MPIN_MIN } from "@/lib/security/mpin";
import { deriveLocalMpin, safeEqualHex } from "@/lib/security/local-mpin.client";

/**
 * PBKDF2 cost for the device PIN.
 *
 * The same figure the account's offline MPIN copy uses, for the same reason:
 * a dump of this device must not be a table of PINs waiting to be walked.
 */
const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const DEVICE_PIN_PREFIX = "ownspece:device-pin:v1";
const BIOMETRIC_PREFIX = "ownspece:device-biometric:v1";

/**
 * Fired whenever either of them is written or removed.
 *
 * The same reason as the local MPIN's event: `storage` only fires in *other*
 * tabs, so a tab that saved its own PIN would never learn about it and the
 * settings panel would keep claiming the device is not set up.
 */
const DEVICE_UNLOCK_EVENT = "ownspece:device-unlock-changed";

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function devicePinKey(userId: string): string {
  return `${DEVICE_PIN_PREFIX}:${userId}`;
}

function biometricKey(userId: string): string {
  return `${BIOMETRIC_PREFIX}:${userId}`;
}

function announce() {
  window.dispatchEvent(new Event(DEVICE_UNLOCK_EVENT));
}

/** Subscribes to changes made in this tab. */
export function subscribeToDeviceUnlock(onChange: () => void): () => void {
  window.addEventListener(DEVICE_UNLOCK_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DEVICE_UNLOCK_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// ---------------------------------------------------------------------------
// The device PIN
// ---------------------------------------------------------------------------

type StoredDevicePin = {
  iterations: number;
  saltHex: string;
  hashHex: string;
};

function readDevicePin(userId: string): StoredDevicePin | null {
  try {
    const raw = window.localStorage.getItem(devicePinKey(userId));
    if (!raw) return null;

    const parts = raw.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return null;

    const iterations = Number(parts[1]);
    if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000) return null;

    const [, , saltHex, hashHex] = parts;
    if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
    if (saltHex.length !== SALT_BYTES * 2 || hashHex.length !== HASH_BITS / 4) return null;

    return { iterations, saltHex: saltHex.toLowerCase(), hashHex: hashHex.toLowerCase() };
  } catch {
    return null;
  }
}

/** True when this device already holds a device PIN for this account. */
export function hasDevicePin(userId: string): boolean {
  return readDevicePin(userId) !== null;
}

/**
 * Stores a device PIN on this machine.
 *
 * Returns whether it was stored. A `false` is not worth surfacing: the
 * account's MPIN still works, only the shortcut is unavailable.
 */
export async function saveDevicePin(userId: string, pin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (pin.length < MPIN_MIN || pin.length > MPIN_MAX) return false;

  try {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const saltHex = toHex(salt.buffer);
    const hashHex = await deriveLocalMpin(pin, saltHex, ITERATIONS);

    window.localStorage.setItem(
      devicePinKey(userId),
      `pbkdf2$${ITERATIONS}$${saltHex}$${hashHex}`
    );
    announce();
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a device PIN against the copy on this machine.
 *
 * Returns `null` — not `false` — when there is no device PIN here, which
 * means "ask for the account MPIN" rather than "wrong".
 */
export async function verifyDevicePin(
  userId: string,
  pin: string
): Promise<boolean | null> {
  const stored = readDevicePin(userId);
  if (!stored) return null;

  try {
    const derived = await deriveLocalMpin(pin, stored.saltHex, stored.iterations);
    return safeEqualHex(derived, stored.hashHex);
  } catch {
    return false;
  }
}

/** Removes the device PIN from this machine. */
export function clearDevicePin(userId: string): void {
  try {
    window.localStorage.removeItem(devicePinKey(userId));
    announce();
  } catch {
    // Nothing to clean up.
  }
}

// ---------------------------------------------------------------------------
// The fingerprint
// ---------------------------------------------------------------------------

/**
 * A platform credential, kept on this device.
 *
 * `publicKey` is the SPKI encoding of the key the authenticator made; it is
 * what verifies the signature, and it is useless on its own. `counter` is the
 * authenticator's signature counter, kept so a cloned authenticator can be
 * noticed.
 */
type StoredBiometric = {
  credentialId: string;
  publicKey: string;
  algorithm: number;
  counter: number;
  transports: string[];
};

/** RSASSA-PKCS1-v1_5 with SHA-256. */
const ALG_RSA = -7;
/** ECDSA over P-256 with SHA-256. */
const ALG_EC = -257;

function readBiometric(userId: string): StoredBiometric | null {
  try {
    const raw = window.localStorage.getItem(biometricKey(userId));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredBiometric>;
    if (!parsed.credentialId || !parsed.publicKey) return null;
    if (parsed.algorithm !== ALG_RSA && parsed.algorithm !== ALG_EC) return null;

    return {
      credentialId: parsed.credentialId,
      publicKey: parsed.publicKey,
      algorithm: parsed.algorithm,
      counter: typeof parsed.counter === "number" ? parsed.counter : 0,
      transports: Array.isArray(parsed.transports) ? parsed.transports : [],
    };
  } catch {
    return null;
  }
}

/** True when this device holds a fingerprint credential for this account. */
export function hasBiometric(userId: string): boolean {
  return readBiometric(userId) !== null;
}

/**
 * Whether this device can do a fingerprint at all.
 *
 * Two separate questions, and both have to be yes: the browser has to support
 * WebAuthn, and the device has to have a *platform* authenticator that can do
 * user verification — the fingerprint, the face, the device PIN that Windows
 * calls a PIN. A laptop with no reader and a phone with a screen lock but no
 * fingerprint both fail here.
 */
export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.isSecureContext) return false;
  if (!("PublicKeyCredential" in window)) return false;
  if (!navigator.credentials || !("create" in navigator.credentials)) return false;

  try {
    const available =
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return Boolean(available);
  } catch {
    return false;
  }
}

/**
 * Enrols this device's fingerprint.
 *
 * The credential is created with `attestation: "none"`, which means the
 * authenticator does not vouch for which model of hardware it is — the app
 * does not care, and asking for it makes some readers refuse. The key pair
 * itself is still generated inside the device's secure hardware and never
 * leaves it.
 */
export async function enrolBiometric(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof window === "undefined") {
    return { ok: false, error: "This device cannot use a fingerprint." };
  }
  if (!window.isSecureContext) {
    return {
      ok: false,
      error: "A fingerprint needs a secure connection. Open Ownspece over https, or on localhost.",
    };
  }
  if (!("PublicKeyCredential" in window) || !navigator.credentials) {
    return { ok: false, error: "This browser cannot use a fingerprint." };
  }

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Ownspece" },
        user: {
          id: userIdBytes,
          name: userId,
          displayName: "Ownspece on this device",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: ALG_RSA },
          { type: "public-key", alg: ALG_EC },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
        timeout: 120_000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    return { ok: false, error: describeCredentialError(error) };
  }

  if (!credential) {
    return { ok: false, error: "No fingerprint was enrolled." };
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  const publicKey = response.getPublicKey();
  if (!publicKey) {
    return { ok: false, error: "This device did not return a key to verify with." };
  }

  const record: StoredBiometric = {
    credentialId: toBase64Url(credential.rawId),
    publicKey: toBase64Url(publicKey),
    // The algorithm belongs to the *response*, not to the credential: it is the
    // authenticator that says which key it made.
    algorithm: response.getPublicKeyAlgorithm(),
    counter: 0,
    transports:
      typeof response.getTransports === "function" ? response.getTransports() : [],
  };

  try {
    window.localStorage.setItem(biometricKey(userId), JSON.stringify(record));
    announce();
    return { ok: true };
  } catch {
    return { ok: false, error: "This device would not store the fingerprint." };
  }
}

/**
 * Asks for a fingerprint and checks the answer against the key on this device.
 *
 * The verification is done here, in the browser, with the public key that was
 * kept locally at enrolment. Nothing is sent anywhere: this is the device
 * proving to itself that the person in front of it is the person who
 * enrolled, and the account is not part of the exchange at all.
 */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const stored = readBiometric(userId);
  if (!stored) return false;
  if (typeof window === "undefined" || !navigator.credentials) return false;

  const challenge = globalThis.crypto.getRandomValues(new Uint8Array(32));

  let assertion: PublicKeyCredential | null = null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            type: "public-key",
            id: fromBase64Url(stored.credentialId) as BufferSource,
            transports: stored.transports as AuthenticatorTransport[],
          },
        ],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    // A cancelled prompt, a locked-out sensor, a timeout: all of them mean
    // "not unlocked", and none of them are worth an error message of their own.
    return false;
  }

  if (!assertion) return false;

  const response = assertion.response as AuthenticatorAssertionResponse;

  // The client data has to belong to this challenge, this origin and this
  // ceremony. Without the check, an assertion captured elsewhere could be
  // replayed here.
  let clientData: { type?: string; challenge?: string; origin?: string };
  try {
    clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON));
  } catch {
    return false;
  }

  if (clientData.type !== "webauthn.get") return false;
  if (clientData.challenge !== toBase64Url(challenge)) return false;
  if (clientData.origin !== window.location.origin) return false;

  const authenticatorData = new Uint8Array(response.authenticatorData);
  const clientDataHash = new Uint8Array(
    await globalThis.crypto.subtle.digest("SHA-256", response.clientDataJSON)
  );

  const signed = new Uint8Array(authenticatorData.length + clientDataHash.length);
  signed.set(authenticatorData, 0);
  signed.set(clientDataHash, authenticatorData.length);

  let verified = false;
  try {
    if (stored.algorithm === ALG_EC) {
      const key = await globalThis.crypto.subtle.importKey(
        "spki",
        fromBase64Url(stored.publicKey) as BufferSource,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"]
      );
      verified = await globalThis.crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        response.signature as BufferSource,
        signed as BufferSource
      );
    } else {
      const key = await globalThis.crypto.subtle.importKey(
        "spki",
        fromBase64Url(stored.publicKey) as BufferSource,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"]
      );
      verified = await globalThis.crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        response.signature as BufferSource,
        signed as BufferSource
      );
    }
  } catch {
    return false;
  }

  if (!verified) return false;

  // The signature counter is how a cloned authenticator is noticed. A counter
  // that goes *backwards* means the key was copied somewhere else, so the
  // enrolment is dropped rather than trusted.
  const counter = typeof response.authenticatorData === "object" ? readCounter(response) : 0;
  if (counter > 0 && stored.counter > 0 && counter <= stored.counter) {
    clearBiometric(userId);
    return false;
  }

  try {
    window.localStorage.setItem(
      biometricKey(userId),
      JSON.stringify({ ...stored, counter })
    );
  } catch {
    // The counter is a nicety; failing to save it must not fail the unlock.
  }

  return true;
}

/**
 * The signature counter out of the authenticator data.
 *
 * Bytes 33–36 of the authenticator data, big-endian, when the attested
 * credential data flag is not set.
 */
function readCounter(response: AuthenticatorAssertionResponse): number {
  const data = new Uint8Array(response.authenticatorData);
  if (data.length < 37) return 0;
  if ((data[32] & 0x40) === 0) return 0;

  return (
    ((data[33] << 24) | (data[34] << 16) | (data[35] << 8) | data[36]) >>> 0
  );
}

/** Removes the fingerprint enrolment from this device. */
export function clearBiometric(userId: string): void {
  try {
    window.localStorage.removeItem(biometricKey(userId));
    announce();
  } catch {
    // Nothing to clean up.
  }
}

/** Removes every device secret for this account. Called on sign-out. */
export function clearDeviceUnlock(userId: string): void {
  clearDevicePin(userId);
  clearBiometric(userId);
}

/**
 * Turns a WebAuthn failure into something a person can act on.
 *
 * The browser's own errors are famously unhelpful ("The operation either
 * timed out or was not allowed"), and the four that actually happen here have
 * four different fixes.
 */
function describeCredentialError(error: unknown): string {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  switch (name) {
    case "NotAllowedError":
      return "The fingerprint was cancelled, or this device refused it.";
    case "InvalidStateError":
      return "This device already has a fingerprint enrolled for Ownspece.";
    case "NotSupportedError":
      return "This device has no fingerprint reader that Ownspece can use.";
    case "SecurityError":
      return "A fingerprint needs a secure connection. Open Ownspece over https, or on localhost.";
    default:
      return "The fingerprint could not be enrolled on this device.";
  }
}
