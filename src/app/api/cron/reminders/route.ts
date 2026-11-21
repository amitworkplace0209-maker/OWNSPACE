import { NextResponse, type NextRequest } from "next/server";
import { processDueRemindersForUser, DUE_REMINDER_HORIZON_MS } from "@/lib/notifications/due-reminders";
import { getAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured } from "@/lib/push/vapid";
import { timingSafeEqualText } from "@/lib/security/timing-safe";

/**
 * Server-side reminder sweep for devices with the app closed.
 *
 * A browser tab can only fire its own reminders while it is open, which is why
 * web push needs something on the server to call `processDueRemindersForUser`.
 * Point any cron provider (Vercel Cron, GitHub Actions, a systemd timer) at this
 * route once a minute with `Authorization: Bearer $CRON_SECRET`.
 *
 * The secret is compared in constant time so a wrong token cannot be guessed a
 * character at a time from the timing of the response.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorised(request: NextRequest, secret: string): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  return timingSafeEqualText(header.slice(7), secret);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured on this server." },
      { status: 503 }
    );
  }
  if (!authorised(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getAdminClient();
    const horizon = new Date(Date.now() + DUE_REMINDER_HORIZON_MS).toISOString();
    const { data, error } = await supabase
      .from("reminders")
      .select("user_id")
      .eq("status", "pending")
      .eq("is_enabled", true)
      .lte("remind_at", horizon);

    if (error) {
      return NextResponse.json({ error: "Could not read due reminders." }, { status: 500 });
    }

    const userIds = [...new Set((data ?? []).map((row) => row.user_id as string))];
    let fired = 0;
    const failures: string[] = [];

    for (const userId of userIds) {
      try {
        const result = await processDueRemindersForUser({ supabase, userId });
        fired += result.count;
        if (result.error) failures.push(userId);
      } catch {
        failures.push(userId);
      }
    }

    return NextResponse.json({
      users: userIds.length,
      fired,
      failedUsers: failures,
      pushConfigured: isPushConfigured(),
    });
  } catch {
    return NextResponse.json(
      { error: "The reminder sweep could not start. Check server configuration." },
      { status: 500 }
    );
  }
}
