import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { Profile, UserPreferences } from "@/types";

/**
 * Returns the current authenticated Supabase user, or null.
 * Uses React cache() so the result is memoized during a render pass.
 */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
});

/**
 * Returns the current authenticated user, redirecting to /login
 * when there is no valid session.
 */
export const requireUser = cache(async (): Promise<User> => {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
});

/**
 * Returns the current user's public.profiles row (memoized per render pass).
 * Reads go through RLS, so only the owner's own row is ever visible.
 */
export const getProfile = cache(
  async (userId: string): Promise<Profile | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as Profile;
  }
);

export const getPreferences = cache(
  async (userId: string): Promise<UserPreferences | null> => {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return data as UserPreferences;
  }
);