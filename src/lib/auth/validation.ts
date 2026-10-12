/**
 * Shared auth validation.
 *
 * Its own module rather than exported from `auth/actions.ts` because that file is
 * `"use server"`, and Next requires *every* export of such a file to be an async
 * function it can turn into an RPC. A synchronous `validateEmail` exported from
 * there is a build error, not a style complaint — so validation lives here and
 * both the actions and anything else that needs it import from here.
 */

/**
 * Deliberately loose.
 *
 * The only thing that can say an address is deliverable is delivering a message to
 * it. This pattern exists to catch typos (`ada@`, `@gmail.com`, a name pasted
 * where the address goes) — the three mistakes that actually happen — and to do it
 * before a round trip. Anything stricter rejects real addresses: plus tags, long
 * TLDs and the many forms a mail server accepts that this regex would not.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns an error message, or null when the address is well-formed. */
export function validateEmail(email: string): string | null {
  const value = email.trim().toLowerCase();
  if (!value) return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return null;
}

/**
 * Returns an error message, or null.
 *
 * Six characters is a floor chosen to make a known-password-spray attack across
 * many accounts expensive, not to make a password strong. Eight would be better
 * advice, but enforcing it here locks out people who already have a working
 * password set up, and that is a bad trade to make inside a sign-up form.
 */
export function validatePassword(password: string): string | null {
  if (!password) return "Choose a password.";
  if (password.length < 6) return "Password must be at least 6 characters long.";
  return null;
}