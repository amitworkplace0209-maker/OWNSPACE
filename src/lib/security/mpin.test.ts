import { describe, expect, it } from "vitest";
import {
  createMpinSalt,
  hashMpin,
  hashMpinWithSalt,
  isSequential,
  lockDurationMs,
  LOCK_DURATIONS,
  MAX_MPIN_ATTEMPTS,
  MPIN_MAX,
  MPIN_MIN,
  validateMpin,
  verifyMpin,
} from "@/lib/security/mpin";

describe("validateMpin", () => {
  it("accepts an ordinary PIN", () => {
    expect(validateMpin("482913")).toEqual({ ok: true });
  });

  it("trims before validating", () => {
    expect(validateMpin("  482913  ")).toEqual({ ok: true });
  });

  it("rejects an empty PIN", () => {
    const result = validateMpin("");
    expect(result.ok).toBe(false);
  });

  it("rejects letters and symbols", () => {
    // A PIN with a letter cannot be typed on the numeric keypad the lock screen
    // uses, so accepting it would mean accepting an MPIN nobody can enter.
    expect(validateMpin("4829ab").ok).toBe(false);
    expect(validateMpin("48-913").ok).toBe(false);
    expect(validateMpin("٤٨٢٩").ok).toBe(false);
  });

  it("rejects a PIN that is too short or too long", () => {
    expect(validateMpin("1".repeat(MPIN_MIN - 1)).ok).toBe(false);
    expect(validateMpin("1".repeat(MPIN_MAX + 1)).ok).toBe(false);
  });

  it("refuses a repeated digit", () => {
    // 111111 is in the top ten of any ordered search.
    expect(validateMpin("111111").ok).toBe(false);
    expect(validateMpin("0000").ok).toBe(false);
  });

  it("refuses a run", () => {
    expect(validateMpin("1234").ok).toBe(false);
    expect(validateMpin("4567").ok).toBe(false);
    expect(validateMpin("9876").ok).toBe(false);
  });

  it("allows a run that is not the whole PIN", () => {
    // Rejecting "4829134" for containing "234" would be paternalistic; only a PIN
    // that *is* a run is trivially guessable.
    expect(validateMpin("4829134")).toEqual({ ok: true });
  });
});

describe("isSequential", () => {
  it("catches runs in both directions", () => {
    expect(isSequential("12345")).toBe(true);
    expect(isSequential("54321")).toBe(true);
  });

  it("leaves an ordinary PIN alone", () => {
    expect(isSequential("482913")).toBe(false);
    expect(isSequential("1212")).toBe(false);
  });
});

describe("mpin hashing", () => {
  it("verifies a PIN against its own hash", async () => {
    const { hash, salt } = await hashMpinWithSalt("482913");
    await expect(verifyMpin("482913", hash, salt)).resolves.toBe(true);
  });

  it("rejects the wrong PIN", async () => {
    const { hash, salt } = await hashMpinWithSalt("482913");
    await expect(verifyMpin("482914", hash, salt)).resolves.toBe(false);
  });

  it("stores no trace of the PIN", async () => {
    const { hash, salt } = await hashMpinWithSalt("482913");
    expect(hash).not.toContain("482913");
    expect(salt).not.toContain("482913");
    // Hex digest and a hex salt — nothing that looks like the input at all.
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("gives two users with the same PIN different digests", async () => {
    // A shared digest would mean one precomputed table unlocks every account.
    const a = await hashMpinWithSalt("482913");
    const b = await hashMpinWithSalt("482913");
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it("never produces the same salt twice", () => {
    const salts = new Set(Array.from({ length: 50 }, () => createMpinSalt()));
    expect(salts.size).toBe(50);
  });

  it("is deterministic for a given PIN and salt", async () => {
    const salt = createMpinSalt();
    expect(await hashMpin("482913", salt)).toBe(await hashMpin("482913", salt));
  });

  it("treats a missing stored hash as a failure, not a pass", async () => {
    // A half-finished enrolment must never read as "unlocked".
    await expect(verifyMpin("482913", "", "")).resolves.toBe(false);
  });

  it("treats a corrupt stored hash as a failure", async () => {
    await expect(verifyMpin("482913", "not-hex", "also-not-hex")).resolves.toBe(false);
  });

  it("fails closed on a hash of the wrong length", async () => {
    const { salt } = await hashMpinWithSalt("482913");
    await expect(verifyMpin("482913", "abcd", salt)).resolves.toBe(false);
  });

  it("takes long enough to make an offline sweep expensive", async () => {
    const { hash, salt } = await hashMpinWithSalt("482913");
    const started = Date.now();
    await verifyMpin("482913", hash, salt);
    // scrypt at N=2^15 is deliberately slow. A guard rather than a benchmark:
    // if someone drops the cost factor to make a test fast, this catches it, and
    // the failure message says why.
    expect(Date.now() - started).toBeGreaterThan(20);
  });
});

describe("lockout and durations", () => {
  it("allows a small number of attempts", () => {
    expect(MAX_MPIN_ATTEMPTS).toBeGreaterThanOrEqual(5);
    expect(MAX_MPIN_ATTEMPTS).toBeLessThanOrEqual(10);
  });

  it("maps every duration id to a number of milliseconds", () => {
    for (const entry of LOCK_DURATIONS) {
      const ms = lockDurationMs(entry.id);
      expect(Number.isNaN(ms)).toBe(false);
      expect(ms).toBe(entry.ms);
    }
  });

  it("falls back to five minutes for an unknown id", () => {
    expect(lockDurationMs("five")).toBe(5 * 60_000);
    expect(lockDurationMs("nonsense")).toBe(5 * 60_000);
    expect(lockDurationMs(null)).toBe(5 * 60_000);
  });

  it("can lock the instant the app is backgrounded", () => {
    expect(lockDurationMs("immediately")).toBe(0);
  });
});
