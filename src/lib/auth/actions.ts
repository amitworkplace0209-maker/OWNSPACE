"use server";

import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { safeNextPath } from "@/lib/auth/utils";
import { validateEmail, validatePassword } from "@/lib/auth/validation";
import { getSiteUrl } from "@/lib/auth/site-url";
import { grantUnlock } from "@/lib/auth/unlock-grant.server";
import {
  findAccountByEmail,
  GENERIC_SIGN_IN_ERROR,
  isEmailConfirmed,
  openSessionForAccount,
  readSignInLock,
  recordFailedSignIn,
  recordSuccessfulSignIn,
  signInLockoutMessage,
  verifyAccountMpin,
} from "@/lib/auth/mpin-signin";
import { hashMpinWithSalt, validateMpin } from "@/lib/security/mpin";

export type AuthState = {
  error?: string;
  success?: string;
  email?: string;
};

function requireFormValue(formData: FormData, name: string): string {
  const value = String(formData.get(name) ?? "").trim();
  if (!value) {
    throw new Error("MISSING");
  }
  return value;
}

/** Best-effort origin of the current request, used for Supabase redirects. */

/**
 * Idempotently creates the current user's profile + preferences rows using the
 * cookie-authenticated (anon-key) client, so the writes go through (and are
 * checked by) the existing RLS owner policies. Rows are usually already created
 * by the public.handle_new_user() trigger — this is the in-app safety net for
 * pre-existing accounts and trigger-less paths.
 */
export async function ensureUserRecord(user: User): Promise<void> {
  const supabase = await createClient();

  const displayName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name
      : null;

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { id: user.id, display_name: displayName },
      { onConflict: "id", ignoreDuplicates: true }
    );

  const { error: preferencesError } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  if (profileError || preferencesError) {
    throw new Error(
      `Could not initialize account record (profile: ${profileError?.message}, preferences: ${preferencesError?.message})`
    );
  }
}

function friendlySignInError(message: string | null): string {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (normalized.includes("not confirmed") || normalized.includes("email not confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (normalized.includes("locked") || normalized.includes("too many requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  return "Something went wrong while signing in. Please try again.";
}

function friendlySignUpError(message: string | null, email: string): string {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return `An account for ${email} already exists. Try signing in instead.`;
  }
  if (normalized.includes("signups not allowed") || normalized.includes("signup not allowed")) {
    return "New sign-ups are currently disabled for this workspace.";
  }
  if (normalized.includes("password should be at least")) {
    return "Password must be at least 6 characters long.";
  }
  return "Something went wrong while creating your account. Please try again.";
}

/**
 * Signs in with an email address and an MPIN.
 *
 * The MPIN is the app's own credential, so the check happens here rather than
 * in Supabase Auth — see `lib/auth/mpin-signin.ts` for how the session is
 * opened afterwards. The rules that matter:
 *
 *  - **One message for every wrong credential.** An address that does not
 *    exist, an account with no MPIN, and a wrong MPIN all read the same, so
 *    the form cannot be used to find out who has an account here.
 *  - **The same time for every wrong credential.** A missing account is not
 *    rejected instantly; it spends the same time hashing that a real check
 *    would, because a fast rejection is a free test.
 *  - **A lockout after six tries.** The MPIN is short by design — it has to be
 *    typeable on a phone keypad — so guessing it has to be slow.
 */
export async function signInAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  let email = "";
  let mpin = "";

  try {
    email = requireFormValue(formData, "email").toLowerCase();
  } catch {
    return { error: "Please enter your email address." };
  }

  mpin = String(formData.get("mpin") ?? "").trim();

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };
  if (!mpin) return { error: "Enter your MPIN." };

  const row = await findAccountByEmail(email);
  const now = Date.now();

  // Locked out: spend the verification time anyway, so the wait is the same
  // as a wrong guess and cannot be used to tell the two apart.
  const lock = readSignInLock(
    row ?? { signin_locked_until: null },
    now
  );
  if (lock.locked && lock.until) {
    await verifyAccountMpin(row, mpin);
    return { error: signInLockoutMessage(lock.until, now) };
  }

  const correct = await verifyAccountMpin(row, mpin);

  if (!row || !correct) {
    if (row) {
      await recordFailedSignIn(row.user_id, row.signin_failed_attempts);
    }
    return { error: GENERIC_SIGN_IN_ERROR };
  }

  // The address has to have been confirmed. An MPIN sign-in does not go
  // through the emailed link, so without this an account that never proved it
  // owns its mailbox could still be opened by anybody who guessed the MPIN.
  if (!(await isEmailConfirmed(row.user_id))) {
    return {
      error: "Confirm your email address first — the link we sent you is still waiting.",
    };
  }

  await recordSuccessfulSignIn(row.user_id);

  // The MPIN has just been proved, so the workspace does not ask for it again
  // the moment it opens. The ticket is spent by the lock gate and deleted, so
  // closing the app locks it as promised.
  await grantUnlock(row.user_id);

  const session = await openSessionForAccount(email);
  if (!session.ok) return { error: session.error };

  // The account found by email and the account the session belongs to must be
  // the same one. They always are; this is the check that says so out loud.
  if (session.user.id !== row.user_id) {
    await (await createClient()).auth.signOut();
    return { error: "Something went wrong while signing in. Please try again." };
  }

  try {
    await ensureUserRecord(session.user);
  } catch {
    // Non-fatal: the auth.users trigger already seeded the rows.
  }

  const next = safeNextPath(String(formData.get("next") ?? "")) ?? "/dashboard";
  redirect(next);
}

