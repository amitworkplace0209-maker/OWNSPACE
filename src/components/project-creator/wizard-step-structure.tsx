"use client";

import * as React from "react";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  CheckSquare,
  FolderTree,
  ListChecks,
  NotebookPen,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  AddRowButton,
  EmptyRow,
  RefPicker,
  RepeatableRow,
  SelectInput,
  StepSection,
  TagInput,
  TextAreaInput,
  TextInput,
  ToggleField,
  newKey,
} from "@/components/project-creator/wizard-field";
import {
  CHANNEL_LIST,
  NODE_TYPE_LIST,
  PRIORITY_LIST,
  REPEAT_LIST,
  computeChecklistProgress,
  type DraftCalendarEvent,
  type DraftChecklist,
  type DraftChecklistItem,
  type DraftDailyNote,
  type DraftNode,
  type DraftReminder,
  type DraftTask,
  type NodeType,
  type ProjectDraft,
} from "@/lib/project-wizard";
import { cn } from "cn";

const NODE_TYPE_LABELS: Record<NodeType, string> = {
  phase: "Phase",
  chapter: "Chapter",
  lesson: "Lesson",
  topic: "Topic",
  section: "Section",
  collection: "Collection",
  module: "Module",
  milestone: "Milestone",
  custom: "Custom",
};

const NODE_STATUS_LABELS = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "blocked", label: "Blocked" },
  { value: "on_hold", label: "On hold" },
] as const;

const TASK_STATUS_LABELS = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
] as const;

const PRIORITY_OPTIONS = PRIORITY_LIST.map((value) => ({
  value,
  label:
    value === "none"
      ? "No priority"
      : value === "urgent"
        ? "Critical"
        : value.charAt(0).toUpperCase() + value.slice(1),
}));

const NODE_OPTIONS = NODE_TYPE_LIST.map((value) => ({
  value,
  label: NODE_TYPE_LABELS[value],
}));

/**
 * A picker that resolves a structure node's key from its selection.
 *
 * The wizard stores stable keys rather than database ids, so a child row can
 * reference its parent before anything is saved. Selecting by name keeps the
 * draft free of id plumbing while still producing a real parent link, and the
 * server maps every key to a uuid when it writes.
 */
