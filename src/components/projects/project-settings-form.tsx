"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconPicker, IconPreview } from "@/components/project-creator/icon-picker";
import { ColorSelector } from "@/components/project-creator/color-selector";
import {
  SelectInput,
  StepSection,
  TagInput,
  TextAreaInput,
  TextInput,
  TimezoneInput,
  ToggleField,
} from "@/components/project-creator/wizard-field";
import {
  CATEGORY_LIST,
  PRIORITY_LIST,
  PROJECT_TYPE_LIST,
  STATUS_LIST,
} from "@/lib/project-wizard";
import { CATEGORY_LABELS, PRIORITY_LABELS, PROJECT_TYPE_LABELS, STATUS_LABELS } from "@/components/project-creator/wizard-step-basic";
import { cardStyles } from "@/config/appearance";
import { updateProjectSettingsAction } from "@/lib/actions/project-settings";
import { CURRENCIES } from "@/types";
import type {
  Currency,
  Project,
  ProjectCategory,
  ProjectOptions,
  ProjectStatus,
  ProjectType,
  Priority,
} from "@/types";

/**
 * Project settings.
 *
 * This is the "everything stays editable" half of the wizard. It writes to the
 * same columns the wizard created, through a dedicated action that diffs the
 * payload so `project_history` records exactly which fields changed rather than
 * a blanket snapshot.
 */
