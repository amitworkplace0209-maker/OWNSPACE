import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ActivityType, NotificationType } from "@/types";

/**
 * Inserts a row into public.activities (append-only feed). Called from server
 * actions with the authenticated user id (never a client-supplied user id).
 * RLS scopes the write to auth.uid(), so the identity is still verified by the
 * database.
 */
export async function logActivity(input: {
  userId: string;
  projectId?: string | null;
  activityType: ActivityType;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("activities").insert({
      user_id: input.userId,
      project_id: input.projectId ?? null,
      activity_type: input.activityType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      summary: input.summary,
      metadata: input.metadata ?? null,
    });
  } catch {
    // Activity logging is best-effort and must never break the primary action.
  }
}

/**
 * Inserts an in-app notification. Only called for meaningful events (e.g. a
 * due reminder) — never to fabricate content.
 */
export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("notifications").insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    });
  } catch {
    // Best-effort: notifications must never break the triggering action.
  }
}