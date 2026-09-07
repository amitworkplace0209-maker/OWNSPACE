import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  }

  return NextResponse.redirect(`${origin}${next ?? "/dashboard"}`);
}