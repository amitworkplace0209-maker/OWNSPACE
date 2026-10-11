import "server-only";

import { createClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/dal";
import { getSupabaseEnv } from "@/lib/supabase/env";
import type { User } from "@supabase/supabase-js";

/** Consistent shape for server action results consumed by client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Returns the authenticated user or redirects to /login (server action safe). */
export async function getUserOrRedirect(): Promise<User> {
  return requireUser();
}

/** The shape Supabase returns for a database/RLS/storage failure. */
type SupabaseErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function isSupabaseError(error: unknown): error is SupabaseErrorLike {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as SupabaseErrorLike).message === "string"
  );
}

/**
 * Map a database failure to a message a user can act on.
 *
 * Supabase returns a plain `{ message, code, ... }` object, not an `Error`.
 * The old `instanceof Error` check therefore never matched, so every single
 * database failure across the app collapsed into the generic fallback string —
 * which is why "the project was not created" came with no explanation at all.
 *
 * The raw Postgres text is now surfaced, plus a hint for the two failures that
 * have an obvious fix.
 */
export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
    throw error;
  }

  const raw: string | undefined =
    error instanceof Error ? error.message : isSupabaseError(error) ? error.message : "";

  const message = (raw ?? "").trim() || fallback;

  // A missing column almost always means the migrations have not been applied.
  if (/column .* does not exist/i.test(message) || /relation .* does not exist/i.test(message)) {
    return `${message} — the database schema is out of date. Run \`npm run db:migrate\`.`;
  }

  // RLS rejections are a bug, not a user error; say so rather than leaking SQL.
  if (/row-level security|violates row-level security policy/i.test(message)) {
    return "Permission denied by the database's security policy.";
  }

  return message;
}

/**
 * Creates a Supabase client with the service role key, bypassing RLS.
 * Use this for server-side writes that must succeed regardless of row-level
 * security policies (e.g. updating user preferences).
 */
export async function createAdminClient() {
  const { url, anonKey } = getSupabaseEnv();
  // Fallback to service role for writes that bypass RLS.
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? anonKey;
  return createClient(url, secret);
}