import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/lib/dal";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeGDriveCode,
  fetchGDriveEmail,
  isGDriveConfigured,
} from "@/lib/gdrive";

const OAUTH_STATE_COOKIE = "gdrive_oauth_state";

/**
 * Google OAuth callback for the G Drive page.
 *
 * The state carries the address the user said they were connecting, carried as
 * `<nonce>.<random>.<expectedEmail>`. After the exchange, the account Google
 * actually authenticated is compared against it — typing an email alone cannot
 * grant access to someone else's Drive, so a mismatch is refused rather than
 * quietly connecting whichever account happened to be signed in.
 */
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const redirectTo = (params: URLSearchParams) => {
    const url = new URL("/gdrive", origin);
    for (const [key, value] of params) url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };

  if (!isGDriveConfigured()) {
    return redirectTo(new URLSearchParams({ error: "not_configured" }));
  }

  const { searchParams } = new URL(request.url);

  if (searchParams.get("error")) {
    return redirectTo(new URLSearchParams({ error: "denied" }));
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  const state = searchParams.get("state");

  if (!expectedState || !state || expectedState !== state) {
    return redirectTo(new URLSearchParams({ error: "state_mismatch" }));
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectTo(new URLSearchParams({ error: "no_code" }));
  }

  const expectedEmail = expectedState.split(".")[2] ?? "";

  try {
    const user = await getUser();
    // The callback arrives from Google, not our app shell — no active session
    // means the user should sign in first, then reconnect.
    if (!user) {
      cookieStore.delete(OAUTH_STATE_COOKIE);
      return NextResponse.redirect(new URL("/login?next=/gdrive", origin));
    }

    const tokens = await exchangeGDriveCode(code, origin);
    const accountEmail = await fetchGDriveEmail(tokens.accessToken);

    if (!accountEmail) {
      cookieStore.delete(OAUTH_STATE_COOKIE);
      return redirectTo(new URLSearchParams({ error: "no_email" }));
    }

    // The user asked for one address and Google authenticated another. Storing
    // it anyway would be the worst outcome: it would look correct and expose
    // the wrong Drive.
    if (expectedEmail && accountEmail !== expectedEmail.toLowerCase()) {
      cookieStore.delete(OAUTH_STATE_COOKIE);
      const url = new URL("/gdrive", origin);
      url.searchParams.set("error", "email_mismatch");
      url.searchParams.set("expected", expectedEmail);
      url.searchParams.set("actual", accountEmail);
      return NextResponse.redirect(url);
    }

    // Without a refresh token we cannot mint access tokens later, so refuse to
    // persist a connection that would appear "connected" but never work.
    if (!tokens.refreshToken) {
      cookieStore.delete(OAUTH_STATE_COOKIE);
      return redirectTo(new URLSearchParams({ error: "no_refresh" }));
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    // Upsert on the (user, account) pair rather than user alone — the old key
    // meant a second account silently replaced the first.
    const { error } = await supabase
      .from("gdrive_connections")
      .upsert(
        {
          user_id: user.id,
          account_email: accountEmail,
          email: accountEmail,
          refresh_token: tokens.refreshToken,
          access_token: tokens.accessToken,
          scope: tokens.scope,
          expires_at: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
          status: "active",
          last_error: null,
          last_connected_at: now,
          connected_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,account_email" }
      );

    cookieStore.delete(OAUTH_STATE_COOKIE);

    if (error) {
      // 23505 means this account is already connected under a row we failed to
      // find — most likely a race between two consent tabs.
      if (error.code === "23505") {
        return redirectTo(new URLSearchParams({ connected: "1", account: accountEmail }));
      }
      return redirectTo(new URLSearchParams({ error: "store_failed" }));
    }

    const url = new URL("/gdrive", origin);
    url.searchParams.set("connected", "1");
    url.searchParams.set("account", accountEmail);
    return NextResponse.redirect(url);
  } catch (error) {
    // Previously swallowed into a generic "exchange_failed", which hid the
    // difference between a misconfigured client and a bad grant.
    const message = error instanceof Error ? error.message : "Unknown error";
    cookieStore.delete(OAUTH_STATE_COOKIE);
    return redirectTo(
      new URLSearchParams({ error: "exchange_failed", detail: message.slice(0, 200) })
    );
  }
}