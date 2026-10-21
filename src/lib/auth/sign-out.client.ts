"use client";

import { signOutAction } from "@/lib/auth/actions";
import { clearLocalMpin } from "@/lib/security/local-mpin.client";
import { clearDeviceUnlock } from "@/lib/security/device-unlock.client";
import { clearTaskCache } from "@/lib/offline/task-cache.client";
import { clearReminderCache } from "@/lib/offline/reminder-cache.client";
import { clearShell } from "@/lib/offline/shell-client";
import { clearRowCache } from "@/lib/offline/row-cache.client";

/**
 * Signing out, with the device's own copy of the account cleaned up.
 *
 * Why this is a client function and not part of the server action
 * ----------------------------------------------------------------
 * Everything that has to be deleted on sign-out lives on the *device*:
 * the offline copies of tasks, reminders, notes and rendered pages in
 * IndexedDB, and the derived secrets in localStorage. A server action runs on
 * the server, where `indexedDB` and `window` do not exist — so a cleanup
 * written there deletes nothing at all, and the next person to open the app
 * on a shared machine sees the previous one's task titles.
 *
 * It used to be written there, and it silently did nothing. The wipe has to
 * happen here, in the tab that is signing out, before the session goes.
 */
export async function signOutOnDevice(userId: string): Promise<void> {
  await Promise.all([
    clearTaskCache(userId),
    clearReminderCache(userId),
    clearShell(userId),
    // Last of the offline ones: it deletes by key prefix across every entity,
    // so it would also clear the two above.
    clearRowCache(userId),
  ]);

  // The secrets that stay usable with no connection at all. These are the
  // ones a person borrowing a logged-in laptop could otherwise read straight
  // out of storage — and the fingerprint enrolment, which would let them
  // unlock the app with the last owner's finger.
  clearLocalMpin(userId);
  clearDeviceUnlock(userId);

  await signOutAction();
}
