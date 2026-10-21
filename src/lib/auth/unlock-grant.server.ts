import "server-only";

import { cookies } from "next/headers";

/**
 * The one-shot ticket that lets the workspace open without asking for the
 * MPIN a second time.
 *
 * The problem it solves
 * ---------------------
 * The MPIN is both the sign-in credential and the app lock. Sign in with it,
 * and the workspace would immediately ask for it again — two secrets in a row
 * for one door, which is the exact friction that makes people turn a lock off.
 *
 * So the sign-in writes a ticket. The app layout reads it and tells the lock
 * gate "this session has just proved the MPIN", and the gate swaps the ticket
 * for the ordinary unlock token. The ticket is deleted the moment it is used,
 * which is what keeps the promise the lock makes: **closing the app locks it,
 * even if you open it again five seconds later.**
 *
 * Why a cookie and not a database column
 * --------------------------------------
 * A cookie is consumed by being read, and it disappears on its own. A column
 * would have to be cleared by another round trip, and would sit there being a
 * "recently signed in" fact long after it stopped being one. The cookie's
 * lifetime is the whole story: a minute, and then it is gone.
 *
 * It is not a secret. It carries a user id and a timestamp, and it is read by
 * JavaScript on purpose, so it is not `httpOnly`.
 */
export const UNLOCK_GRANT_COOKIE = "ownspece_unlock_grant";

/** How long the ticket is worth. Long enough for the redirect, not longer. */
export const UNLOCK_GRANT_MAX_AGE = 120;

/** How long the ticket is accepted after it was written. */
export const UNLOCK_GRANT_WINDOW_MS = 60_000;

function encodeGrant(userId: string, at: number): string {
  return `${userId}:${at}`;
}

/**
 * Writes the ticket for a session that has just proved the MPIN.
 *
 * Called by the sign-in action, after the MPIN has been checked.
 */
export async function grantUnlock(userId: string): Promise<void> {
  const store = await cookies();

  store.set(UNLOCK_GRANT_COOKIE, encodeGrant(userId, Date.now()), {
    path: "/",
    maxAge: UNLOCK_GRANT_MAX_AGE,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Whether this request carries a live ticket for this account.
 *
 * Read on the server so the very first paint already knows: a lock screen that
 * appears for a frame and then vanishes is worse than one that never appears.
 */
export async function hasUnlockGrant(userId: string): Promise<boolean> {
  const store = await cookies();
  const raw = store.get(UNLOCK_GRANT_COOKIE)?.value;
  if (!raw) return false;

  const separator = raw.lastIndexOf(":");
  if (separator < 0) return false;

  const id = raw.slice(0, separator);
  const at = Number(raw.slice(separator + 1));

  if (id !== userId) return false;
  if (!Number.isFinite(at)) return false;
  if (Date.now() - at > UNLOCK_GRANT_WINDOW_MS) return false;

  return true;
}
