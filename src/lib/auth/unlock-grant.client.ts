"use client";

/**
 * The browser half of the unlock ticket.
 *
 * The ticket is written by the sign-in action and read by the app layout, both
 * on the server. This is the part that *uses* it: once the lock gate has
 * swapped the ticket for the ordinary unlock token, the ticket has to go, or
 * it would keep saying "this session just proved the MPIN" and the app would
 * open without the MPIN after every restart inside its two-minute life.
 */

const GRANT_COOKIE = "ownspece_unlock_grant";

/**
 * Deletes the ticket.
 *
 * Done from JavaScript, so the cookie must not be `httpOnly` — which is fine,
 * because the ticket is a user id and a timestamp, not a secret.
 */
export function clearUnlockGrant(): void {
  if (typeof document === "undefined") return;

  document.cookie = `${GRANT_COOKIE}=; path=/; max-age=0; samesite=lax`;
}
