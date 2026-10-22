import { describe, expect, it } from "vitest";
import {
  GENERIC_SIGN_IN_ERROR,
  nextSignInAttempt,
  readSignInLock,
  signInLockoutMessage,
} from "@/lib/auth/signin-rules";
import { LOCKOUT_MS, MAX_MPIN_ATTEMPTS } from "@/lib/security/mpin";

describe("readSignInLock", () => {
  const now = Date.parse("2026-03-01T12:00:00.000Z");

  it("is not locked when there is no lockout", () => {
    expect(readSignInLock({ signin_failed_attempts: 0, signin_locked_until: null }, now)).toEqual({
      locked: false,
      until: null,
    });
  });

  it("is not locked when the account does not exist", () => {
    expect(readSignInLock(null, now).locked).toBe(false);
  });

  it("is locked while the lockout is still running", () => {
    const until = new Date(now + 60_000).toISOString();
    const result = readSignInLock({ signin_failed_attempts: 6, signin_locked_until: until }, now);

    expect(result.locked).toBe(true);
    expect(result.until).toBe(Date.parse(until));
  });

  it("is not locked once the lockout has expired", () => {
    // An expired lockout must not keep somebody out: the next attempt clears
    // it, and a row whose deadline has passed says so.
    const until = new Date(now - 1).toISOString();
    expect(readSignInLock({ signin_failed_attempts: 6, signin_locked_until: until }, now).locked).toBe(
      false
    );
  });

  it("treats a nonsense lockout as no lockout", () => {
    expect(
      readSignInLock({ signin_failed_attempts: 6, signin_locked_until: "not-a-date" }, now).locked
    ).toBe(false);
  });
});

describe("nextSignInAttempt", () => {
  const now = Date.parse("2026-03-01T12:00:00.000Z");

  it("counts the attempt", () => {
    const next = nextSignInAttempt(0, now, MAX_MPIN_ATTEMPTS, LOCKOUT_MS);
    expect(next.attempts).toBe(1);
    expect(next.shouldLock).toBe(false);
    expect(next.lockedUntil).toBeNull();
  });

  it("treats a missing counter as zero", () => {
    expect(nextSignInAttempt(null, now, MAX_MPIN_ATTEMPTS, LOCKOUT_MS).attempts).toBe(1);
    expect(nextSignInAttempt(undefined, now, MAX_MPIN_ATTEMPTS, LOCKOUT_MS).attempts).toBe(1);
  });

  it("locks on the last allowed attempt", () => {
    const next = nextSignInAttempt(MAX_MPIN_ATTEMPTS - 1, now, MAX_MPIN_ATTEMPTS, LOCKOUT_MS);
    expect(next.attempts).toBe(MAX_MPIN_ATTEMPTS);
    expect(next.shouldLock).toBe(true);
    expect(next.lockedUntil).toBe(new Date(now + LOCKOUT_MS).toISOString());
  });

  it("does not lock before the last attempt", () => {
    const next = nextSignInAttempt(MAX_MPIN_ATTEMPTS - 2, now, MAX_MPIN_ATTEMPTS, LOCKOUT_MS);
    expect(next.shouldLock).toBe(false);
  });
});

describe("signInLockoutMessage", () => {
  const now = Date.parse("2026-03-01T12:00:00.000Z");

  it("rounds the remaining time up", () => {
    // One second left is still "about a minute", never "0 minutes".
    expect(signInLockoutMessage(now + 1_000, now)).toContain("1 minute");
  });

  it("says minutes when there are minutes", () => {
    expect(signInLockoutMessage(now + 5 * 60_000, now)).toContain("5 minutes");
  });

  it("never says zero minutes", () => {
    expect(signInLockoutMessage(now - 1, now)).toContain("1 minute");
  });
});

describe("the wrong-credential message", () => {
  it("is the same for every kind of wrong answer", () => {
    // One string, used for an unknown address, a wrong MPIN and an account
    // with no MPIN. Anything more specific is a test for who has an account.
    expect(GENERIC_SIGN_IN_ERROR).toBe("That email and MPIN do not match an account.");
  });
});
