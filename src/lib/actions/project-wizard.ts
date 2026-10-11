"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getUserOrRedirect, friendlyError } from "@/lib/actions/helpers";
import { parseWizardPayload, type ProjectWizardPayload } from "@/lib/schemas/project-wizard";
import { wizardSchemaProblem } from "@/lib/wizard-schema";
import {
  computeChecklistProgress,
  parseTags,
  summarizeDraft,
  type ProjectDraft,
} from "@/lib/project-wizard";
import { logActivity } from "@/lib/activity";
import type { ProjectDetails, ProjectOptions } from "@/types";

export type WizardActionState = {
  error?: string;
  /** Present on success; the caller redirects to this project. */
  projectId?: string;
  /** Non-fatal problems worth showing but not blocking the save. */
  warnings?: string[];
};

type Insert = Record<string, unknown>;

/**
 * Creates a whole project from the 12-step wizard in one server action.
 *
 * Why one action rather than twelve: the wizard's steps are not independent —
 * a task can point at a structure node, a checklist at a task, a reminder at a
 * checklist. Saving per step would either leave the project half-created or
 * require the client to resolve parent ids itself. Here the server resolves
 * every client-generated key to a real uuid in dependency order, so the tree is
 * correct regardless of the order the user filled the steps in.
 *
 * Steps that fail do not roll the project back, because Supabase's REST client
 * has no transaction spanning tables. Instead every failure is collected and
 * returned as a warning: the project and whatever did save are real, and the
 * user is told exactly what did not.
 */