function NodeRefInput({
  label,
  draft,
  value,
  onChange,
  hint,
}: {
  label: string;
  draft: ProjectDraft;
  value: string | null;
  onChange: (key: string | null) => void;
  hint?: string;
}) {
  return (
    <RefPicker
      label={label}
      items={draft.nodes}
      value={value}
      onChange={onChange}
      hint={hint}
    />
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Project Structure
// ---------------------------------------------------------------------------

export function StepStructure({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  function update(key: string, changes: Partial<DraftNode>) {
    patch({
      nodes: draft.nodes.map((node) => (node.key === key ? { ...node, ...changes } : node)),
    });
  }

  function remove(key: string) {
    // Removing a parent must not orphan its children: lift them to the removed
    // node's parent so the tree stays valid.
    const target = draft.nodes.find((node) => node.key === key);
    const survivors = draft.nodes
      .filter((node) => node.key !== key)
      .map((node) =>
        node.parentKey === key ? { ...node, parentKey: target?.parentKey ?? null } : node
      );
    patch({ nodes: survivors });
  }

  function add(parentKey: string | null, nodeType: NodeType) {
    patch({
      nodes: [
        ...draft.nodes,
        {
          key: newKey("nd"),
          parentKey,
          nodeType,
          title: "",
          description: "",
          startDate: "",
          dueDate: "",
          status: "planned",
          priority: "none",
          notes: "",
        },
      ],
    });
  }

  const roots = draft.nodes.filter((node) => node.parentKey === null);
  const childrenOf = (key: string) => draft.nodes.filter((node) => node.parentKey === key);
  const descendants = (key: string): DraftNode[] => {
    const children = childrenOf(key);
    return children.flatMap((child) => [child, ...descendants(child.key)]);
  };
  const descendantKeys = (key: string) => descendants(key).map((node) => node.key);

  return (
    <StepSection
      title="Project Structure"
      description="Build the hierarchy before adding tasks so everything has a home. The shape is free — any node can hold any other."
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => add(null, "phase")}>
            <Plus /> Phase
          </Button>
          <Button variant="outline" size="sm" onClick={() => add(null, "collection")}>
            <Plus /> Collection
          </Button>
          <Button variant="outline" size="sm" onClick={() => add(null, "custom")}>
            <Plus /> Custom
          </Button>
        </div>
      }
    >
      {draft.nodes.length === 0 ? (
        <EmptyRow
          icon={<FolderTree className="size-5" />}
          title="No structure yet"
          description="Start with a Phase for a staged project, or a Collection for a reference library. You can nest chapters, lessons and topics inside."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {roots.map((node) => (
            <StructureNodeRow
              key={node.key}
              node={node}
              depth={0}
              descendantsOf={childrenOf}
              onUpdate={update}
              onRemove={remove}
              onAddChild={add}
              descendantKeys={descendantKeys}
            />
          ))}
        </ul>
      )}
    </StepSection>
  );
}

function StructureNodeRow({
  node,
  depth,
  descendantsOf,
  onUpdate,
  onRemove,
  onAddChild,
  descendantKeys,
}: {
  node: DraftNode;
  depth: number;
  descendantsOf: (key: string) => DraftNode[];
  onUpdate: (key: string, changes: Partial<DraftNode>) => void;
  onRemove: (key: string) => void;
  onAddChild: (parentKey: string | null, nodeType: NodeType) => void;
  descendantKeys: (key: string) => string[];
}) {
  const children = descendantsOf(node.key);

  return (
    <li>
      <RepeatableRow
        title={node.title || `New ${NODE_TYPE_LABELS[node.nodeType].toLowerCase()}`}
        subtitle={`${NODE_TYPE_LABELS[node.nodeType]}${
          node.dueDate ? ` · due ${node.dueDate}` : ""
        }`}
        badge={
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {NODE_TYPE_LABELS[node.nodeType]}
          </Badge>
        }
        onRemove={() => onRemove(node.key)}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="Name"
            required
            value={node.title}
            onChange={(title) => onUpdate(node.key, { title })}
          />
          <SelectInput
            label="Type"
            value={node.nodeType}
            options={NODE_OPTIONS}
            onChange={(nodeType) => onUpdate(node.key, { nodeType })}
          />
          <SelectInput
            label="Status"
            value={node.status}
            options={NODE_STATUS_LABELS}
            onChange={(status) => onUpdate(node.key, { status })}
          />
          <SelectInput
            label="Priority"
            value={node.priority}
            options={PRIORITY_OPTIONS}
            onChange={(priority) => onUpdate(node.key, { priority })}
          />
          <TextInput
            label="Start date"
            type="date"
            value={node.startDate}
            onChange={(startDate) => onUpdate(node.key, { startDate })}
          />
          <TextInput
            label="Due date"
            type="date"
            value={node.dueDate}
            onChange={(dueDate) => onUpdate(node.key, { dueDate })}
            error={
              node.startDate && node.dueDate && node.dueDate < node.startDate
                ? "Due before start."
                : undefined
            }
          />
        </div>

        <TextAreaInput
          label="Description"
          value={node.description}
          onChange={(description) => onUpdate(node.key, { description })}
          rows={2}
        />
        <TextAreaInput
          label="Notes"
          value={node.notes}
          onChange={(notes) => onUpdate(node.key, { notes })}
          rows={2}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {NODE_TYPE_LIST.filter((type) => type !== "milestone")
            .slice(0, 5)
            .map((type) => (
              <Button
                key={type}
                variant="ghost"
                size="xs"
                onClick={() => onAddChild(node.key, type)}
              >
                <Plus /> {NODE_TYPE_LABELS[type]}
              </Button>
            ))}
        </div>
      </RepeatableRow>

      {children.length > 0 ? (
        <ul className={cn("mt-2 flex flex-col gap-2", depth < 2 && "ml-4 border-l pl-3")}>
          {children.map((child) => (
            <StructureNodeRow
              key={child.key}
              node={child}
              depth={depth + 1}
              descendantsOf={descendantsOf}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onAddChild={onAddChild}
              descendantKeys={descendantKeys}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Step 6 — Tasks & Checklist
// ---------------------------------------------------------------------------

export function StepTasks({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  const allItems = draft.checklists.flatMap((checklist) => checklist.items);
  const progress = computeChecklistProgress(allItems);

  function updateTask(key: string, changes: Partial<DraftTask>) {
    patch({
      tasks: draft.tasks.map((task) => (task.key === key ? { ...task, ...changes } : task)),
    });
  }

  function addTask() {
    patch({
      tasks: [
        ...draft.tasks,
        {
          key: newKey("tk"),
          nodeKey: null,
          parentKey: null,
          title: "",
          description: "",
          priority: draft.options.defaultTaskPriority,
          status: "todo",
          startDate: "",
          dueDate: "",
          tags: "",
          estimatedMinutes: "",
        },
      ],
    });
  }

  function removeTask(key: string) {
    const target = draft.tasks.find((task) => task.key === key);
    patch({
      tasks: draft.tasks
        .filter((task) => task.key !== key)
        .map((task) =>
          task.parentKey === key ? { ...task, parentKey: target?.parentKey ?? null } : task
        ),
      // A task that disappears must not leave its checklist pointing at nothing.
      checklists: draft.checklists.map((checklist) =>
        checklist.taskKey === key ? { ...checklist, taskKey: null } : checklist
      ),
    });
  }

  function updateChecklist(key: string, changes: Partial<DraftChecklist>) {
    patch({
      checklists: draft.checklists.map((checklist) =>
        checklist.key === key ? { ...checklist, ...changes } : checklist
      ),
    });
  }

  function addChecklist() {
    patch({
      checklists: [
        ...draft.checklists,
        {
          key: newKey("cl"),
          nodeKey: null,
          taskKey: null,
          parentKey: null,
          title: "",
          description: "",
          dueDate: "",
          priority: "none",
          items: [],
        },
      ],
    });
  }

  function removeChecklist(key: string) {
    patch({
      checklists: draft.checklists
        .filter((checklist) => checklist.key !== key)
        .map((checklist) =>
          checklist.parentKey === key ? { ...checklist, parentKey: null } : checklist
        ),
    });
  }

  function updateItem(
    checklistKey: string,
    itemKey: string,
    changes: Partial<DraftChecklistItem>
  ) {
    patch({
      checklists: draft.checklists.map((checklist) =>
        checklist.key === checklistKey
          ? {
              ...checklist,
              items: checklist.items.map((item) =>
                item.key === itemKey ? { ...item, ...changes } : item
              ),
            }
          : checklist
      ),
    });
  }

  function addItem(checklistKey: string) {
    patch({
      checklists: draft.checklists.map((checklist) =>
        checklist.key === checklistKey
          ? {
              ...checklist,
              items: [
                ...checklist.items,
                {
                  key: newKey("ci"),
                  content: "",
                  description: "",
                  dueDate: "",
                  priority: "none",
                  isCompleted: false,
                  parentKey: null,
                },
              ],
            }
          : checklist
      ),
    });
  }

  function removeItem(checklistKey: string, itemKey: string) {
    patch({
      checklists: draft.checklists.map((checklist) =>
        checklist.key === checklistKey
          ? {
              ...checklist,
              items: checklist.items
                .filter((item) => item.key !== itemKey)
                .map((item) =>
                  item.parentKey === itemKey ? { ...item, parentKey: null } : item
                ),
            }
          : checklist
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Tasks"
        description="Attach a task to a structure item, or to another task to make it a subtask."
        actions={
          <AddRowButton onClick={addTask}>
            <CheckSquare className="size-3.5" /> Task
          </AddRowButton>
        }
      >
        {draft.tasks.length === 0 ? (
          <EmptyRow
            icon={<CheckSquare className="size-5" />}
            title="No tasks yet"
            description="Add the individual pieces of work. Dependencies, subtasks and attachments are editable after creation."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.tasks.map((task) => (
              <RepeatableRow
                key={task.key}
                title={task.title}
                subtitle={`${task.status.replace("_", " ")}${task.dueDate ? ` · due ${task.dueDate}` : ""}`}
                onRemove={() => removeTask(task.key)}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Task Title"
                    required
                    value={task.title}
                    onChange={(title) => updateTask(task.key, { title })}
                    className="sm:col-span-2"
                  />
                  <NodeRefInput
                    label="Related structure item"
                    draft={draft}
                    value={task.nodeKey}
                    onChange={(nodeKey) => updateTask(task.key, { nodeKey })}
                  />
                  <RefPicker
                    label="Parent task (subtask of)"
                    items={draft.tasks}
                    value={task.parentKey}
                    filterKey={task.key}
                    onChange={(parentKey) => updateTask(task.key, { parentKey })}
                  />
                  <SelectInput
                    label="Status"
                    value={task.status}
                    options={TASK_STATUS_LABELS}
                    onChange={(status) => updateTask(task.key, { status })}
                  />
                  <SelectInput
                    label="Priority"
                    value={task.priority}
                    options={PRIORITY_OPTIONS}
                    onChange={(priority) => updateTask(task.key, { priority })}
                  />
                  <TextInput
                    label="Start date"
                    type="date"
                    value={task.startDate}
                    onChange={(startDate) => updateTask(task.key, { startDate })}
                  />
                  <TextInput
                    label="Due date"
                    type="date"
                    value={task.dueDate}
                    onChange={(dueDate) => updateTask(task.key, { dueDate })}
                    error={
                      task.startDate && task.dueDate && task.dueDate < task.startDate
                        ? "Due before start."
                        : undefined
                    }
                  />
                  <TextInput
                    label="Estimated time (minutes)"
                    type="number"
                    min={1}
                    value={task.estimatedMinutes}
                    onChange={(estimatedMinutes) =>
                      updateTask(task.key, { estimatedMinutes })
                    }
                  />
                  <TagInput
                    label="Tags"
                    value={task.tags}
                    onChange={(tags) => updateTask(task.key, { tags })}
                    className="sm:col-span-2"
                  />
                </div>
                <TextAreaInput
                  label="Description"
                  value={task.description}
                  onChange={(description) => updateTask(task.key, { description })}
                  rows={2}
                />
              </RepeatableRow>
            ))}
          </ul>
        )}
      </StepSection>

      <StepSection
        title="Checklists"
        description="Progress is completed ÷ total, rolled up to the project."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="rounded-full tabular-nums">
              {progress}%
            </Badge>
            <AddRowButton onClick={addChecklist}>
              <ListChecks className="size-3.5" /> Checklist
            </AddRowButton>
          </div>
        }
      >
        {draft.checklists.length === 0 ? (
          <EmptyRow
            icon={<ListChecks className="size-5" />}
            title="No checklists yet"
            description="A checklist must hang off a task or a structure item — pick one below and it will be linked on save."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.checklists.map((checklist) => {
              const itemProgress = computeChecklistProgress(checklist.items);
              const attached = Boolean(checklist.taskKey || checklist.nodeKey);

              return (
                <RepeatableRow
                  key={checklist.key}
                  title={checklist.title}
                  subtitle={`${checklist.items.length} item(s) · ${itemProgress}%`}
                  badge={
                    !attached ? (
                      <Badge variant="destructive" className="rounded-full text-[10px]">
                        needs a link
                      </Badge>
                    ) : null
                  }
                  onRemove={() => removeChecklist(checklist.key)}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextInput
                      label="Checklist Name"
                      required
                      value={checklist.title}
                      onChange={(title) => updateChecklist(checklist.key, { title })}
                    />
                    <TextInput
                      label="Due date"
                      type="date"
                      value={checklist.dueDate}
                      onChange={(dueDate) => updateChecklist(checklist.key, { dueDate })}
                    />
                    <NodeRefInput
                      label="Attach to structure item"
                      draft={draft}
                      value={checklist.nodeKey}
                      onChange={(nodeKey) => updateChecklist(checklist.key, { nodeKey })}
                    />
                    <SelectInput
                      label="Attach to task"
                      value={
                        (draft.tasks.find((t) => t.key === checklist.taskKey)?.title ??
                          "") as string
                      }
                      options={[
                        { value: "", label: "— none —" },
                        ...draft.tasks
                          .filter((t) => t.title)
                          .map((t) => ({ value: t.title, label: t.title })),
                      ]}
                      onChange={(title) =>
                        updateChecklist(checklist.key, {
                          taskKey: draft.tasks.find((t) => t.title === title)?.key ?? null,
                          // The database allows exactly one owner, so choosing a
                          // task clears a previously chosen structure item.
                          nodeKey: title ? null : checklist.nodeKey,
                        })
                      }
                    />
                    <SelectInput
                      label="Priority"
                      value={checklist.priority}
                      options={PRIORITY_OPTIONS}
                      onChange={(priority) =>
                        updateChecklist(checklist.key, { priority })
                      }
                    />
                    <RefPicker
                      label="Parent checklist"
                      items={draft.checklists}
                      value={checklist.parentKey}
                      filterKey={checklist.key}
                      onChange={(parentKey) =>
                        updateChecklist(checklist.key, { parentKey })
                      }
                    />
                  </div>
                  <TextAreaInput
                    label="Description"
                    value={checklist.description}
                    onChange={(description) =>
                      updateChecklist(checklist.key, { description })
                    }
                    rows={2}
                  />

                  <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium">Items</p>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => addItem(checklist.key)}
                      >
                        <Plus /> Item
                      </Button>
                    </div>

                    {checklist.items.length === 0 ? (
                      <p className="py-2 text-center text-xs text-muted-foreground">
                        No items yet.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1.5">
                        {checklist.items.map((item) => (
                          <li
                            key={item.key}
                            className="flex items-center gap-2 rounded-md border bg-background px-2 py-1.5"
                          >
                            <Checkbox
                              checked={item.isCompleted}
                              onCheckedChange={(checked) =>
                                updateItem(checklist.key, item.key, {
                                  isCompleted: checked === true,
                                })
                              }
                              aria-label={`Mark "${item.content || "item"}" complete`}
                            />
                            <input
                              value={item.content}
                              onChange={(event) =>
                                updateItem(checklist.key, item.key, {
                                  content: event.target.value,
                                })
                              }
                              placeholder="Checklist item"
                              aria-label="Checklist item"
                              className={cn(
                                "min-w-0 flex-1 bg-transparent text-sm outline-none",
                                item.isCompleted && "text-muted-foreground line-through"
                              )}
                            />
                            <input
                              type="date"
                              value={item.dueDate}
                              onChange={(event) =>
                                updateItem(checklist.key, item.key, {
                                  dueDate: event.target.value,
                                })
                              }
                              aria-label="Item due date"
                              className="hidden rounded border bg-transparent px-1.5 text-xs outline-none sm:block"
                            />
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => removeItem(checklist.key, item.key)}
                              aria-label="Remove item"
                            >
                              ×
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </RepeatableRow>
              );
            })}
          </ul>
        )}
      </StepSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Reminders
// ---------------------------------------------------------------------------

export function StepReminders({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  function update(key: string, changes: Partial<DraftReminder>) {
    patch({
      reminders: draft.reminders.map((reminder) =>
        reminder.key === key ? { ...reminder, ...changes } : reminder
      ),
    });
  }

  function toggleChannel(key: string, channel: DraftReminder["channels"][number]) {
    const reminder = draft.reminders.find((item) => item.key === key);
    if (!reminder) return;
    const channels = reminder.channels.includes(channel)
      ? reminder.channels.filter((value) => value !== channel)
      : [...reminder.channels, channel];
    update(key, { channels });
  }

  return (
    <StepSection
      title="Reminders"
      description="Attach a reminder to a structure item, task or checklist."
      actions={
        <AddRowButton
          onClick={() =>
            patch({
              reminders: [
                ...draft.reminders,
                {
                  key: newKey("rm"),
                  title: "",
                  description: "",
                  nodeKey: null,
                  taskKey: null,
                  checklistKey: null,
                  remindAt: "",
                  repeat: "none",
                  repeatInterval: "",
                  repeatUntil: "",
                  channels: ["in_app"],
                  priority: "none",
                  snoozeMinutes: "10",
                  sound: "",
                  isEnabled: true,
                  advanceMinutes: "",
                },
              ],
            })
          }
        >
          <Bell className="size-3.5" /> Reminder
        </AddRowButton>
      }
    >
      {draft.reminders.length === 0 ? (
        <EmptyRow
          icon={<AlarmClock className="size-5" />}
          title="No reminders yet"
          description="Add the deadlines you do not want to miss. Repeat rules and snooze are configurable per reminder."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {draft.reminders.map((reminder) => (
            <RepeatableRow
              key={reminder.key}
              title={reminder.title}
              subtitle={
                reminder.remindAt
                  ? new Date(reminder.remindAt).toLocaleString()
                  : "No date set"
              }
              onRemove={() =>
                patch({
                  reminders: draft.reminders.filter((item) => item.key !== reminder.key),
                })
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Reminder Title"
                  required
                  value={reminder.title}
                  onChange={(title) => update(reminder.key, { title })}
                />
                <TextInput
                  label="Reminder Date & Time"
                  type="datetime-local"
                  required
                  value={reminder.remindAt}
                  onChange={(remindAt) => update(reminder.key, { remindAt })}
                  error={
                    reminder.remindAt
                      ? undefined
                      : "A date and time are required for a reminder."
                  }
                />
                <NodeRefInput
                  label="Related structure item"
                  draft={draft}
                  value={reminder.nodeKey}
                  onChange={(nodeKey) => update(reminder.key, { nodeKey })}
                />
                <RefPicker
                  label="Related task"
                  items={draft.tasks}
                  value={reminder.taskKey}
                  onChange={(taskKey) => update(reminder.key, { taskKey })}
                />
                <RefPicker
                  label="Related checklist"
                  items={draft.checklists}
                  value={reminder.checklistKey}
                  onChange={(checklistKey) => update(reminder.key, { checklistKey })}
                />
                <SelectInput
                  label="Priority"
                  value={reminder.priority}
                  options={PRIORITY_OPTIONS}
                  onChange={(priority) => update(reminder.key, { priority })}
                />
                <SelectInput
                  label="Repeat"
                  value={reminder.repeat}
                  options={REPEAT_LIST.map((value) => ({
                    value,
                    label:
                      value === "none"
                        ? "Does not repeat"
                        : value.charAt(0).toUpperCase() + value.slice(1),
                  }))}
                  onChange={(repeat) => update(reminder.key, { repeat })}
                />
                {reminder.repeat !== "none" ? (
                  <>
                    <TextInput
                      label="Repeat every (days)"
                      type="number"
                      min={1}
                      value={reminder.repeatInterval}
                      onChange={(repeatInterval) =>
                        update(reminder.key, { repeatInterval })
                      }
                    />
                    <TextInput
                      label="Repeat until"
                      type="date"
                      value={reminder.repeatUntil}
                      onChange={(repeatUntil) => update(reminder.key, { repeatUntil })}
                    />
                  </>
                ) : null}
                <TextInput
                  label="Snooze duration (minutes)"
                  type="number"
                  min={1}
                  value={reminder.snoozeMinutes}
                  onChange={(snoozeMinutes) =>
                    update(reminder.key, { snoozeMinutes })
                  }
                />
                <TextInput
                  label="Advance reminder (minutes)"
                  type="number"
                  min={1}
                  value={reminder.advanceMinutes}
                  onChange={(advanceMinutes) =>
                    update(reminder.key, { advanceMinutes })
                  }
                  hint="Alert this many minutes before the deadline."
                />
                <TextInput
                  label="Sound preference"
                  value={reminder.sound}
                  onChange={(sound) => update(reminder.key, { sound })}
                  placeholder="e.g. chime"
                />
              </div>

              <TextAreaInput
                label="Reminder Description"
                value={reminder.description}
                onChange={(description) => update(reminder.key, { description })}
                rows={2}
              />

              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">Notification channels</legend>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_LIST.map((channel) => {
                    const selected = reminder.channels.includes(channel);
                    return (
                      <label
                        key={channel}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition",
                          selected
                            ? "border-primary bg-primary/5"
                            : "text-muted-foreground hover:bg-accent"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 accent-[var(--primary)]"
                          checked={selected}
                          onChange={() => toggleChannel(reminder.key, channel)}
                        />
                        {channel === "in_app"
                          ? "In-app"
                          : channel === "browser"
                            ? "Browser"
                            : channel === "push"
                              ? "Push (needs permission)"
                              : "Email (needs SMTP)"}
                      </label>
                    );
                  })}
                </div>
                {reminder.channels.length === 0 ? (
                  <p className="text-xs text-destructive">
                    Pick at least one channel.
                  </p>
                ) : null}
              </fieldset>

              <ToggleField
                label="Reminder enabled"
                checked={reminder.isEnabled}
                onChange={(isEnabled) => update(reminder.key, { isEnabled })}
              />
            </RepeatableRow>
          ))}
        </ul>
      )}
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Step 8 — Daily Notes & Calendar
// ---------------------------------------------------------------------------

export function StepDailyAndCalendar({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  function updateNote(key: string, changes: Partial<DraftDailyNote>) {
    patch({
      dailyNotes: draft.dailyNotes.map((note) =>
        note.key === key ? { ...note, ...changes } : note
      ),
    });
  }

  function updateEvent(key: string, changes: Partial<DraftCalendarEvent>) {
    patch({
      calendarEvents: draft.calendarEvents.map((event) =>
        event.key === key ? { ...event, ...changes } : event
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Daily Notes"
        description="Each project's own daily log."
        actions={
          <AddRowButton
            onClick={() =>
              patch({
                dailyNotes: [
                  ...draft.dailyNotes,
                  {
                    key: newKey("dn"),
                    noteDate: "",
                    title: "",
                    content: "",
                    todaysWork: "",
                    completedWork: "",
                    problems: "",
                    ideas: "",
                    nextSteps: "",
                  },
                ],
              })
            }
          >
            <NotebookPen className="size-3.5" /> Daily note
          </AddRowButton>
        }
      >
        {draft.dailyNotes.length === 0 ? (
          <EmptyRow
            icon={<NotebookPen className="size-5" />}
            title="No daily notes yet"
            description="Seed the first few days so the daily planner has something to show. You can add more any time."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.dailyNotes.map((note) => (
              <RepeatableRow
                key={note.key}
                title={note.title || note.noteDate || "Daily note"}
                subtitle={note.noteDate || "No date"}
                onRemove={() =>
                  patch({
                    dailyNotes: draft.dailyNotes.filter((item) => item.key !== note.key),
                  })
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Date"
                    type="date"
                    required
                    value={note.noteDate}
                    onChange={(noteDate) => updateNote(note.key, { noteDate })}
                  />
                  <TextInput
                    label="Title"
                    value={note.title}
                    onChange={(title) => updateNote(note.key, { title })}
                  />
                </div>
                <TextAreaInput
                  label="Today's Work"
                  value={note.todaysWork}
                  onChange={(todaysWork) => updateNote(note.key, { todaysWork })}
                  rows={2}
                />
                <TextAreaInput
                  label="Completed Work"
                  value={note.completedWork}
                  onChange={(completedWork) => updateNote(note.key, { completedWork })}
                  rows={2}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextAreaInput
                    label="Problems"
                    value={note.problems}
                    onChange={(problems) => updateNote(note.key, { problems })}
                    rows={2}
                  />
                  <TextAreaInput
                    label="Ideas"
                    value={note.ideas}
                    onChange={(ideas) => updateNote(note.key, { ideas })}
                    rows={2}
                  />
                </div>
                <TextAreaInput
                  label="Next Steps"
                  value={note.nextSteps}
                  onChange={(nextSteps) => updateNote(note.key, { nextSteps })}
                  rows={2}
                />
                <TextAreaInput
                  label="Notes"
                  value={note.content}
                  onChange={(content) => updateNote(note.key, { content })}
                  rows={3}
                />
              </RepeatableRow>
            ))}
          </ul>
        )}
      </StepSection>

      <StepSection
        title="Project Calendar"
        description="Events join the month, week, day and agenda views alongside tasks, reminders, milestones and deadlines."
        actions={
          <AddRowButton
            onClick={() =>
              patch({
                calendarEvents: [
                  ...draft.calendarEvents,
                  {
                    key: newKey("ce"),
                    title: "",
                    nodeKey: null,
                    startsAt: "",
                    endsAt: "",
                    allDay: false,
                    location: "",
                  },
                ],
              })
            }
          >
            <CalendarDays className="size-3.5" /> Event
          </AddRowButton>
        }
      >
        {draft.calendarEvents.length === 0 ? (
          <EmptyRow
            icon={<CalendarDays className="size-5" />}
            title="No calendar entries yet"
            description="Tasks, reminders and milestones already show on the calendar through their own dates. Add explicit events for meetings or reviews."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.calendarEvents.map((event) => (
              <RepeatableRow
                key={event.key}
                title={event.title}
                subtitle={event.startsAt ? new Date(event.startsAt).toLocaleString() : "No time set"}
                onRemove={() =>
                  patch({
                    calendarEvents: draft.calendarEvents.filter(
                      (item) => item.key !== event.key
                    ),
                  })
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Title"
                    required
                    value={event.title}
                    onChange={(title) => updateEvent(event.key, { title })}
                    className="sm:col-span-2"
                  />
                  <TextInput
                    label="Starts at"
                    type="datetime-local"
                    required
                    value={event.startsAt}
                    onChange={(startsAt) => updateEvent(event.key, { startsAt })}
                  />
                  <TextInput
                    label="Ends at"
                    type="datetime-local"
                    value={event.endsAt}
                    onChange={(endsAt) => updateEvent(event.key, { endsAt })}
                  />
                  <TextInput
                    label="Location"
                    value={event.location}
                    onChange={(location) => updateEvent(event.key, { location })}
                  />
                  <NodeRefInput
                    label="Related structure item"
                    draft={draft}
                    value={event.nodeKey}
                    onChange={(nodeKey) => updateEvent(event.key, { nodeKey })}
                  />
                </div>
                <ToggleField
                  label="All day"
                  checked={event.allDay}
                  onChange={(allDay) => updateEvent(event.key, { allDay })}
                />
              </RepeatableRow>
            ))}
          </ul>
        )}
      </StepSection>
    </div>
  );
}