"use client";

/**
 * The device-local half of the MPIN.
 *
 * Why a second copy of the hash exists
 * ------------------------------------
 * The account row is authoritative — it is what stops a borrowed laptop from
 * reading your workspace, and it is scrypt-hashed on the server. But a server
 * call per unlock is also what made Ownspece unusable offline: close the app on
 * a train, reopen it, and the lock screen could not even tell a right MPIN from
 * a wrong one.
 *
 * So the same MPIN is *also* derived on the device, with WebCrypto, and kept in
 * `localStorage` under a per-user key. That is what the lock screen checks
 * first. The server is still consulted whenever it can be, so the lockout
 * counter and `last_unlocked_at` stay honest; it is a fast local gate in front
 * of an authoritative one, not a replacement for it.
 *
 * One MPIN, everywhere
 * --------------------
 * There is no second PIN for any other surface of the app. The lock screen, the
 * settings panel and the first-run setup all write the same value to the same
 * place, so the number a user types in July is the number they need in
 * December.
 *
 * What is stored
 * --------------
 * `pbkdf2$<iterations>$<saltHex>$<hashHex>`. The PIN itself is never written,
 * here or anywhere else. A dump of this device yields a salted, 210k-iteration
 * PBKDF2 digest — which, like the server's scrypt hash, is an offline-cracking
 * problem rather than a "log in as this user" problem.
 *
 * Storage is `localStorage` and not IndexedDB on purpose: it is synchronous,
 * so the lock screen can decide what to paint before its first frame instead of
 * flashing an empty keypad and then correcting itself. The payload is 120 bytes.
 */

import { MPIN_MIN, MPIN_MAX } from "@/lib/security/mpin";

/**
 * PBKDF2-SHA-256 cost.
 *
 * 210k is the OWASP recommendation for PBKDF2-HMAC-SHA-256, measured on the
 * hardware this app targets. It costs roughly 100–200 ms on a phone, which is
 * behind the keypress the user just made, and puts a six-digit secret well out
 * of reach of an unthrottled offline search.
 */
const ITERATIONS = 210_000;

const SALT_BYTES = 16;
const HASH_BITS = 256;

const PREFIX = "ownspece:local-mpin:v1";

/**
 * Fired whenever this device's copy is written or removed.
 *
 * `localStorage`'s `storage` event only fires in *other* tabs, so a tab that
 * just saved its own PIN would never learn about it. Without this the settings
 * panel would keep claiming the device is not set up until it was reloaded.
 */
const LOCAL_MPIN_EVENT = "ownspece:local-mpin-changed";

/** Same key per account, so one device never mixes two users' secrets. */
function storageKey(userId: string): string {
  return `${PREFIX}:${userId}`;
}

/**
 * Subscribes to changes made by this tab.
 *
 * Returns a plain unsubscribe rather than a store handle: the snapshot is
 * derived from `localStorage`, so React can call it whenever it likes and it
 * always reads the truth.
 */
export function subscribeToLocalMpin(onChange: () => void): () => void {
  window.addEventListener(LOCAL_MPIN_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(LOCAL_MPIN_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Constant-time comparison over two hex strings.
 *
 * The obvious `a === b` short-circuits on the first differing character, which
 * turns a wrong-PIN probe into a measurement of how many leading digits were
 * right. Here every character is compared and the results are accumulated, so
 * the time taken does not depend on the answer.
 *
 * Exported for tests: the property that matters is not "does it say no" but
 * "does it say no without looking at the input".
 */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

type StoredMpin = {
  iterations: number;
  saltHex: string;
  hashHex: string;
};

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Parses the stored string, rejecting anything malformed.
 *
 * A record that fails to parse is treated as *no record at all* rather than as
 * a match or a mismatch — see `readStored`, where that distinction decides
 * whether a wrong MPIN is reported as wrong or as "set one up".
 */
export function parseStoredMpin(raw: string | null): StoredMpin | null {
  if (!raw) return null;

  const parts = raw.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return null;

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 5_000_000) return null;

  const [, , saltHex, hashHex] = parts;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return null;
  if (saltHex.length !== SALT_BYTES * 2 || hashHex.length !== HASH_BITS / 4) return null;

  return { iterations, saltHex: saltHex.toLowerCase(), hashHex: hashHex.toLowerCase() };
}

export function formatStoredMpin(record: StoredMpin): string {
  return `pbkdf2$${record.iterations}$${record.saltHex}$${record.hashHex}`;
}

function readStored(userId: string): StoredMpin | null {
  try {
    return parseStoredMpin(window.localStorage.getItem(storageKey(userId)));
  } catch {
    // Private mode, or storage turned off. Treated as "not set up here".
    return null;
  }
}

function writeStored(userId: string, record: StoredMpin): boolean {
  try {
    window.localStorage.setItem(storageKey(userId), formatStoredMpin(record));
    window.dispatchEvent(new Event(LOCAL_MPIN_EVENT));
    return true;
  } catch {
    return false;
  }
}

/**
 * Derives the digest for `mpin` under `record`'s salt and cost.
 *
 * Shared by `saveLocalMpin` and `verifyLocalMpin` so the two can never drift
 * apart — a mismatch between "what was stored" and "what is checked" produces a
 * lock nobody can open, which is the one failure this whole module exists to
 * avoid.
 */
export async function deriveLocalMpin(
  mpin: string,
  saltHex: string,
  iterations: number
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("This browser cannot derive a key.");

  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(mpin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const bits = await subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex) as BufferSource, iterations, hash: "SHA-256" },
    key,
    HASH_BITS
  );

  return toHex(bits);
}

/** True when this device already holds a usable copy of the account's MPIN. */
export function hasLocalMpin(userId: string): boolean {
  return readStored(userId) !== null;
}

/**
 * Derives and stores the local copy.
 *
 * Call this whenever the account's MPIN is set or changed — without it this
 * device keeps falling back to a server round trip on every unlock, and keeps
 * being unable to unlock at all while offline.
 *
 * Returns whether the copy is usable here. A `false` is not an error worth
 * surfacing: the server hash still works, only the offline path is unavailable.
 */
export async function saveLocalMpin(userId: string, mpin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (mpin.length < MPIN_MIN || mpin.length > MPIN_MAX) return false;

  try {
    const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const saltHex = toHex(salt.buffer);
    const hashHex = await deriveLocalMpin(mpin, saltHex, ITERATIONS);
    return writeStored(userId, { iterations: ITERATIONS, saltHex, hashHex });
  } catch {
    // No WebCrypto, or storage refused the write. The server copy still governs.
    return false;
  }
}

/**
 * Checks an MPIN against this device's stored copy.
 *
 * Returns `null` — not `false` — when there is no local copy, which means "ask
 * the server" rather than "wrong". The distinction is the whole reason the lock
 * screen has two paths.
 */
export async function verifyLocalMpin(userId: string, mpin: string): Promise<boolean | null> {
  const stored = readStored(userId);
  if (!stored) return null;

  try {
    const derived = await deriveLocalMpin(mpin, stored.saltHex, stored.iterations);
    return safeEqualHex(derived, stored.hashHex);
  } catch {
    return false;
  }
}

/** Removes this device's copy. Called on sign-out, and when the MPIN changes. */
export function clearLocalMpin(userId: string): void {
  try {
    window.localStorage.removeItem(storageKey(userId));
    window.dispatchEvent(new Event(LOCAL_MPIN_EVENT));
  } catch {
    // Nothing to clean up.
  }
}