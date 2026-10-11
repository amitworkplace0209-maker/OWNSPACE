"use client";

import {
  BookOpen,
  Code2,
  Flag,
  Globe,
  Info,
  Link2,
  Rocket,
  Target,
} from "lucide-react";
import { BadgeCheck, Boxes, FileText, LayoutGrid, ListChecks, Server } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { IconPicker, IconPreview } from "@/components/project-creator/icon-picker";
import { ColorSelector } from "@/components/project-creator/color-selector";
import {
  AddRowButton,
  EmptyRow,
  RepeatableRow,
  SelectInput,
  StepSection,
  TagInput,
  TextAreaInput,
  TextInput,
  TimezoneInput,
  ToggleField,
  newKey,
} from "@/components/project-creator/wizard-field";
import {
  CATEGORY_LIST,
  DETAIL_FIELDS,
  PRIORITY_LIST,
  PROJECT_TYPE_LIST,
  STATUS_LIST,
  computeCountdown,
  isUrlField,
  type DraftMilestone,
  type ProjectDraft,
} from "@/lib/project-wizard";
import { cardStyles } from "@/config/appearance";
import { cn } from "cn";

const CATEGORY_LABELS: Record<string, string> = {
  development: "Development",
  business: "Business",
  learning: "Learning",
  personal: "Personal",
  research: "Research",
  design: "Design",
  marketing: "Marketing",
  finance: "Finance",
  health: "Health",
  other: "Other",
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
  web_app: "Web app",
  pwa: "PWA",
  mobile_app: "Mobile app",
  desktop_app: "Desktop app",
  api: "API / service",
  research: "Research",
  design: "Design",
  marketing: "Marketing",
  other: "Other",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const PRIORITY_LABELS: Record<string, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Critical",
};

// ---------------------------------------------------------------------------
// Step 1 — Basic Information
// ---------------------------------------------------------------------------

export function StepBasic({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Basic Information"
        description="The name is the only required field. Everything else can be filled in later."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Project Name"
            required
            value={draft.name}
            onChange={(name) => patch({ name })}
            placeholder="e.g. Ownspece redesign"
            maxLength={200}
            className="sm:col-span-2"
          />
          <TextInput
            label="Project Title"
            value={draft.title}
            onChange={(title) => patch({ title })}
            placeholder="Short title shown under the name"
            maxLength={200}
          />
          <TagInput
            label="Tags"
            value={draft.tags}
            onChange={(tags) => patch({ tags })}
            hint="Comma separated. New tags are created automatically."
          />
        </div>

        <TextAreaInput
          label="Short Description"
          value={draft.description}
          onChange={(description) => patch({ description })}
          rows={3}
          placeholder="One or two lines about what this project is."
        />
      </StepSection>

      <StepSection title="Classification" description="How this project is categorised.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Category"
            value={draft.category}
            options={CATEGORY_LIST.map((value) => ({
              value,
              label: CATEGORY_LABELS[value] ?? value,
            }))}
            onChange={(category) => patch({ category })}
          />
          <SelectInput
            label="Project Type"
            value={draft.projectType}
            options={PROJECT_TYPE_LIST.map((value) => ({
              value,
              label: PROJECT_TYPE_LABELS[value] ?? value,
            }))}
            onChange={(projectType) => patch({ projectType })}
          />
          <SelectInput
            label="Status"
            value={draft.status}
            options={STATUS_LIST.map((value) => ({
              value,
              label: STATUS_LABELS[value] ?? value,
            }))}
            onChange={(status) => patch({ status })}
          />
          <SelectInput
            label="Priority"
            value={draft.priority}
            options={PRIORITY_LIST.map((value) => ({
              value,
              label: PRIORITY_LABELS[value] ?? value,
            }))}
            onChange={(priority) => patch({ priority })}
          />
        </div>
      </StepSection>

      <StepSection title="Visibility">
        <ToggleField
          label="Favorite"
          hint="Marks the project as a favorite on the projects list."
          checked={draft.isFavorite}
          onChange={(isFavorite) => patch({ isFavorite })}
        />
        <ToggleField
          label="Pin"
          hint="Pinned projects sort to the top of the list."
          checked={draft.isPinned}
          onChange={(isPinned) => patch({ isPinned })}
        />
      </StepSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Dates & Countdown
// ---------------------------------------------------------------------------

export function StepDates({
  draft,
  patch,
  today,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
  today: string;
}) {
  const countdown = computeCountdown(draft.startDate, draft.dueDate, today);

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Schedule"
        description="Total, elapsed and remaining days are calculated as you type."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Start Date"
            type="date"
            value={draft.startDate}
            onChange={(startDate) => patch({ startDate })}
          />
          <TextInput
            label="Due Date"
            type="date"
            value={draft.dueDate}
            onChange={(dueDate) => patch({ dueDate })}
            error={
              draft.startDate && draft.dueDate && draft.dueDate < draft.startDate
                ? "Due date must be on or after the start date."
                : undefined
            }
          />
        </div>
        <TimezoneInput
          value={draft.timezone}
          onChange={(timezone) => patch({ timezone })}
        />

        <CountdownPanel countdown={countdown} />

        {countdown.isOverdue ? (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
          >
            This deadline has already passed. Saving is still allowed — you may be
            catching up on past work.
          </p>
        ) : null}
      </StepSection>

      <MilestonesSection draft={draft} patch={patch} />
    </div>
  );
}

function CountdownPanel({ countdown }: { countdown: ReturnType<typeof computeCountdown> }) {
  if (!countdown.hasSchedule) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        Set a start or due date to see the countdown.
      </p>
    );
  }

  const stats = [
    { label: "Total days", value: countdown.totalDays },
    { label: "Days elapsed", value: countdown.daysElapsed },
    { label: "Days remaining", value: countdown.daysRemaining },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>{countdown.elapsedPercent}% elapsed</span>
          <span>{countdown.remainingPercent}% remaining</span>
        </div>
        <Progress value={countdown.elapsedPercent} className="h-1.5" />
      </div>
    </div>
  );
}

