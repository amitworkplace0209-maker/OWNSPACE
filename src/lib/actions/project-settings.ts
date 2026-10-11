"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { cardStyles } from "@/config/appearance";
import {
  CURRENCIES,
  PRIORITIES,
  PROJECT_CATEGORIES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type Currency,
  type Priority,
  type ProjectCategory,
  type ProjectOptions,
  type ProjectStatus,
  type ProjectType,
} from "@/types";

export type ProjectSettingsResult = {
  error?: string;
  warnings?: string[];
};

type SettingsInput = {
  id: string;
  name: string;
  title: string;
  description: string;
  category: ProjectCategory;
  projectType: ProjectType;
  status: ProjectStatus;
  priority: Priority;
  icon: string;
  color: string;
  cardStyle: string;
  startDate: string;
  dueDate: string;
  timezone: string;
  currency: Currency;
  budget: string;
  options: ProjectOptions;
};

function text(value: string, max: number): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Updates the editable project fields and records what changed.
 *
 * The diff is computed against the row as it was read, so `project_history`
 * stores only the keys that actually differ. Writing a blanket "before" and
 * "after" of the whole row would make the History tab useless — every entry
 * would claim all twenty fields changed.
 */
export async function updateProjectSettingsAction(
  input: SettingsInput
): Promise<ProjectSettingsResult> {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) return { error: "Project name is required." };
  if (name.length > 200) return { error: "Project name must be under 200 characters." };

  if (input.startDate && input.dueDate && input.dueDate < input.startDate) {
    return { error: "Due date must be on or after the start date." };
  }

  const budget = input.budget.trim() === "" ? null : Number(input.budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    return { error: "Budget must be zero or more." };
  }

  if (input.color && !/^#[0-9a-fA-F]{6}$/.test(input.color)) {
    return { error: "Pick a valid colour." };
  }

  const next = {
    name,
    title: text(input.title, 200),
    description: text(input.description, 2000),
    category: oneOf(input.category, PROJECT_CATEGORIES, "other"),
    project_type: oneOf(input.projectType, PROJECT_TYPES, "other"),
    status: oneOf(input.status, PROJECT_STATUSES, "active"),
    priority: oneOf(input.priority, PRIORITIES, "none"),
    icon: text(input.icon, 50),
    color: input.color || null,
    card_style: oneOf(input.cardStyle, cardStyles.map((style) => style.id), "default"),
    start_date: input.startDate || null,
    due_date: input.dueDate || null,
    timezone: text(input.timezone, 80) ?? "UTC",
    currency: oneOf(input.currency, CURRENCIES, "INR"),
    budget,
    options: input.options,
  };

  const { data: current, error: readError } = await supabase
    .from("projects")
    .select(
      "name, title, description, category, project_type, status, priority, icon, color, card_style, start_date, due_date, timezone, currency, budget, options"
    )
    .eq("id", input.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (readError || !current) return { error: "Project not found." };

  const { data: updated, error } = await supabase
    .from("projects")
    .update(next)
    .eq("id", input.id)
    .eq("user_id", user.id)
    .select("id")
    .single();

  if (error || !updated) {
    return { error: friendlyError(error, "Could not update the project.") };
  }

  // Options are an object; compare their JSON so a no-op toggle is not logged.
  const changed = Object.fromEntries(
    Object.entries(next).filter(([key, value]) => {
      const before = (current as Record<string, unknown>)[key];
      if (key === "options") {
        return JSON.stringify(before ?? {}) !== JSON.stringify(value ?? {});
      }
      return before !== value;
    })
  );

  const historyEnabled = input.options?.history_enabled ?? true;
  const changedKeys = Object.keys(changed);

  if (historyEnabled && changedKeys.length > 0) {
    await supabase.from("project_history").insert({
      user_id: user.id,
      project_id: input.id,
      entity_type: "project",
      entity_id: input.id,
      action: "updated",
      old_value: Object.fromEntries(
        changedKeys.map((key) => [key, (current as Record<string, unknown>)[key]])
      ),
      new_value: Object.fromEntries(changedKeys.map((key) => [key, changed[key]])),
      summary: `Updated ${changedKeys.join(", ").replace(/_/g, " ")}`,
    });
  }

  revalidatePath(`/projects/${input.id}`);
  revalidatePath("/projects");

  return {
    warnings:
      changedKeys.length === 0 ? ["Nothing changed — no history entry was recorded."] : undefined,
  };
}