import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { ensureUserRecord } from "@/lib/auth/actions";
import { safeNextPath } from "@/lib/auth/utils";

/**
 * OAuth / email-link callback. Exchanges the `code` for a session (PKCE SSO),
 * seeds the user's profile/preferences as a safety net, then redirects to the
 * requested (sanitized) destination, defaulting to /dashboard.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const failure = searchParams.get("error");
  if (!code || failure) {
    const errorCode = failure ?? "missing_code";
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorCode)}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    try {
      await ensureUserRecord(user);
    } catch {
      // Non-fatal; the auth.users trigger has already seeded the rows.
    }

    // The MPIN reset. The link that arrives here proves control of the
    // mailbox, and the person asking for it has forgotten the number the app
    // asks for — so the stored hash has to go, or "choose a new MPIN" would be
    // asking for the one they cannot remember.
    //
    // The hash is cleared, never replaced: the account's own MPIN has to be
    // chosen by the person who owns it, on a device they are holding.
    if (next && next.includes("reset=mpin")) {
      try {
        await getAdminClient()
          .from("user_security")
          .update({
            mpin_hash: null,
            mpin_salt: null,
            mpin_set_at: null,
            failed_attempts: 0,
            locked_until: null,
          })
          .eq("user_id", user.id);
      } catch {
        // Non-fatal: the settings panel can still clear it by hand.
      }
    }
  }

  return NextResponse.redirect(`${origin}${next ?? "/dashboard"}`);
}