/**
 * Signs in with the account password instead of the MPIN.
 *
 * The escape hatch, not the front door: it exists for the person who has
 * forgotten their MPIN, and for the moment between a password reset and
 * choosing a new MPIN. Everything else uses the MPIN.
 */
export async function signInWithPasswordAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  let email = "";
  let password = "";

  try {
    email = requireFormValue(formData, "email").toLowerCase();
    password = String(formData.get("password") ?? "");
  } catch {
    return { error: "Please enter your email and password." };
  }

  const emailError = validateEmail(email);
  if (emailError) return { error: emailError };
  if (!password) return { error: "Please enter your password." };

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: friendlySignInError(error?.message ?? null) };
  }

  try {
    await ensureUserRecord(data.user);
  } catch {
    // Non-fatal: never block sign-in on seeding (the trigger usually covers it).
  }

  const next = safeNextPath(String(formData.get("next") ?? "")) ?? "/dashboard";
  redirect(next);
}

/**
 * Creates an account.
 *
 * Four things are asked for: a name, an email address, a password and an MPIN.
 * The password is the account's recovery secret — it is what the reset email
 * changes — and the MPIN is the one the app asks for every time it opens, and
 * the one the sign-in form accepts in place of the password.
 *
 * The MPIN is hashed on the server, with scrypt, and written to the account's
 * security row with the service role. The service role is needed because at
 * this point there may be no session at all: when the project asks for email
 * confirmations, the account exists but nobody is signed in yet, and the row
 * still has to be written. The MPIN never travels any further than this
 * request, and it is never stored in the clear.
 */
export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  let email = "";
  try {
    email = requireFormValue(formData, "email").toLowerCase();
  } catch {
    return { error: "Please enter your email address." };
  }

  const displayName = String(formData.get("display_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  const mpin = String(formData.get("mpin") ?? "").trim();
  const confirmMpin = String(formData.get("confirm_mpin") ?? "").trim();

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  if (!displayName) {
    return { error: "Tell us your name." };
  }

  if (displayName.length > 60) {
    return { error: "Name must be 60 characters or fewer." };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const mpinCheck = validateMpin(mpin);
  if (!mpinCheck.ok) {
    return { error: mpinCheck.error };
  }

  if (mpin !== confirmMpin) {
    return { error: "The two MPINs do not match." };
  }

  const supabase = await createClient();
  const emailRedirectTo = `${await getSiteUrl()}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
      },
      emailRedirectTo,
    },
  });

  if (error || !data.user) {
    return { error: friendlySignUpError(error?.message ?? null, email) };
  }

  const userId = data.user.id;
  const accountEmail = (data.user.email ?? email).toLowerCase();

  // The MPIN, hashed. scrypt with a fresh salt per account, so two people who
  // pick the same PIN do not share a digest and a stolen table cannot be
  // attacked with one precomputed set of a million candidates.
  const { hash, salt } = await hashMpinWithSalt(mpin);

  const admin = getAdminClient();
  const { error: securityError } = await admin.from("user_security").upsert(
    {
      user_id: userId,
      email: accountEmail,
      mpin_hash: hash,
      mpin_salt: salt,
      mpin_set_at: new Date().toISOString(),
      // On from the start: the user chose an MPIN precisely so the app would
      // ask for it, and making them find a switch afterwards is how a lock
      // stays off forever.
      is_lock_enabled: true,
      failed_attempts: 0,
      locked_until: null,
      signin_failed_attempts: 0,
      signin_locked_until: null,
      // The MPIN was just proved, so the workspace does not ask for it again
      // the moment it opens.
      last_unlocked_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (securityError) {
    return {
      error:
        "Your account was created, but your MPIN could not be saved. Sign in and set it again in Settings.",
    };
  }

  // Session exists only when email confirmation is disabled for the project.
  if (data.session) {
    try {
      await ensureUserRecord(data.user);
    } catch {
      // Non-fatal; the auth.users trigger already seeded the rows.
    }
    // The MPIN was just chosen, so the workspace does not ask for it again the
    // moment it opens.
    await grantUnlock(userId);
    redirect("/dashboard");
  }

  return {
    success: `We’ve sent a confirmation link to ${email}. Click it to finish, then sign in with your MPIN.`,
    email,
    error: undefined,
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();

  // The device's own copy of this account — the offline caches, the derived
  // MPIN, the device PIN and the fingerprint enrolment — is deleted by
  // `signOutOnDevice`, in the browser. It cannot be done here: those live in
  // IndexedDB and localStorage, and a server action runs where neither
  // exists. See `lib/auth/sign-out.client.ts`.
  await supabase.auth.signOut();
  redirect("/login");
}
