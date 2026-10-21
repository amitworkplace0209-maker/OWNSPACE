"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { getSiteUrl } from "@/lib/auth/site-url";
import {
  hashMpinWithSalt,
  verifyMpin,
  validateMpin,
  LOCKOUT_MS,
  MAX_MPIN_ATTEMPTS,
  type MpinValidation,
} from "@/lib/security/mpin";

export type SecurityState = {
  error?: string;
  /** Set when the caller must do something before trying again. */
  lockedUntil?: number | null;
  success?: string;
};

export type SecurityStatus = {
  lockEnabled: boolean;
  hasMpin: boolean;
  lockedUntil: number | null;
  failedAttempts: number;
  maxAttempts: number;
};

/**
 * The row behind every decision about the lock.
 *
 * Returns null rather than throwing when the table is missing, so an app
 * deployed ahead of `db:migrate` behaves as "no lock configured" instead of
 * 500-ing every page — the fail-safe direction for a security feature.
 *
 * Read through the ordinary cookie client, which is enough: the row is
 * readable by its owner and by nobody else, and every *write* in this file
 * goes through the service role instead (see the note on `admin()`).
 */
async function readSecurity(userId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_security")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return null;
  return (
    (data as {
      is_lock_enabled: boolean;
      mpin_hash: string | null;
      mpin_salt: string | null;
      failed_attempts: number;
      locked_until: string | null;
    } | null) ?? null
  );
}

/**
 * The client that writes to `user_security`.
 *
 * The table's owner policy is read-only on purpose. The MPIN hash, the lock
 * flag and the attempt counter are server-owned facts: a browser that merely
 * holds a session must not be able to set its own hash, clear its own lockout
 * or turn its own lock off. So every write here goes out with the service
 * role, from the server, after the server has checked the MPIN itself.
 */
function admin() {
  return getAdminClient();
}

/** What the lock screen needs on its very first paint. */
export async function getSecurityStatusAction(): Promise<SecurityStatus> {
  const user = await getUserOrRedirect();
  const row = await readSecurity(user.id);

  return {
    lockEnabled: row?.is_lock_enabled ?? false,
    hasMpin: Boolean(row?.mpin_hash && row?.mpin_salt),
    lockedUntil: row?.locked_until ? new Date(row.locked_until).getTime() : null,
    failedAttempts: row?.failed_attempts ?? 0,
    maxAttempts: MAX_MPIN_ATTEMPTS,
  };
}

/**
 * The one-time MPIN setup, for accounts that never chose one.
 *
 * New accounts choose their MPIN on the sign-up form, where it is hashed and
 * written in the same request that creates the account. This remains for the
 * accounts that predate that: they have a row with no hash, and without this
 * they would have no way to ever turn the lock on.
 *
 * Turning the lock on in the same call is the point. A user who has just
 * chosen a PIN and then has to find a switch to start using it is a user who
 * never turns it on.
 */
export async function completeMpinSetupAction(input: {
  mpin: string;
  confirm: string;
}): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const check = validateMpin(input.mpin);
  if (!check.ok) return { error: check.error };
  if (input.mpin !== input.confirm) return { error: "The two MPINs do not match." };

  const { hash, salt } = await hashMpinWithSalt(input.mpin);

  const { error } = await admin()
    .from("user_security")
    .upsert(
      {
        user_id: user.id,
        email: (user.email ?? "").toLowerCase() || null,
        mpin_hash: hash,
        mpin_salt: salt,
        mpin_set_at: new Date().toISOString(),
        // On, as promised. `user_preferences` keeps the existing value, so a user
        // who had already chosen a duration keeps it.
        is_lock_enabled: true,
        failed_attempts: 0,
        locked_until: null,
      },
      { onConflict: "user_id" }
    );

  if (error) return { error: friendlyError(error, "Could not save your MPIN.") };

  revalidatePath("/settings");
  return { success: "App lock is on." };
}

/**
 * Sets or changes the MPIN.
 *
 * The old one must be supplied to change it, so that possession of an unlocked
 * session — a borrowed laptop, a shared tablet — is not by itself enough to
 * replace the PIN that protects it.
 *
 * Also clears the lockout counter: getting here means the old PIN was right, and
 * leaving a stale counter behind would mean the next slip locks someone out
 * sooner than it should.
 */
