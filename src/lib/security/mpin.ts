import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * MPIN hashing.
 *
 * Deliberately free of Supabase and of `server-only`, so the security-critical
 * arithmetic can be tested without a database — this is the one piece of code in
 * the app where a subtle mistake loses somebody's account.
 *
 * Why scrypt and not a bare digest
 * --------------------------------
 * An MPIN is four to six digits: between ten thousand and a million candidates.
 * A plain SHA-256 of a PIN is walked in milliseconds, and even bcrypt at a low
 * cost factor is hours. scrypt is memory-hard, so each guess costs real RAM, and
 * the parameters below put a guess well above a hundred milliseconds.
 *
 * Everything is constant-time on the compare, and the salt is 16 random bytes
 * per user, so two people who pick the same PIN do not share a digest and a
 * stolen table cannot be attacked with one precomputed table of ten thousand
 * entries.
 */

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * scrypt cost.
 *
 * N=2^15 is the parameter scrypt itself specifies for interactive logins. It is
 * deliberate that this is slow: it runs once per unlock, on a server, and a
 * quarter-second of latency is invisible next to the cost of an offline attack
 * on a six-digit secret.
 */
const SCRYPT_OPTIONS = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  maxmem: 128 * 1024 * 1024,
} as const;

export type MpinHash = {
  hash: string;
  salt: string;
};

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/** A fresh random salt, hex encoded. One per user, never reused. */
export function createMpinSalt(): string {
  return randomBytes(SALT_BYTES).toString("hex");
}

/** Hashes a PIN against a salt. The salt is stored alongside the hash. */
export async function hashMpin(mpin: string, salt: string): Promise<string> {
  const derived = await scryptAsync(mpin, Buffer.from(salt, "hex"));
  return derived.toString("hex");
}

/** Generates a hash and its salt together, for first-time enrolment. */
export async function hashMpinWithSalt(mpin: string): Promise<MpinHash> {
  const salt = createMpinSalt();
  return { hash: await hashMpin(mpin, salt), salt };
}

/**
 * Checks a PIN against a stored hash.
 *
 * Constant-time, and a missing or malformed stored hash is a *failure*, never a
 * pass: treating "no hash configured" as unlocked would turn a half-finished
 * enrolment into a way around the lock entirely.
 */
export async function verifyMpin(mpin: string, hash: string, salt: string): Promise<boolean> {
  if (!hash || !salt) return false;
  if (!/^[0-9a-f]+$/i.test(hash) || !/^[0-9a-f]+$/i.test(salt)) return false;

  try {
    const derived = await scryptAsync(mpin, Buffer.from(salt, "hex"));
    const expected = Buffer.from(hash, "hex");
    // Lengths can only differ if the stored hash is corrupt; timingSafeEqual
    // throws on a mismatch, so that is checked rather than caught.
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// The PIN itself
// ---------------------------------------------------------------------------

export const MPIN_MIN = 4;
export const MPIN_MAX = 8;
export const MPIN_RECOMMENDED_MIN = 6;

/** How many wrong attempts before the row locks. */
export const MAX_MPIN_ATTEMPTS = 6;

/** How long a lockout lasts. Long enough to stop a script, short enough to forgive a real slip. */
export const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * The one number every unlock path agrees on.
 *
 * A dummy PIN, hashed once per process and kept in memory. Verifying a
 * submitted MPIN against it costs exactly as much as verifying it against the
 * real one, which is the point: without it, a sign-in for an address that does
 * not exist returns in a millisecond while a sign-in for an address that does
 * takes a quarter of a second, and the difference is a free test for whether
 * somebody has an account here.
 */
const BURN_PIN = "00000000";
let burnDigest: { hash: string; salt: string } | null = null;

/**
 * Spends the same time a real verification would.
 *
 * Called on every path that does *not* verify a real MPIN — an unknown
 * address, a locked-out account — so that all three take the same shape from
 * the outside.
 */
export async function burnVerificationTime(): Promise<void> {
  if (!burnDigest) {
    burnDigest = await hashMpinWithSalt(BURN_PIN);
  }
  await verifyMpin(BURN_PIN, burnDigest.hash, burnDigest.salt);
}

export type MpinValidation = { ok: true } | { ok: false; error: string };

/**
 * Validates a PIN's shape.
 *
 * Digits only, so it cannot be typed into a numeric keypad that would send a
 * different character than the one shown. The upper bound is 8 rather than 6:
 * insisting on exactly six makes the field a nuisance on a phone keyboard
 * without adding any real strength once scrypt is doing the work.
 */
export function validateMpin(value: string): MpinValidation {
  const trimmed = value.trim();

  if (!trimmed) return { ok: false, error: "Enter your MPIN." };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: "Your MPIN must be digits only." };
  }
  if (trimmed.length < MPIN_MIN) {
    return { ok: false, error: `Use at least ${MPIN_MIN} digits.` };
  }
  if (trimmed.length > MPIN_MAX) {
    return { ok: false, error: `Use at most ${MPIN_MAX} digits.` };
  }
  // Repeated digits are the first thing anyone tries, so they are refused as a
  // choice rather than as a rule: `111111` is in the top ten of any ordered
  // search and nothing else about it is safer than `482913`.
  if (new Set(trimmed).size === 1) {
    return { ok: false, error: "Do not use the same digit for every position." };
  }
  if (isSequential(trimmed)) {
    return { ok: false, error: "That MPIN is too easy to guess. Avoid runs like 1234." };
  }

  return { ok: true };
}

/**
 * True when every digit follows the previous by exactly one.
 *
 * Exported so the rule can be tested directly rather than only through
 * `validateMpin`, where a passing test would not say *which* direction it caught.
 */
export function isSequential(value: string): boolean {
  const ascending = [...value].every(
    (digit, index) => index === 0 || Number(digit) === Number(value[index - 1]) + 1
  );
  const descending = [...value].every(
    (digit, index) => index === 0 || Number(digit) === Number(value[index - 1]) - 1
  );
  return ascending || descending;
}

/**
 * How long an unlock lasts before the app re-locks, per the user's setting.
 *
 * "When the app is closed" is the default and the important one: an app that
 * stays unlocked after it has been closed is not locked at all. It maps to
 * infinity because there is no timer for it — the lock comes from the app
 * disappearing, not from a clock — and the gate treats infinity as "lock on
 * the way out" rather than "never lock".
 *
 * "Until I sign out" is deliberately absent. It was the one setting that made
 * the lock decorative: the app stayed open for as long as the tab lived, which
 * on a phone means "for as long as the phone is on".
 */
export const LOCK_DURATIONS = [
  { id: "closed", label: "When the app is closed", ms: Number.POSITIVE_INFINITY },
  { id: "minute", label: "After 1 minute", ms: 60_000 },
  { id: "five", label: "After 5 minutes", ms: 5 * 60_000 },
  { id: "fifteen", label: "After 15 minutes", ms: 15 * 60_000 },
  { id: "hour", label: "After 1 hour", ms: 60 * 60_000 },
] as const;

export type LockDurationId = (typeof LOCK_DURATIONS)[number]["id"];

/**
 * The duration behind a stored id.
 *
 * An unknown id — a value written by an older version of the app, or by hand —
 * falls back to "closed", the strictest of the settings. A fallback to five
 * minutes would be the friendlier choice and the wrong one: an id nobody
 * recognises should not quietly decide how long a locked workspace stays open.
 */
export function lockDurationMs(id: string | null | undefined): number {
  return (
    LOCK_DURATIONS.find((entry) => entry.id === id)?.ms ??
    LOCK_DURATIONS.find((entry) => entry.id === "closed")!.ms
  );
}
