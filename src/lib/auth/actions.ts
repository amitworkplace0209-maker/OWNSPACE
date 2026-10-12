"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth/utils";
import { validateEmail, validatePassword } from "@/lib/auth/validation";

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
async function getSiteUrl(): Promise<string> {
  const headerStore = await headers();
  const proto =
    headerStore.get("x-forwarded-proto") ??
    (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

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
  if (normalized.includes("already registered")) {
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

export async function signInAction(
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

  if (validateEmail(email)) {
    return { error: validateEmail(email) as string };
  }
  if (!password) {
    return { error: "Please enter your password." };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return { error: friendlySignInError(error?.message ?? null) };
  }

  // Session cookies for data.user are already persisted by the server client.
  try {
    await ensureUserRecord(data.user);
  } catch {
    // Non-fatal: never block sign-in on seeding (the trigger usually covers it).
  }

  const next = safeNextPath(String(formData.get("next") ?? "")) ?? "/dashboard";
  redirect(next);
}

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

  const emailError = validateEmail(email);
  if (emailError) {
    return { error: emailError };
  }

  if (displayName && displayName.length > 60) {
    return { error: "Display name must be 60 characters or fewer." };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { error: passwordError };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const emailRedirectTo = `${await getSiteUrl()}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || undefined,
      },
      emailRedirectTo,
    },
  });

  if (error || !data.user) {
    return { error: friendlySignUpError(error?.message ?? null, email) };
  }

  // Session exists only when email confirmation is disabled for the project.
  if (data.session) {
    try {
      await ensureUserRecord(data.user);
    } catch {
      // Non-fatal; the auth.users trigger already seeded the rows.
    }
    redirect("/dashboard");
  }

  return {
    success: `We’ve sent a confirmation link to ${email}. Click it to complete your sign-up, then sign in.`,
    email,
    error: undefined,
  };
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();

  // The offline caches live on the device, not on the server, so signing
  // out has to delete them explicitly. Otherwise a shared machine would open
  // the next person's session onto the previous one's task and reminder titles.
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    const [{ clearTaskCache }, { clearReminderCache }] = await Promise.all([
      import("@/lib/offline/task-cache.client"),
      import("@/lib/offline/reminder-cache.client"),
    ]);
    await clearTaskCache(data.user.id);
    await clearReminderCache(data.user.id);
  }

  await supabase.auth.signOut();
  redirect("/login");
}