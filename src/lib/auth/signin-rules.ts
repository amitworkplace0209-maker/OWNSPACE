/**
 * The rules of an MPIN sign-in, with nothing else in them.
 *
 * Split out from `mpin-signin.ts` so the decisions can be tested without a
 * database, a Supabase client or a network. Everything here is a pure function
 * of its arguments, and every one of them is a decision somebody could get
 * wrong in a way that either locks a user out of their own account or lets
 * somebody else in.
 */

/** The row behind every sign-in decision, as far as these rules care. */
export type SignInSecurityRow = {
  signin_failed_attempts: number | null;
  signin_locked_until: string | null;
};

/**
 * The message for every wrong credential.
 *
 * The same words whether the address is unknown, the MPIN is wrong, or the
 * account has no MPIN at all. Anything more specific turns the sign-in form
 * into a test for which addresses have accounts here.
 */
export const GENERIC_SIGN_IN_ERROR = "That email and MPIN do not match an account.";

/**
 * Whether the account is currently locked out, and until when.
 *
 * A lockout that has expired is not a lockout: the counter is cleared by the
 * next attempt either way, and a row whose `locked_until` is in the past must
 * not keep somebody out.
 */
export function readSignInLock(
  row: SignInSecurityRow | null,
  now: number
): { locked: boolean; until: number | null } {
  if (!row?.signin_locked_until) return { locked: false, until: null };

  const until = new Date(row.signin_locked_until).getTime();
  if (!Number.isFinite(until)) return { locked: false, until: null };
  if (until <= now) return { locked: false, until: null };

  return { locked: true, until };
}

/**
 * What one more wrong attempt does.
 *
 * The counter is written on every attempt, successful or not, so a row that
 * has failed five times locks on the sixth rather than on the eleventh.
 */
export function nextSignInAttempt(
  failedAttempts: number | null | undefined,
  now: number = Date.now(),
  maxAttempts: number,
  lockoutMs: number
): { attempts: number; shouldLock: boolean; lockedUntil: string | null } {
  const attempts = (failedAttempts ?? 0) + 1;
  const shouldLock = attempts >= maxAttempts;

  return {
    attempts,
    shouldLock,
    lockedUntil: shouldLock ? new Date(now + lockoutMs).toISOString() : null,
  };
}

/**
 * The message shown while an account is locked out.
 *
 * Minutes are rounded up, so "0 minutes remaining" never appears while the
 * lockout is still running.
 */
export function signInLockoutMessage(until: number, now: number = Date.now()): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  return `Too many attempts. Try again in about ${minutes} ${
    minutes === 1 ? "minute" : "minutes"
  }.`;
}
