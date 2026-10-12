import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";

export type AppLockState = {
  is_lock_enabled: boolean;
  biometric_enabled: boolean;
  hasMpin: boolean;
  /** True when the account has never chosen a PIN — the one-time setup. */
  setup_required: boolean;
};

/**
 * Whether this account's app lock is on.
 *
 * Read in the layout, so the decision is made before anything is rendered rather
 * than after: a lock screen that fades in over a page which already holds
 * every task title and balance is not a lock.
 *
 * Fails *closed on error but open on absence* — a missing row means "no lock
 * configured", which is the right default for a feature nobody has opted into.
 * A database error also returns "no lock", because the alternative is locking
 * somebody out of their own workspace because a query timed out, and that is
 * worse than the one it protects against.
 */
export const getAppLockState = cache(async (): Promise<AppLockState> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_security")
    .select("is_lock_enabled, biometric_enabled, mpin_hash")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    return {
      is_lock_enabled: false,
      biometric_enabled: false,
      hasMpin: false,
      // No row means a brand-new account, which is exactly the case where the
      // one-time setup is owed — so absence means "not yet set up", not "skip it".
      setup_required: true,
    };
  }

  const row = data as {
    is_lock_enabled: boolean;
    biometric_enabled: boolean;
    mpin_hash: string | null;
  };

  return {
    is_lock_enabled: row.is_lock_enabled,
    biometric_enabled: row.biometric_enabled,
    hasMpin: Boolean(row.mpin_hash),
    setup_required: !row.mpin_hash,
  };
});
