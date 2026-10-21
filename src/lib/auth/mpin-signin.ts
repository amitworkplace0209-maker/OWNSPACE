import "server-only";

import { getAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import {
  burnVerificationTime,
  LOCKOUT_MS,
  MAX_MPIN_ATTEMPTS,
  verifyMpin,
} from "@/lib/security/mpin";

/**
 * Signing in with an email and an MPIN.
 *
 * Why the MPIN is the credential
 * -----------------------------
 * The account still has a password, and it still matters: it is what the
 * password-reset email changes, and it is how somebody who has forgotten their
 * MPIN gets back in. But the *sign-in* the app asks for is the MPIN, because
 * that is the secret the user already has to remember for the app lock, and
 * asking for two secrets at the door is asking for one of them to be written
 * on a sticky note.
 *
 * How a session is opened
 * -----------------------
 * Supabase Auth has no "log this person in" call that takes a secret of the
 * app's own choosing — its doors are email + password, and the password is
 * hashed where the app cannot read it. So the MPIN is checked here, and the
 * session is then opened with an admin-generated magic-link token, exchanged
 * for a session by the same code path the emailed link uses. Nothing is sent
 * to the mailbox: the token never leaves the server.
 *
 * What this buys and what it costs
 * --------------------------------
 * It buys a single-field sign-in that works on a phone with a numeric keypad.
 * It costs one round trip to the admin API, and it makes the MPIN the only
 * thing standing between an attacker with an email address and an account —
 * which is why the lockout below is not optional.
 */

/** The row behind every sign-in decision. */
export type AccountSecurityRow = {
  user_id: string;
  email: string | null;
  mpin_hash: string | null;
  mpin_salt: string | null;
  is_lock_enabled: boolean;
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
 * Finds the account behind an email address.
 *
 * Read with the service role, because at this point nobody is signed in and
 * the row is not visible to an anonymous client. The table is indexed on the
 * lower-cased address, and the address is lower-cased before it gets here, so
 * this is one index lookup rather than a scan.
 */
export async function findAccountByEmail(
  email: string
): Promise<AccountSecurityRow | null> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("user_security")
    .select(
      "user_id, email, mpin_hash, mpin_salt, is_lock_enabled, signin_failed_attempts, signin_locked_until"
    )
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return null;
  return data as AccountSecurityRow;
}

/**
 * Whether the account is currently locked out, and until when.
 *
 * Exported as a pure function of the row and the clock so the rule can be
 * tested without a database.
 */
export function readSignInLock(
  row: Pick<AccountSecurityRow, "signin_locked_until">,
  now: number
): { locked: boolean; until: number | null } {
  if (!row.signin_locked_until) return { locked: false, until: null };

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
  failedAttempts: number | null | undefined
): { attempts: number; shouldLock: boolean; lockedUntil: string | null } {
  const attempts = (failedAttempts ?? 0) + 1;
  const shouldLock = attempts >= MAX_MPIN_ATTEMPTS;

  return {
    attempts,
    shouldLock,
    lockedUntil: shouldLock ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
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

/**
 * Checks an MPIN against an account.
 *
 * Returns `false` for an account with no MPIN set — a half-created account
 * must never read as a successful sign-in — and spends the same time either
 * way, so the answer does not leak whether the account exists.
 */
export async function verifyAccountMpin(
  row: AccountSecurityRow | null,
  mpin: string
): Promise<boolean> {
  if (!row?.mpin_hash || !row.mpin_salt) {
    await burnVerificationTime();
    return false;
  }

  return verifyMpin(mpin, row.mpin_hash, row.mpin_salt);
}

/** Records a failed attempt, and locks the account when there have been too many. */
export async function recordFailedSignIn(
  userId: string,
  failedAttempts: number | null | undefined
): Promise<{ lockedUntil: string | null }> {
  const next = nextSignInAttempt(failedAttempts);
  const admin = getAdminClient();

  await admin
    .from("user_security")
    .update({
      signin_failed_attempts: next.attempts,
      signin_locked_until: next.lockedUntil,
    })
    .eq("user_id", userId);

  return { lockedUntil: next.lockedUntil };
}

/** Clears the counter after a successful sign-in. */
export async function recordSuccessfulSignIn(userId: string): Promise<void> {
  const admin = getAdminClient();

  await admin
    .from("user_security")
    .update({
      signin_failed_attempts: 0,
      signin_locked_until: null,
      // The app lock reads this: a sign-in has just proved the MPIN, so the
      // workspace does not ask for it a second time on the way in.
      last_unlocked_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

/**
 * Whether the account's email address has been confirmed.
 *
 * An MPIN sign-in skips the emailed confirmation link, so an account that has
 * never proved it owns its mailbox must not be allowed in through the back
 * door: otherwise anybody who guessed a six-digit MPIN would own the account
 * without ever seeing an email.
 *
 * Fails open. The check is a second line of defence, not the first — the MPIN
 * itself and the lockout are the first — and a hiccup in the admin API should
 * not lock a legitimate user out of their own workspace.
 */
export async function isEmailConfirmed(userId: string): Promise<boolean> {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);
    if (error || !data?.user) return true;
    return Boolean(data.user.email_confirmed_at);
  } catch {
    return true;
  }
}

/**
 * Opens a session for an account, without asking for its password.
 *
 * The token is generated by the admin API and exchanged straight away, so no
 * email is sent and nothing leaves the server. The exchange goes through the
 * ordinary cookie client, which is what puts the session cookie in place.
 */
export async function openSessionForAccount(
  email: string
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  const admin = getAdminClient();

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    return { ok: false, error: "Could not open a session for that account." };
  }

  const supabase = await createClient();

  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });

  const user = verified?.user;
  if (verifyError || !user) {
    return { ok: false, error: "Could not open a session for that account." };
  }

  return { ok: true, user };
}
