"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/actions/helpers";
import { validateEmail } from "@/lib/auth/validation";
import { getSiteUrl } from "@/lib/auth/site-url";

export type ResetState = {
  error?: string;
  success?: string;
};

/**
 * Sends a password-reset email.
 *
 * The success message is deliberately the same whether or not the address has an
 * account. Saying "no account with that email" would turn this form into a free
 * oracle for testing whether somebody uses Ownspece, which is a small leak but a
 * real one, and it costs nothing to avoid.
 *
 * The redirect lands on `/auth/callback`, which already exchanges the code for a
 * session — the same path the confirmation email uses, so there is only one place
 * that has to know how a Supabase link becomes a logged-in session.
 */
export async function requestPasswordResetAction(
  _prevState: ResetState,
  formData: FormData
): Promise<ResetState> {
  const raw = String(formData.get("email") ?? "").trim().toLowerCase();

  const emailError = validateEmail(raw);
  if (emailError) return { error: emailError };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(raw, {
    redirectTo: `${await getSiteUrl()}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
  });

  if (error) {
    // Surfaced rather than swallowed: a misconfigured site URL or a rate limit
    // are things the user can act on, and a permanently "sent" message that never
    // arrives is the worst possible answer.
    return { error: friendlyError(error, "Could not send the reset email.") };
  }

  return {
    success: `If an account exists for ${raw}, a reset link is on its way.`,
  };
}