function MilestonesSection({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  function update(key: string, changes: Partial<DraftMilestone>) {
    patch({
      milestones: draft.milestones.map((milestone) =>
        milestone.key === key ? { ...milestone, ...changes } : milestone
      ),
    });
  }

  function remove(key: string) {
    patch({ milestones: draft.milestones.filter((milestone) => milestone.key !== key) });
  }

  function add() {
    patch({
      milestones: [
        ...draft.milestones,
        {
          key: newKey("ms"),
          title: "",
          description: "",
          dueDate: "",
          status: "not_started",
          nodeKey: null,
        },
      ],
    });
  }

  return (
    <StepSection
      title="Important Milestones"
      description="Dated checkpoints that appear on the project calendar."
      actions={
        <AddRowButton onClick={add}>
          <Flag className="size-3.5" /> Milestone
        </AddRowButton>
      }
    >
      {draft.milestones.length === 0 ? (
        <EmptyRow
          icon={<Flag className="size-5" />}
          title="No milestones yet"
          description="Add the checkpoints that matter — launches, reviews, handovers."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {draft.milestones.map((milestone) => (
            <RepeatableRow
              key={milestone.key}
              title={milestone.title}
              subtitle={milestone.dueDate || "No date"}
              onRemove={() => remove(milestone.key)}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <TextInput
                  label="Title"
                  value={milestone.title}
                  onChange={(title) => update(milestone.key, { title })}
                />
                <TextInput
                  label="Due date"
                  type="date"
                  value={milestone.dueDate}
                  onChange={(dueDate) => update(milestone.key, { dueDate })}
                />
                <SelectInput
                  label="Status"
                  value={milestone.status}
                  options={[
                    { value: "not_started", label: "Not started" },
                    { value: "in_progress", label: "In progress" },
                    { value: "completed", label: "Completed" },
                  ] as const}
                  onChange={(status) => update(milestone.key, { status })}
                />
                <TextInput
                  label="Attach to structure item"
                  value={nodeTitle(draft, milestone.nodeKey)}
                  onChange={(title) =>
                    update(milestone.key, { nodeKey: keyByTitle(draft, title) })
                  }
                  hint="Optional. Type the name of a phase, chapter or topic."
                />
              </div>
              <TextAreaInput
                label="Description"
                value={milestone.description}
                onChange={(description) => update(milestone.key, { description })}
                rows={2}
              />
            </RepeatableRow>
          ))}
        </ul>
      )}
    </StepSection>
  );
}

function nodeTitle(draft: ProjectDraft, key: string | null): string {
  if (!key) return "";
  return draft.nodes.find((node) => node.key === key)?.title ?? "";
}

function keyByTitle(draft: ProjectDraft, title: string): string | null {
  const match = draft.nodes.find((node) => node.title === title.trim());
  return match ? match.key : null;
}

// ---------------------------------------------------------------------------
// Step 3 — Appearance & Identity
// ---------------------------------------------------------------------------

export function StepAppearance({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Icon & Colour"
        description="Pick visually — the colour and icon are never typed by hand."
      >
        <IconPicker
          value={draft.icon}
          onChange={(icon) => patch({ icon })}
          label="Project Icon"
          placeholder="Search icons"
        />
        <ColorSelector
          value={draft.color}
          onChange={(color) => patch({ color })}
          label="Project Color"
        />
      </StepSection>

      <StepSection
        title="Banner & Logo"
        description="Optional. Stored as references; upload them from the Files tab after creation."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Banner reference"
            value={draft.bannerName}
            onChange={(bannerName) => patch({ bannerName })}
            placeholder="ownspece-banner.png"
            hint="Saved on the project; add the actual file from Resources."
          />
          <TextInput
            label="Logo reference"
            value={draft.logoName}
            onChange={(logoName) => patch({ logoName })}
            placeholder="ownspece-logo.png"
          />
        </div>
      </StepSection>

      <StepSection
        title="Card Style"
        description="Preview follows the theme you are using right now."
      >
        <SelectInput
          label="Card style"
          value={draft.cardStyle}
          options={cardStyles.map((style) => ({ value: style.id, label: style.label }))}
          onChange={(cardStyle) => patch({ cardStyle })}
        />
        <LivePreview draft={draft} />
      </StepSection>
    </div>
  );
}

function LivePreview({ draft }: { draft: ProjectDraft }) {
  const completed = draft.tasks.filter((task) => task.status === "done").length;
  const progress =
    draft.tasks.length > 0 ? Math.round((completed / draft.tasks.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Live preview
      </p>
      <div data-card-style={draft.cardStyle}>
        <Card
          data-slot="card"
          className="group flex w-full max-w-sm flex-col gap-3 overflow-hidden rounded-xl bg-(--card-bg) p-4 ring-1 ring-(--card-ring-color) shadow-(--card-shadow)"
        >
          <div
            aria-hidden="true"
            className="-mx-4 -mt-4 h-16 w-full"
            style={{
              backgroundImage: `linear-gradient(120deg, ${draft.color}, color-mix(in oklab, ${draft.color}, #000 25%))`,
            }}
          />
          <div className="flex items-start gap-3">
            <IconPreview icon={draft.icon} color={draft.color} size="lg" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-sm font-medium">
                {draft.name || "Untitled project"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {draft.title || draft.description || "No description yet"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <BadgeCheck className="size-3.5 text-primary" />
            <span className="text-xs text-muted-foreground">
              {CATEGORY_LABELS[draft.category]} ·{" "}
              {PROJECT_TYPE_LABELS[draft.projectType]}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span className="tabular-nums">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Description & Project Details
// ---------------------------------------------------------------------------

const DETAIL_ICONS: Record<string, typeof Info> = {
  detailed_description: FileText,
  objective: Target,
  goals: Rocket,
  scope: Boxes,
  requirements: ListChecks,
  important_info: Info,
  tech_frontend: LayoutGrid,
  tech_backend: Server,
  tech_database: Code2,
  tech_hosting: Globe,
  api_details: Link2,
  repo_url: Code2,
  website_url: Globe,
  docs_url: BookOpen,
  additional_notes: FileText,
};

export function StepDetails({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  function set(key: string, value: string) {
    patch({ details: { ...draft.details, [key]: value } });
  }

  const filled = DETAIL_FIELDS.filter((field) => (draft.details[field.key] ?? "").trim()).length;

  return (
    <div className="flex flex-col gap-4">
      <StepSection
        title="Project Details"
        description="Every field is optional — leave blank what you do not know yet."
        actions={
          <span className="text-xs text-muted-foreground">
            {filled} of {DETAIL_FIELDS.length} filled
          </span>
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {DETAIL_FIELDS.map((field) => {
            const Icon = DETAIL_ICONS[field.key] ?? Info;
            return (
              <div
                key={field.key}
                className={cn(
                  "flex flex-col gap-1.5",
                  (field.key === "detailed_description" ||
                    field.key === "requirements") &&
                    "lg:col-span-2"
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  {field.label}
                </span>
                {isUrlField(field) ? (
                  <TextInput
                    label=""
                    type="url"
                    value={draft.details[field.key] ?? ""}
                    onChange={(value) => set(field.key, value)}
                    placeholder="https://"
                  />
                ) : (
                  <TextAreaInput
                    label=""
                    rows={field.rows}
                    value={draft.details[field.key] ?? ""}
                    onChange={(value) => set(field.key, value)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </StepSection>
    </div>
  );
}

export {
  CATEGORY_LABELS,
  PROJECT_TYPE_LABELS,
  PRIORITY_LABELS,
  STATUS_LABELS,
};