import "server-only";

import { requireUser } from "@/lib/dal";
import type { User } from "@supabase/supabase-js";

/** Consistent shape for server action results consumed by client forms. */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

/** Returns the authenticated user or redirects to /login (server action safe). */
export async function getUserOrRedirect(): Promise<User> {
  return requireUser();
}

/** Re-throw expected redirects cleanly; map unexpected errors to a friendly message. */
export function friendlyError(error: unknown, fallback: string): string {
  if (error instanceof Error && (error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
    throw error;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}