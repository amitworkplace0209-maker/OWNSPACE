/**
 * Guards a `next` redirect target so we never redirect to an external host or
 * back into the auth flow (which would loop). Accepts only same-origin relative
 * paths like `/tasks` or `/dashboard`.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  // Absolute URLs (http://…, //host/path) must not be followed.
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  // Auth routes are never a valid post-auth destination.
  if (
    value === "/login" ||
    value.startsWith("/login/") ||
    value === "/signup" ||
    value.startsWith("/signup/") ||
    value.startsWith("/auth")
  ) {
    return null;
  }

  return value;
}