export function ProjectSettingsForm({ project }: { project: Project }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [name, setName] = React.useState(project.name);
  const [title, setTitle] = React.useState(project.title ?? "");
  const [description, setDescription] = React.useState(project.description ?? "");
  const [category, setCategory] = React.useState<ProjectCategory>(
    project.category ?? "other"
  );
  const [projectType, setProjectType] = React.useState<ProjectType>(
    project.project_type ?? "other"
  );
  const [status, setStatus] = React.useState<ProjectStatus>(project.status);
  const [priority, setPriority] = React.useState<Priority>(project.priority);
  const [tags, setTags] = React.useState("");
  const [icon, setIcon] = React.useState(project.icon ?? "");
  const [color, setColor] = React.useState(project.color ?? "#6366f1");
  const [cardStyle, setCardStyle] = React.useState(project.card_style ?? "default");
  const [startDate, setStartDate] = React.useState(project.start_date ?? "");
  const [dueDate, setDueDate] = React.useState(project.due_date ?? "");
  const [timezone, setTimezone] = React.useState(project.timezone ?? "UTC");
  const [currency, setCurrency] = React.useState<Currency>(project.currency ?? "INR");
  const [budget, setBudget] = React.useState(
    project.budget === null ? "" : String(project.budget)
  );
  const [options, setOptions] = React.useState<ProjectOptions>(project.options ?? {});

  function save() {
    if (!name.trim()) {
      toast.error("Project name is required.");
      return;
    }

    startTransition(async () => {
      const result = await updateProjectSettingsAction({
        id: project.id,
        name: name.trim(),
        title,
        description,
        category,
        projectType,
        status,
        priority,
        icon,
        color,
        cardStyle,
        startDate,
        dueDate,
        timezone,
        currency,
        budget,
        options,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      for (const warning of result.warnings ?? []) toast.warning(warning);
      toast.success("Project updated.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : (
            <>
              <Save /> Save changes
            </>
          )}
        </Button>
      </div>

      <StepSection title="Basic information">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Project Name"
            required
            value={name}
            onChange={setName}
            className="sm:col-span-2"
          />
          <TextInput label="Project Title" value={title} onChange={setTitle} />
          <TagInput
            label="Tags"
            value={tags}
            onChange={setTags}
            hint="Leave blank to keep the current tags."
          />
        </div>
        <TextAreaInput
          label="Short Description"
          value={description}
          onChange={setDescription}
          rows={3}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Category"
            value={category}
            options={CATEGORY_LIST.map((value) => ({
              value,
              label: CATEGORY_LABELS[value] ?? value,
            }))}
            onChange={setCategory}
          />
          <SelectInput
            label="Project Type"
            value={projectType}
            options={PROJECT_TYPE_LIST.map((value) => ({
              value,
              label: PROJECT_TYPE_LABELS[value] ?? value,
            }))}
            onChange={setProjectType}
          />
          <SelectInput
            label="Status"
            value={status}
            options={STATUS_LIST.map((value) => ({
              value,
              label: STATUS_LABELS[value] ?? value,
            }))}
            onChange={setStatus}
          />
          <SelectInput
            label="Priority"
            value={priority}
            options={PRIORITY_LIST.map((value) => ({
              value,
              label: PRIORITY_LABELS[value] ?? value,
            }))}
            onChange={setPriority}
          />
        </div>
      </StepSection>

      <StepSection title="Appearance">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <IconPicker value={icon} onChange={setIcon} label="Project Icon" />
            <ColorSelector value={color} onChange={setColor} label="Project Color" />
          </div>
          <div className="flex flex-col gap-4">
            <SelectInput
              label="Card style"
              value={cardStyle}
              options={cardStyles.map((style) => ({ value: style.id, label: style.label }))}
              onChange={setCardStyle}
            />
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <IconPreview icon={icon} color={color} size="lg" />
              <div className="flex min-w-0 flex-col">
                <p className="truncate text-sm font-medium">{name || "Untitled"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {title || description || "No description"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </StepSection>

      <StepSection title="Schedule & money">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Start Date"
            type="date"
            value={startDate}
            onChange={setStartDate}
          />
          <TextInput
            label="Due Date"
            type="date"
            value={dueDate}
            onChange={setDueDate}
            error={
              startDate && dueDate && dueDate < startDate
                ? "Due date must be on or after the start date."
                : undefined
            }
          />
          <TimezoneInput value={timezone} onChange={setTimezone} />
          <SelectInput
            label="Currency"
            value={currency}
            options={CURRENCIES.map((value) => ({ value, label: value }))}
            onChange={setCurrency}
          />
          <TextInput
            label="Budget"
            type="number"
            min={0}
            step="0.01"
            value={budget}
            onChange={setBudget}
          />
        </div>
      </StepSection>

      <StepSection title="Advanced options">
        <div className="grid gap-x-6 lg:grid-cols-2">
          <ToggleField
            label="Enable project history"
            checked={options.history_enabled ?? true}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, history_enabled: checked }))
            }
          />
          <ToggleField
            label="Enable daily notes"
            checked={options.daily_notes_enabled ?? true}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, daily_notes_enabled: checked }))
            }
          />
          <ToggleField
            label="Enable project calendar"
            checked={options.calendar_enabled ?? true}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, calendar_enabled: checked }))
            }
          />
          <ToggleField
            label="Notify when something goes overdue"
            checked={options.notify_on_overdue ?? true}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, notify_on_overdue: checked }))
            }
          />
          <ToggleField
            label="Archive automatically on completion"
            checked={options.archive_after_completion ?? false}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, archive_after_completion: checked }))
            }
          />
          <ToggleField
            label="Keep an offline draft"
            checked={options.offline_draft ?? true}
            onChange={(checked) =>
              setOptions((current) => ({ ...current, offline_draft: checked }))
            }
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Default task priority"
            value={options.default_task_priority ?? "medium"}
            options={PRIORITY_LIST.map((value) => ({
              value,
              label: PRIORITY_LABELS[value] ?? value,
            }))}
            onChange={(value) =>
              setOptions((current) => ({ ...current, default_task_priority: value }))
            }
          />
          <SelectInput
            label="Data export format"
            value={options.export_format ?? "json"}
            options={[
              { value: "json", label: "JSON" },
              { value: "csv", label: "CSV" },
              { value: "both", label: "JSON + CSV" },
            ] as const}
            onChange={(value) =>
              setOptions((current) => ({ ...current, export_format: value }))
            }
          />
        </div>
      </StepSection>
    </div>
  );
}