export async function setMpinAction(
  _prev: SecurityState,
  formData: FormData
): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const mpin = String(formData.get("mpin") ?? "");
  const confirm = String(formData.get("confirm_mpin") ?? "");
  const current = String(formData.get("current_mpin") ?? "");
  const lockDuration = String(formData.get("lock_duration") ?? "closed");
  const enableLock = formData.get("enable_lock") === "on";

  const check = validateMpin(mpin);
  if (!check.ok) return { error: check.error };
  if (mpin !== confirm) return { error: "The two MPINs do not match." };

  const existing = await readSecurity(user.id);

  if (existing?.mpin_hash) {
    if (!current) {
      return { error: "Enter your current MPIN to change it." };
    }
    const correct = await verifyMpin(
      current,
      existing.mpin_hash,
      existing.mpin_salt ?? ""
    );
    if (!correct) return { error: "Your current MPIN is not right." };
  }

  // The DB constraint refuses `is_lock_enabled` without a hash; checked here
  // too so the message names the PIN rather than quoting a constraint.
  if (!enableLock && !existing?.mpin_hash) {
    return { error: "Set an MPIN before turning the lock on." };
  }

  const { hash, salt } = await hashMpinWithSalt(mpin);

  const { error } = await admin()
    .from("user_security")
    .upsert(
      {
        user_id: user.id,
        email: (user.email ?? "").toLowerCase() || null,
        mpin_hash: hash,
        mpin_salt: salt,
        mpin_set_at: new Date().toISOString(),
        is_lock_enabled: enableLock,
        failed_attempts: 0,
        locked_until: null,
      },
      { onConflict: "user_id" }
    );

  if (error) return { error: friendlyError(error, "Could not save your MPIN.") };

  await (await createClient())
    .from("user_preferences")
    .upsert({ user_id: user.id, lock_duration: lockDuration }, { onConflict: "user_id" });

  revalidatePath("/settings");
  return { success: enableLock ? "App lock is on." : "MPIN saved." };
}

/**
 * Checks a PIN against the account hash and, on success, unlocks.
 *
 * This is the *authoritative* path, not the one every unlock takes. The lock
 * screen first checks a device-local copy of the same MPIN (see
 * `lib/security/local-mpin.client.ts`) so an unlock works with no connection at
 * all; this action is what runs when there is no local copy yet, or when the
 * local one says no and the server should get the final word.
 *
 * That ordering matters for the lockout counter, which lives here. A device
 * that has been re-enrolled — new phone, cleared storage — has no local copy, so
 * a wrong MPIN here is the only thing that counts it. Going through the server
 * in that case is what stops an attacker cycling devices to get five free
 * guesses each.
 *
 * The attempt counter is written on *every* call, including the successful one.
 * Skipping it on success would mean a row that had failed five times locks the
 * user out on the sixth attempt even though that attempt was the right one.
 */
export async function unlockWithMpinAction(mpin: string): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const row = await readSecurity(user.id);
  if (!row?.mpin_hash || !row.mpin_salt) {
    return { error: "No MPIN is set on this account." };
  }

  const now = Date.now();

  if (row.locked_until) {
    const until = new Date(row.locked_until).getTime();
    if (until > now) {
      return {
        error: "Too many attempts.",
        lockedUntil: until,
      };
    }
    // The lockout has expired. Cleared below, on whatever comes next.
  }

  const correct = await verifyMpin(mpin, row.mpin_hash, row.mpin_salt);

  if (!correct) {
    const attempts = row.failed_attempts + 1;
    const shouldLock = attempts >= MAX_MPIN_ATTEMPTS;
    const lockedUntil = shouldLock ? now + LOCKOUT_MS : null;

    await admin()
      .from("user_security")
      .update({ failed_attempts: attempts, locked_until: lockedUntil })
      .eq("user_id", user.id);

    if (shouldLock) {
      return {
        error:
          "Too many wrong attempts. Reset your MPIN with the link we email you.",
        lockedUntil,
      };
    }

    const left = MAX_MPIN_ATTEMPTS - attempts;
    return {
      error: `That MPIN is not right. ${left} ${left === 1 ? "try" : "tries"} left.`,
    };
  }

  await admin()
    .from("user_security")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_unlocked_at: new Date(now).toISOString(),
    })
    .eq("user_id", user.id);

  return { success: "Unlocked." };
}