export async function createProjectWizardAction(
  _prevState: WizardActionState,
  input: FormData | string | unknown
): Promise<WizardActionState> {
  const user = await getUserOrRedirect();

  // Called from a <form action>, so the payload arrives inside FormData. Called
  // programmatically it is the JSON string directly.
  const raw =
    input instanceof FormData ? (input.get("payload") ?? null) : input;

  const parsed = parseWizardPayload(raw);
  if (!parsed.data) return { error: parsed.error };

  const payload = parsed.data;
  const supabase = await createClient();
  const warnings: string[] = [];

// ---------------------------------------------------------------------
  // Re-validate on the server with the shared pure rules. The Zod schema
  // checks shape; these check cross-field rules (dates, cycles, references).
  // ---------------------------------------------------------------------
  const blocking = serverSideChecks(payload);
  if (blocking.length > 0) return { error: blocking[0] };

  // ---------------------------------------------------------------------
  // Preflight the schema. Without this, an un-migrated database fails deep in
  // the insert chain with a raw "column does not exist" that looks like the
  // user's fault.
  // ---------------------------------------------------------------------
  const schemaProblem = await wizardSchemaProblem();
  if (schemaProblem) return { error: schemaProblem };

  // ---------------------------------------------------------------------
  // Tags — resolve names to ids, creating any that do not exist yet.
  // ---------------------------------------------------------------------
  const tagIds = await resolveTags(supabase, user.id, parseTags(payload.tags));

  // ---------------------------------------------------------------------
  // 1. The project itself.
  // ---------------------------------------------------------------------
  const checklistProgress = computeChecklistProgress(
    payload.checklists.flatMap((checklist) => checklist.items)
  );
  const taskCount = payload.tasks.length;
  const doneTasks = payload.tasks.filter((task) => task.status === "done").length;
  const initialProgress =
    payload.checklists.length > 0
      ? checklistProgress
      : taskCount > 0
        ? Math.round((doneTasks / taskCount) * 100)
        : 0;

  const projectRow: Insert = {
    user_id: user.id,
    name: payload.name,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    project_type: payload.projectType,
    status: payload.status,
    priority: payload.priority,
    progress: initialProgress,
    start_date: payload.startDate,
    due_date: payload.dueDate,
    icon: payload.icon,
    color: payload.color,
    card_style: payload.cardStyle,
    is_favorite: payload.isFavorite,
    is_pinned: payload.isPinned,
    timezone: payload.timezone,
    currency: payload.currency,
    budget: payload.budget,
    banner_path: payload.bannerName,
    logo_path: payload.logoName,
    details: cleanDetails(payload.details) as ProjectDetails,
    options: toProjectOptions(payload.options) as ProjectOptions,
  };

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert(projectRow)
    .select("id")
    .single();

  if (projectError || !project) {
    return { error: friendlyError(projectError, "Could not create the project.") };
  }

  const projectId = project.id as string;

  if (tagIds.length > 0) {
    const { error: tagError } = await supabase
      .from("project_tags")
      .insert(tagIds.map((tag_id) => ({ user_id: user.id, project_id: projectId, tag_id })));
    if (tagError) warnings.push("Tags could not be attached to the project.");
  }

  // ---------------------------------------------------------------------
  // 2. Structure nodes — depth first so a parent always exists before its
  //    children reference it.
  // ---------------------------------------------------------------------
  const nodeIds = new Map<string, string>();

  for (const level of topologicalLevels(payload.nodes)) {
    const rows: Insert[] = [];
    const pending: Array<{ key: string; row: Insert }> = [];

    for (const [index, node] of level.entries()) {
      const parentId = node.parentKey ? (nodeIds.get(node.parentKey) ?? null) : null;
      if (node.parentKey && !parentId) {
        warnings.push(`"${node.title}" was skipped: its parent could not be resolved.`);
        continue;
      }

      const row: Insert = {
        user_id: user.id,
        project_id: projectId,
        parent_id: parentId,
        node_type: node.nodeType,
        title: node.title,
        description: node.description,
        notes: node.notes,
        status: node.status,
        priority: node.priority,
        start_date: node.startDate,
        due_date: node.dueDate,
        sort_order: index,
      };
      pending.push({ key: node.key, row });
      rows.push(row);
    }

    if (rows.length === 0) continue;

    const { data: inserted, error: nodeError } = await supabase
      .from("project_nodes")
      .insert(rows)
      .select("id");

    if (nodeError) {
      warnings.push("Some structure items could not be saved.");
      continue;
    }

    // supabase returns rows in insert order, so index i belongs to rows[i].
    (inserted ?? []).forEach((row, index) => {
      const match = pending[index];
      if (match && row?.id) nodeIds.set(match.key, row.id as string);
    });
  }

  // ---------------------------------------------------------------------
  // 3. Milestones.
  // ---------------------------------------------------------------------
  if (payload.milestones.length > 0) {
    const milestoneRows: Insert[] = payload.milestones.map((milestone) => ({
      user_id: user.id,
      project_id: projectId,
      node_id: milestone.nodeKey ? (nodeIds.get(milestone.nodeKey) ?? null) : null,
      title: milestone.title,
      description: milestone.description,
      due_date: milestone.dueDate,
      status: milestone.status,
    }));
    const { error } = await supabase.from("milestones").insert(milestoneRows);
    if (error) warnings.push("Milestones could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 4. Tasks, then subtasks.
  // ---------------------------------------------------------------------
  const taskIds = new Map<string, string>();

  for (const level of topologicalLevels(payload.tasks)) {
    const rows: Insert[] = [];
    const pending: Array<{ key: string; row: Insert }> = [];

    for (const [index, task] of level.entries()) {
      const nodeId = task.nodeKey ? (nodeIds.get(task.nodeKey) ?? null) : null;
      if (task.nodeKey && !nodeId) {
        warnings.push(`Task "${task.title}" was left without a structure link.`);
      }
      const parentId = task.parentKey ? (taskIds.get(task.parentKey) ?? null) : null;
      if (task.parentKey && !parentId) {
        warnings.push(`Task "${task.title}" was skipped: its subtask parent was not saved.`);
        continue;
      }

      const row: Insert = {
        user_id: user.id,
        project_id: projectId,
        node_id: nodeId,
        parent_task_id: parentId,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        progress: task.status === "done" ? 100 : 0,
        start_date: task.startDate,
        due_date: task.dueDate,
        estimated_minutes: task.estimatedMinutes,
        sort_order: index,
      };
      pending.push({ key: task.key, row });
      rows.push(row);
    }

    if (rows.length === 0) continue;

    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert(rows)
      .select("id");

    if (error) {
      warnings.push("Some tasks could not be saved.");
      continue;
    }

    (inserted ?? []).forEach((row, index) => {
      const match = pending[index];
      if (match && row?.id) taskIds.set(match.key, row.id as string);
    });
  }

  // Task tags.
  const taskTagRows: Insert[] = [];
  for (const task of payload.tasks) {
    const taskId = taskIds.get(task.key);
    if (!taskId) continue;
    const ids = await resolveTags(supabase, user.id, parseTags(task.tags));
    for (const tagId of ids) {
      taskTagRows.push({ user_id: user.id, task_id: taskId, tag_id: tagId });
    }
  }
  if (taskTagRows.length > 0) {
    const { error } = await supabase.from("task_tags").insert(taskTagRows);
    if (error) warnings.push("Some task tags could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 5. Checklists, then their items.
  // ---------------------------------------------------------------------
  const checklistIds = new Map<string, string>();

  for (const level of topologicalLevels(payload.checklists)) {
    const rows: Insert[] = [];
    const pending: Array<{ key: string; row: Insert }> = [];

    for (const [index, checklist] of level.entries()) {
      const nodeId = checklist.nodeKey ? (nodeIds.get(checklist.nodeKey) ?? null) : null;
      const taskId = checklist.taskKey ? (taskIds.get(checklist.taskKey) ?? null) : null;

      // The database requires exactly one of task_id / node_id (constraint
      // checklists_parent_check). A checklist attached to neither, or to both,
      // would violate it, so it is reported rather than silently dropped.
      if (Boolean(nodeId) === Boolean(taskId)) {
        warnings.push(
          `Checklist "${checklist.title}" needs to be attached to a task or a structure item.`
        );
        continue;
      }

      const parentId = checklist.parentKey
        ? (checklistIds.get(checklist.parentKey) ?? null)
        : null;

      const row: Insert = {
        user_id: user.id,
        node_id: nodeId,
        task_id: taskId,
        parent_checklist_id: parentId,
        title: checklist.title,
        description: checklist.description,
        due_date: checklist.dueDate,
        priority: checklist.priority,
        sort_order: index,
      };
      pending.push({ key: checklist.key, row });
      rows.push(row);
    }

    if (rows.length === 0) continue;

    const { data: inserted, error } = await supabase
      .from("checklists")
      .insert(rows)
      .select("id");

    if (error) {
      warnings.push("Some checklists could not be saved.");
      continue;
    }

    (inserted ?? []).forEach((row, index) => {
      const match = pending[index];
      if (match && row?.id) checklistIds.set(match.key, row.id as string);
    });
  }

  const checklistItemRows: Insert[] = [];
  for (const checklist of payload.checklists) {
    const checklistId = checklistIds.get(checklist.key);
    if (!checklistId) continue;

    checklist.items.forEach((item, index) => {
      checklistItemRows.push({
        user_id: user.id,
        checklist_id: checklistId,
        content: item.content,
        description: item.description,
        due_date: item.dueDate,
        priority: item.priority,
        is_completed: item.isCompleted,
        completed_at: item.isCompleted ? new Date().toISOString() : null,
        // Nested items are flattened but keep their parent via sort order; the
        // tree is rebuilt from `parentItemId` on the client after save.
        parent_item_id: null,
        sort_order: index,
      });
    });
  }
  if (checklistItemRows.length > 0) {
    const { error } = await supabase.from("checklist_items").insert(checklistItemRows);
    if (error) warnings.push("Some checklist items could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 6. Reminders.
  // ---------------------------------------------------------------------
  if (payload.reminders.length > 0) {
    const reminderRows: Insert[] = payload.reminders.map((reminder) => ({
      user_id: user.id,
      project_id: projectId,
      node_id: reminder.nodeKey ? (nodeIds.get(reminder.nodeKey) ?? null) : null,
      task_id: reminder.taskKey ? (taskIds.get(reminder.taskKey) ?? null) : null,
      checklist_id: reminder.checklistKey
        ? (checklistIds.get(reminder.checklistKey) ?? null)
        : null,
      title: reminder.title,
      note: reminder.description,
      // The wizard collects a wall-clock time in the project's timezone; the
      // column is timestamptz, so the offset is applied on the client-supplied
      // value and stored as UTC.
      remind_at: new Date(reminder.remindAt).toISOString(),
      status: "pending",
      priority: reminder.priority,
      repeat_rule: reminder.repeat,
      repeat_interval: reminder.repeatInterval,
      repeat_until: reminder.repeatUntil,
      notification_channels: reminder.channels,
      snooze_minutes: reminder.snoozeMinutes,
      sound: reminder.sound,
      is_enabled: reminder.isEnabled,
      advance_minutes: reminder.advanceMinutes ?? 0,
    }));

    const { error } = await supabase.from("reminders").insert(reminderRows);
    if (error) warnings.push("Some reminders could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 7. Daily notes.
  // ---------------------------------------------------------------------
  if (payload.dailyNotes.length > 0) {
    const rows: Insert[] = payload.dailyNotes.map((note) => ({
      user_id: user.id,
      project_id: projectId,
      note_date: note.noteDate,
      title: note.title,
      content: note.content,
      todays_work: note.todaysWork,
      completed_work: note.completedWork,
      problems: note.problems,
      ideas: note.ideas,
      next_steps: note.nextSteps,
    }));
    const { error } = await supabase.from("daily_notes").insert(rows);
    if (error) warnings.push("Some daily notes could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 8. Calendar events.
  // ---------------------------------------------------------------------
  if (payload.calendarEvents.length > 0) {
    const rows: Insert[] = payload.calendarEvents.map((event) => ({
      user_id: user.id,
      project_id: projectId,
      node_id: event.nodeKey ? (nodeIds.get(event.nodeKey) ?? null) : null,
      title: event.title,
      description: event.location,
      event_type: "event",
      starts_at: new Date(event.startsAt).toISOString(),
      ends_at: event.endsAt ? new Date(event.endsAt).toISOString() : null,
      all_day: event.allDay,
      location: event.location,
    }));
    const { error } = await supabase.from("calendar_events").insert(rows);
    if (error) warnings.push("Some calendar entries could not be saved.");
  }

  // ---------------------------------------------------------------------
  // 9. Finance.
  // ---------------------------------------------------------------------
  if (payload.transactions.length > 0) {
    const categoryIds = new Map<string, string>();

    for (const transaction of payload.transactions) {
      if (!transaction.categoryName) continue;
      const key = `${transaction.type}:${transaction.categoryName.toLowerCase()}`;
      if (categoryIds.has(key)) continue;

      const { data: category } = await supabase
        .from("finance_categories")
        .insert({
          user_id: user.id,
          name: transaction.categoryName,
          type: transaction.type,
        })
        .select("id")
        .single();

      if (category?.id) categoryIds.set(key, category.id as string);
    }

    const rows: Insert[] = payload.transactions.map((transaction) => ({
      user_id: user.id,
      project_id: projectId,
      node_id: transaction.nodeKey ? (nodeIds.get(transaction.nodeKey) ?? null) : null,
      category_id: transaction.categoryName
        ? (categoryIds.get(`${transaction.type}:${transaction.categoryName.toLowerCase()}`) ?? null)
        : null,
      type: transaction.type,
      amount: transaction.amount,
      description: transaction.description,
      payment_method: transaction.paymentMethod,
      transaction_date: transaction.transactionDate,
      occurred_at: transaction.occurredAt,
      reference: transaction.reference,
    }));

    const { error } = await supabase.from("finance_transactions").insert(rows);
    if (error) warnings.push("Some transactions could not be saved.");
  }

// ---------------------------------------------------------------------
  // 10. Resources.
  //
  //     File references are re-verified against the caller's own rows, and
  //     files uploaded during the wizard are only claimed once their storage
  //     path is confirmed to sit under the caller's own prefix. A crafted
  //     payload therefore cannot attach someone else's object.
  // ---------------------------------------------------------------------
  if (payload.resources.length > 0) {
    const ownedFiles = await allowedFileIds(supabase, user.id, payload.resources);

    const rows: Insert[] = [];
    const newFileRows: Insert[] = [];

    for (const resource of payload.resources) {
      const fileId = resource.fileId ? (ownedFiles.get(resource.fileId) ?? null) : null;
      if (resource.fileId && !fileId) {
        warnings.push(`Resource "${resource.name}" referenced a file that is not yours.`);
        continue;
      }

      const upload = resource.upload;
      if (upload && !upload.path.startsWith(`${user.id}/`)) {
        warnings.push(`Resource "${resource.name}" referenced a storage path that is not yours.`);
        continue;
      }
      if (resource.resourceType === "supabase_file" && !fileId && !upload) {
        warnings.push(`Resource "${resource.name}" has no file attached.`);
        continue;
      }

      // A wizard upload has no `files` row yet — create one now that the
      // project exists, so it appears in the Files tab and can be reused later.
      if (upload && !fileId) {
        newFileRows.push({
          user_id: user.id,
          project_id: projectId,
          name: upload.name,
          storage_path: upload.path,
          mime_type: upload.mimeType,
          size_bytes: upload.sizeBytes,
        });
      }

      rows.push({
        user_id: user.id,
        project_id: projectId,
        node_id: resource.nodeKey ? (nodeIds.get(resource.nodeKey) ?? null) : null,
        resource_type: resource.resourceType,
        name: resource.name,
        description: resource.description,
        url: resource.url,
        storage_path: upload?.path ?? fileId?.path ?? null,
        mime_type: upload?.mimeType ?? fileId?.mime ?? null,
        size_bytes: upload?.sizeBytes ?? fileId?.size ?? null,
        tags: parseTags(resource.tags),
      });
    }

    if (newFileRows.length > 0) {
      const { error } = await supabase.from("files").insert(newFileRows);
      if (error) warnings.push("Some uploaded files were not added to the Files list.");
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("project_resources").insert(rows);
      if (error) warnings.push("Some resources could not be saved.");
    }
  }

  // ---------------------------------------------------------------------
  // 11. History + activity.
  // ---------------------------------------------------------------------
  if (payload.options.historyEnabled) {
    const { data: saved } = await supabase
      .from("projects")
      .select("name, title, description, status, priority, progress, start_date, due_date, category, project_type, currency, budget, is_favorite, is_pinned")
      .eq("id", projectId)
      .maybeSingle();

    await supabase.from("project_history").insert({
      user_id: user.id,
      project_id: projectId,
      entity_type: "project",
      entity_id: projectId,
      action: "created",
      old_value: null,
      new_value: saved ?? null,
      summary: `Created "${payload.name}"`,
    });
  }

  const summary = summarizeDraft(payloadToDraft(payload));

  await logActivity({
    userId: user.id,
    projectId,
    activityType: "project",
    entityType: "project",
    entityId: projectId,
    summary: "Created project",
    metadata: {
      name: payload.name,
      nodes: summary.structure.total,
      tasks: summary.taskCount,
      checklistItems: summary.checklistItems,
      reminders: summary.reminderCount,
      resources: summary.resourceCount,
    },
  });

  revalidatePath("/projects");
  revalidatePath("/dashboard");

  return { projectId, warnings: warnings.length > 0 ? warnings : undefined };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Keyed = { key: string; parentKey?: string | null };

/**
 * Group a parent-referencing list into levels where every parent appears in an
 * earlier level than its children.
 *
 * Nodes whose parent never arrives are dropped into the first level rather than
 * dropped entirely, so one bad reference cannot delete a whole subtree.
 */
function topologicalLevels<T extends Keyed>(items: T[]): T[][] {
  const known = new Set(items.map((item) => item.key));
  const depth = new Map<string, number>();

  function resolve(key: string, seen: Set<string>): number {
    if (depth.has(key)) return depth.get(key)!;
    // A cycle has no depth; treat it as a root so saving still terminates.
    if (seen.has(key)) return 0;
    seen.add(key);

    const item = items.find((candidate) => candidate.key === key);
    const parentKey = item?.parentKey ?? null;
    const value =
      parentKey && known.has(parentKey) ? resolve(parentKey, seen) + 1 : 0;

    depth.set(key, value);
    return value;
  }

  for (const item of items) resolve(item.key, new Set());

  const levels: T[][] = [];
  for (const item of items) {
    const level = depth.get(item.key) ?? 0;
    (levels[level] ??= []).push(item);
  }
  return levels.filter(Boolean);
}

async function resolveTags(
  supabase: SupabaseClient,
  userId: string,
  names: string[]
): Promise<string[]> {
  if (names.length === 0) return [];

  const { data: existing } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", userId);

const byName = new Map<string, string>(
    ((existing ?? []) as Array<{ id: string; name: string }>).map((tag) => [
      tag.name.toLowerCase(),
      tag.id,
    ])
  );

  const ids: string[] = [];
  const missing: string[] = [];

  for (const name of names) {
    const found = byName.get(name.toLowerCase());
    if (found) ids.push(found);
    else missing.push(name);
  }

  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ user_id: userId, name })))
      .select("id");
for (const row of created ?? []) ids.push(String(row.id));
  }

  return ids;
}

async function allowedFileIds(
  supabase: SupabaseClient,
  userId: string,
  resources: ProjectWizardPayload["resources"]
): Promise<Map<string, { path: string; mime: string | null; size: number | null }>> {
  const ids = resources.map((resource) => resource.fileId).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map();

  const { data } = await supabase
    .from("files")
    .select("id, storage_path, mime_type, size_bytes")
    .eq("user_id", userId)
    .in("id", ids);

  return new Map(
    ((data ?? []) as Array<{
      id: string;
      storage_path: string;
      mime_type: string | null;
      size_bytes: number | null;
    }>).map((file) => [
      file.id,
      { path: file.storage_path, mime: file.mime_type, size: file.size_bytes },
    ])
  );
}

/** Drop empty strings so jsonb stores real nulls rather than "" noise. */
function cleanDetails(details: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === "string" && value.trim()) result[key] = value.trim();
  }
  return result;
}

function toProjectOptions(options: ProjectWizardPayload["options"]): ProjectOptions {
  return {
    history_enabled: options.historyEnabled,
    version_history_enabled: options.versionHistoryEnabled,
    daily_notes_enabled: options.dailyNotesEnabled,
    calendar_enabled: options.calendarEnabled,
    default_task_priority: options.defaultTaskPriority,
    default_reminder_minutes: options.defaultReminderMinutes,
    notify_on_task_complete: options.notifyOnTaskComplete,
    notify_on_overdue: options.notifyOnOverdue,
    archive_after_completion: options.archiveAfterCompletion,
    export_format: options.exportFormat,
    offline_draft: options.offlineDraft,
  };
}

/**
 * Cross-field rules the Zod schema cannot express.
 *
 * Only genuinely unrecoverable problems block the save; anything merely
 * incomplete is the user's business and is not reported here.
 */
function serverSideChecks(payload: ProjectWizardPayload): string[] {
  const errors: string[] = [];

  if (payload.startDate && payload.dueDate && payload.dueDate < payload.startDate) {
    errors.push("Due date must be on or after the start date.");
  }

  if (payload.budget !== null && payload.budget < 0) {
    errors.push("Budget cannot be negative.");
  }

  const nodeKeys = new Set(payload.nodes.map((node) => node.key));
  for (const node of payload.nodes) {
    if (node.parentKey && !nodeKeys.has(node.parentKey)) {
      errors.push(`"${node.title}" references a structure item that no longer exists.`);
      break;
    }
  }

  const taskKeys = new Set(payload.tasks.map((task) => task.key));
  for (const task of payload.tasks) {
    if (task.parentKey && !taskKeys.has(task.parentKey)) {
      errors.push(`Task "${task.title}" references a subtask that no longer exists.`);
      break;
    }
  }

  return errors;
}

/**
 * Re-shape the validated payload into the draft shape so the shared summary
 * helpers can compute the review numbers server-side too.
 */
function payloadToDraft(payload: ProjectWizardPayload): ProjectDraft {
  return {
    version: 1,
    updatedAt: Date.now(),
    step: "review",
    name: payload.name,
    title: payload.title ?? "",
    description: payload.description ?? "",
    category: payload.category,
    projectType: payload.projectType,
    status: payload.status,
    priority: payload.priority,
    tags: payload.tags,
    isFavorite: payload.isFavorite,
    isPinned: payload.isPinned,
    startDate: payload.startDate ?? "",
    dueDate: payload.dueDate ?? "",
    timezone: payload.timezone,
    milestones: payload.milestones.map((milestone) => ({
      key: milestone.key,
      title: milestone.title,
      description: milestone.description ?? "",
      dueDate: milestone.dueDate ?? "",
      status: milestone.status,
      nodeKey: milestone.nodeKey ?? null,
    })),
    icon: payload.icon ?? "",
    color: payload.color,
    cardStyle: payload.cardStyle,
    bannerName: payload.bannerName ?? "",
    logoName: payload.logoName ?? "",
    details: payload.details as Record<string, string>,
    nodes: payload.nodes.map((node, index) => ({
      key: node.key,
      parentKey: node.parentKey ?? null,
      nodeType: node.nodeType,
      title: node.title,
      description: node.description ?? "",
      startDate: node.startDate ?? "",
      dueDate: node.dueDate ?? "",
      status: node.status,
      priority: node.priority,
      notes: node.notes ?? "",
      sortOrder: index,
    })) as ProjectDraft["nodes"],
    tasks: payload.tasks.map((task, index) => ({
      key: task.key,
      nodeKey: task.nodeKey ?? null,
      parentKey: task.parentKey ?? null,
      title: task.title,
      description: task.description ?? "",
      priority: task.priority,
      status: task.status,
      startDate: task.startDate ?? "",
      dueDate: task.dueDate ?? "",
      tags: task.tags,
      estimatedMinutes: task.estimatedMinutes === null ? "" : String(task.estimatedMinutes),
      sortOrder: index,
    })) as ProjectDraft["tasks"],
    checklists: payload.checklists.map((checklist, index) => ({
      key: checklist.key,
      nodeKey: checklist.nodeKey ?? null,
      taskKey: checklist.taskKey ?? null,
      parentKey: checklist.parentKey ?? null,
      title: checklist.title,
      description: checklist.description ?? "",
      dueDate: checklist.dueDate ?? "",
      priority: checklist.priority,
      items: checklist.items.map((item) => ({
        key: item.key,
        content: item.content,
        description: item.description ?? "",
        dueDate: item.dueDate ?? "",
        priority: item.priority,
        isCompleted: item.isCompleted,
        parentKey: item.parentKey ?? null,
      })),
      sortOrder: index,
    })) as ProjectDraft["checklists"],
    reminders: payload.reminders.map((reminder) => ({
      key: reminder.key,
      title: reminder.title,
      description: reminder.description ?? "",
      nodeKey: reminder.nodeKey ?? null,
      taskKey: reminder.taskKey ?? null,
      checklistKey: reminder.checklistKey ?? null,
      remindAt: reminder.remindAt,
      repeat: reminder.repeat,
      repeatInterval: reminder.repeatInterval === null ? "" : String(reminder.repeatInterval),
      repeatUntil: reminder.repeatUntil ?? "",
      channels: reminder.channels,
      priority: reminder.priority,
      snoozeMinutes: reminder.snoozeMinutes === null ? "" : String(reminder.snoozeMinutes),
      sound: reminder.sound ?? "",
      isEnabled: reminder.isEnabled,
      advanceMinutes:
        reminder.advanceMinutes === null ? "" : String(reminder.advanceMinutes),
    })),
    dailyNotes: payload.dailyNotes.map((note) => ({
      key: note.key,
      noteDate: note.noteDate,
      title: note.title ?? "",
      content: note.content ?? "",
      todaysWork: note.todaysWork ?? "",
      completedWork: note.completedWork ?? "",
      problems: note.problems ?? "",
      ideas: note.ideas ?? "",
      nextSteps: note.nextSteps ?? "",
    })),
    calendarEvents: payload.calendarEvents.map((event) => ({
      key: event.key,
      title: event.title,
      nodeKey: event.nodeKey ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? "",
      allDay: event.allDay,
      location: event.location ?? "",
    })),
    currency: payload.currency,
    budget: payload.budget === null ? "" : String(payload.budget),
    transactions: payload.transactions.map((transaction) => ({
      key: transaction.key,
      type: transaction.type,
      amount: String(transaction.amount),
      categoryName: transaction.categoryName ?? "",
      transactionDate: transaction.transactionDate,
      occurredAt: transaction.occurredAt ?? "",
      description: transaction.description ?? "",
      paymentMethod: transaction.paymentMethod ?? "",
      reference: transaction.reference ?? "",
      nodeKey: transaction.nodeKey ?? null,
    })),
    resources: payload.resources.map((resource) => ({
      key: resource.key,
      resourceType: resource.resourceType,
      name: resource.name,
      description: resource.description ?? "",
      url: resource.url ?? "",
      tags: resource.tags,
      nodeKey: resource.nodeKey ?? null,
      fileId: resource.fileId ?? null,
      upload: resource.upload ?? null,
    })),
    options: {
      historyEnabled: payload.options.historyEnabled,
      versionHistoryEnabled: payload.options.versionHistoryEnabled,
      dailyNotesEnabled: payload.options.dailyNotesEnabled,
      calendarEnabled: payload.options.calendarEnabled,
      defaultTaskPriority: payload.options.defaultTaskPriority,
      defaultReminderMinutes:
        payload.options.defaultReminderMinutes === null
          ? ""
          : String(payload.options.defaultReminderMinutes),
      notifyOnTaskComplete: payload.options.notifyOnTaskComplete,
      notifyOnOverdue: payload.options.notifyOnOverdue,
      archiveAfterCompletion: payload.options.archiveAfterCompletion,
      exportFormat: payload.options.exportFormat,
      offlineDraft: payload.options.offlineDraft,
    },
  };
}