/**
 * Records an unlock the device has already verified on its own.
 *
 * Called after a *local* match, where there is no PIN to hash and no answer to
 * check — the work is already done, and this only keeps the account row honest:
 * the attempt counter resets and `last_unlocked_at` moves. Skipping it would
 * leave a device that unlocked offline carrying the lockout count from before
 * it went offline, so one wrong entry afterwards would lock out someone who has
 * not actually failed six times.
 *
 * It also means a correct local unlock clears an active lockout. That is the
 * deliberate cost of unlocking without a network, and it gives up nothing: the
 * lockout exists to slow down guessing a six-digit PIN, and whoever produced
 * the correct PIN was never slowed by it in the first place.
 *
 * Deliberately takes no argument. An action that verified nothing must not be
 * able to be talked into marking an arbitrary unlock as successful.
 *
 * Best-effort by nature: it is called on a path that already works without it,
 * so a failure here is swallowed rather than surfaced.
 */
export async function recordLocalUnlockAction(): Promise<void> {
  const user = await getUserOrRedirect();

  await admin()
    .from("user_security")
    .update({
      failed_attempts: 0,
      locked_until: null,
      last_unlocked_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
}

/** Turns the lock on or off without touching the stored MPIN. */
export async function setLockEnabledAction(enabled: boolean): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const row = await readSecurity(user.id);
  if (enabled && !row?.mpin_hash) {
    return { error: "Set an MPIN before turning the lock on." };
  }

  const { error } = await admin()
    .from("user_security")
    .update({ is_lock_enabled: enabled })
    .eq("user_id", user.id);
  if (error) return { error: friendlyError(error, "Could not change the lock.") };

  revalidatePath("/settings");
  return { success: enabled ? "App lock is on." : "App lock is off." };
}

/** How long an unlock lasts before the lock screen comes back. */
export async function setLockDurationAction(duration: string): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const { error } = await (await createClient())
    .from("user_preferences")
    .upsert({ user_id: user.id, lock_duration: duration }, { onConflict: "user_id" });
  if (error) return { error: friendlyError(error, "Could not save the setting.") };

  revalidatePath("/settings");
  return { success: "Saved." };
}

/**
 * Starts the reset flow for a locked-out MPIN.
 *
 * Deliberately goes through Supabase's own password reset rather than minting a
 * one-off token: it proves control of the mailbox, it cannot be used to take
 * over an account whose email the attacker does not hold, and it needs no new
 * table or expiry logic of its own.
 */
export async function requestMpinResetAction(email: string): Promise<SecurityState> {
  const supabase = await createClient();

  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    // The `next` is URL-encoded inside the query string, so the callback route
    // reads "/settings?reset=mpin" and not a path with a stray question mark.
    redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent("/settings?reset=mpin")}`,
  });
  if (error) return { error: friendlyError(error, "Could not send the email.") };

  // The same message either way. Saying "no account with that email" would let
  // anyone test whether an address is registered.
  return {
    success: "If that address has an account, a reset link is on its way.",
  };
}

/**
 * Clears the MPIN so a new one can be chosen.
 *
 * Called after the emailed password reset, which is how somebody who has
 * forgotten their MPIN gets back in: they prove they own the mailbox, set a
 * new password, and the app then asks for a new MPIN. The old hash has to go,
 * or "set a new MPIN" would be asking for the one they cannot remember.
 */
export async function clearMpinAfterResetAction(): Promise<SecurityState> {
  const user = await getUserOrRedirect();

  const { error } = await admin()
    .from("user_security")
    .update({
      mpin_hash: null,
      mpin_salt: null,
      mpin_set_at: null,
      failed_attempts: 0,
      locked_until: null,
    })
    .eq("user_id", user.id);

  if (error) return { error: friendlyError(error, "Could not reset your MPIN.") };

  revalidatePath("/settings");
  return { success: "Choose a new MPIN." };
}

export type { MpinValidation };
