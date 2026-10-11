"use client";

import * as React from "react";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Coins,
  FileUp,
  FolderTree,
  Link2,
  ListChecks,
  Paperclip,
  Settings2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AddRowButton,
  EmptyRow,
  ErrorList,
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
  CURRENCY_LIST,
  DETAIL_FIELDS,
  PRIORITY_LIST,
  RESOURCE_TYPE_LIST,
  summarizeDraft,
  summarizeFinance,
  type ProjectDraft,
  type StepErrors,
  type WizardStepId,
} from "@/lib/project-wizard";
import {
  CATEGORY_LABELS,
  PROJECT_TYPE_LABELS,
  STATUS_LABELS,
} from "@/components/project-creator/wizard-step-basic";
import { IconPreview } from "@/components/project-creator/icon-picker";
import { formatFileSize } from "@/lib/format";
import { uploadWizardFileAction } from "@/lib/actions/wizard-files";
import { cn } from "cn";

const CURRENCY_LABELS: Record<string, string> = {
  INR: "₹ INR",
  USD: "$ USD",
  EUR: "€ EUR",
  GBP: "£ GBP",
  AED: "AED",
  JPY: "¥ JPY",
  AUD: "AUD",
  CAD: "CAD",
};

const RESOURCE_LABELS: Record<string, string> = {
  link: "URL / website",
  repository: "GitHub repository",
  api: "API documentation",
  document: "Document / PDF",
  video: "Video",
  image: "Image",
  note: "Internal note",
  supabase_file: "Uploaded file",
  google_drive: "Google Drive file",
  file: "Other file",
  custom: "Other",
};

/** Only these two need a real file rather than a URL. */
const FILE_RESOURCE_TYPES = new Set(["supabase_file"]);

export type WizardFile = {
  id: string;
  name: string;
  mime_type: string | null;
  size_bytes: number | null;
};

// ---------------------------------------------------------------------------
// Step 9 — Finance
// ---------------------------------------------------------------------------

export function StepFinance({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  const summary = summarizeFinance(draft);

  function update(key: string, changes: Partial<ProjectDraft["transactions"][number]>) {
    patch({
      transactions: draft.transactions.map((transaction) =>
        transaction.key === key ? { ...transaction, ...changes } : transaction
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <StepSection title="Budget" description="Optional — used for the remaining-budget figure.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectInput
            label="Currency"
            value={draft.currency}
            options={CURRENCY_LIST.map((value) => ({
              value,
              label: CURRENCY_LABELS[value] ?? value,
            }))}
            onChange={(currency) => patch({ currency })}
          />
          <TextInput
            label="Total Budget"
            type="number"
            min={0}
            step="0.01"
            value={draft.budget}
            onChange={(budget) => patch({ budget })}
            placeholder="0.00"
            error={
              draft.budget && Number(draft.budget) < 0
                ? "Budget cannot be negative."
                : undefined
            }
          />
        </div>

        <FinanceSummaryBar summary={summary} currency={draft.currency} />
      </StepSection>

      <StepSection
        title="Transactions"
        description="Income and expenses recorded against this project."
        actions={
          <div className="flex gap-1.5">
            <AddRowButton
              onClick={() =>
                patch({
                  transactions: [
                    ...draft.transactions,
                    {
                      key: newKey("tx"),
                      type: "expense",
                      amount: "",
                      categoryName: "",
                      transactionDate: "",
                      occurredAt: "",
                      description: "",
                      paymentMethod: "",
                      reference: "",
                      nodeKey: null,
                    },
                  ],
                })
              }
            >
              Expense
            </AddRowButton>
            <AddRowButton
              onClick={() =>
                patch({
                  transactions: [
                    ...draft.transactions,
                    {
                      key: newKey("tx"),
                      type: "income",
                      amount: "",
                      categoryName: "",
                      transactionDate: "",
                      occurredAt: "",
                      description: "",
                      paymentMethod: "",
                      reference: "",
                      nodeKey: null,
                    },
                  ],
                })
              }
            >
              Income
            </AddRowButton>
          </div>
        }
      >
        {draft.transactions.length === 0 ? (
          <EmptyRow
            icon={<Wallet className="size-5" />}
            title="No transactions yet"
            description="Hosting, domain and software costs are the usual entries. Attach the receipt as a resource."
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {draft.transactions.map((transaction) => (
              <RepeatableRow
                key={transaction.key}
                title={transaction.description || `${transaction.type} transaction`}
                subtitle={`${transaction.amount || "0"} ${draft.currency} · ${transaction.categoryName || "no category"}`}
                badge={
                  <Badge
                    variant={transaction.type === "income" ? "secondary" : "destructive"}
                    className="rounded-full text-[10px]"
                  >
                    {transaction.type}
                  </Badge>
                }
                onRemove={() =>
                  patch({
                    transactions: draft.transactions.filter(
                      (item) => item.key !== transaction.key
                    ),
                  })
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectInput
                    label="Type"
                    value={transaction.type}
                    options={[
                      { value: "expense", label: "Expense" },
                      { value: "income", label: "Income" },
                    ] as const}
                    onChange={(type) => update(transaction.key, { type })}
                  />
                  <TextInput
                    label="Amount"
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={transaction.amount}
                    onChange={(amount) => update(transaction.key, { amount })}
                    error={
                      transaction.amount &&
                      (!Number.isFinite(Number(transaction.amount)) ||
                        Number(transaction.amount) <= 0)
                        ? "Amount must be greater than zero."
                        : undefined
                    }
                  />
                  <TextInput
                    label="Category"
                    value={transaction.categoryName}
                    onChange={(categoryName) => update(transaction.key, { categoryName })}
                    placeholder="Hosting, Domain, Software…"
                    hint="Created automatically if it does not exist."
                  />
                  <TextInput
                    label="Date"
                    type="date"
                    required
                    value={transaction.transactionDate}
                    onChange={(transactionDate) =>
                      update(transaction.key, { transactionDate })
                    }
                  />
                  <TextInput
                    label="Time"
                    type="time"
                    value={transaction.occurredAt}
                    onChange={(occurredAt) => update(transaction.key, { occurredAt })}
                  />
                  <SelectInput
                    label="Payment Method"
                    value={transaction.paymentMethod}
                    options={[
                      { value: "", label: "— none —" },
                      { value: "cash", label: "Cash" },
                      { value: "card", label: "Card" },
                      { value: "bank_transfer", label: "Bank transfer" },
                      { value: "upi", label: "UPI" },
                      { value: "wallet", label: "Wallet" },
                      { value: "other", label: "Other" },
                    ] as const}
                    onChange={(paymentMethod) =>
                      update(transaction.key, { paymentMethod })
                    }
                  />
                  <TextInput
                    label="Reference"
                    value={transaction.reference}
                    onChange={(reference) => update(transaction.key, { reference })}
                    placeholder="Invoice number"
                  />
                </div>
                <TextAreaInput
                  label="Description"
                  value={transaction.description}
                  onChange={(description) => update(transaction.key, { description })}
                  rows={2}
                />
              </RepeatableRow>
            ))}
          </ul>
        )}
      </StepSection>
    </div>
  );
}

function FinanceSummaryBar({
  summary,
  currency,
}: {
  summary: ReturnType<typeof summarizeFinance>;
  currency: string;
}) {
  const stats = [
    { label: "Total income", value: summary.totalIncome, tone: "text-success" },
    { label: "Total expense", value: summary.totalExpense, tone: "text-danger" },
    { label: "Balance", value: summary.balance, tone: "text-foreground" },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-0.5">
            <dt className="text-[11px] tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </dt>
            <dd className={cn("text-base font-semibold tabular-nums", stat.tone)}>
              {stat.value} {currency}
            </dd>
          </div>
        ))}
      </dl>
      {summary.budget !== null ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Budget {summary.budget} {currency}
            </span>
            <span>
              Remaining {(summary.remainingBudget ?? 0).toFixed(2)} {currency}
            </span>
          </div>
          <Progress
            value={
              summary.budget === 0
                ? 0
                : Math.min(100, Math.round((summary.totalExpense / summary.budget) * 100))
            }
            className="h-1.5"
          />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 10 — Resources & Attachments
// ---------------------------------------------------------------------------

export function StepResources({
  draft,
  patch,
  files,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
  files: WizardFile[];
}) {
  function update(key: string, changes: Partial<ProjectDraft["resources"][number]>) {
    patch({
      resources: draft.resources.map((resource) =>
        resource.key === key ? { ...resource, ...changes } : resource
      ),
    });
  }

  return (
    <StepSection
      title="Resources & Attachments"
      description="Links, repositories, documentation and uploaded files — each with a name, type, description and tags."
      actions={
        <AddRowButton
          onClick={() =>
            patch({
              resources: [
                ...draft.resources,
                {
                  key: newKey("rs"),
                  resourceType: "link",
                  name: "",
                  description: "",
                  url: "",
                  tags: "",
                  nodeKey: null,
                  fileId: null,
                  upload: null,
                },
              ],
            })
          }
        >
          <Link2 className="size-3.5" /> Resource
        </AddRowButton>
      }
    >
      {draft.resources.length === 0 ? (
        <EmptyRow
          icon={<Paperclip className="size-5" />}
          title="No resources yet"
          description="Repository, docs, API reference, PDFs, images and videos all live here alongside the project."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {draft.resources.map((resource) => {
            const needsFile = FILE_RESOURCE_TYPES.has(resource.resourceType);
            const urlProblem = urlProblemFor(resource.url);

            return (
              <RepeatableRow
                key={resource.key}
                title={resource.name}
                subtitle={RESOURCE_LABELS[resource.resourceType] ?? resource.resourceType}
                onRemove={() =>
                  patch({
                    resources: draft.resources.filter((item) => item.key !== resource.key),
                  })
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput
                    label="Name"
                    required
                    value={resource.name}
                    onChange={(name) => update(resource.key, { name })}
                  />
                  <SelectInput
                    label="Type"
                    value={resource.resourceType}
                    options={RESOURCE_TYPE_LIST.map((value) => ({
                      value,
                      label: RESOURCE_LABELS[value] ?? value,
                    }))}
                    onChange={(resourceType) =>
                      update(resource.key, {
                        resourceType,
                        // Switching away from a file must drop the stale
                        // attachment, or the resource would keep pointing at
                        // something it no longer claims to be.
                        fileId: FILE_RESOURCE_TYPES.has(resourceType)
                          ? resource.fileId
                          : null,
                        upload: FILE_RESOURCE_TYPES.has(resourceType)
                          ? resource.upload
                          : null,
                      })
                    }
                  />

                  {needsFile ? (
                    <ResourceAttachment
                      resource={resource}
                      files={files}
                      onChange={(changes) => update(resource.key, changes)}
                    />
                  ) : (
                    <TextInput
                      label="URL"
                      value={resource.url}
                      onChange={(url) => update(resource.key, { url })}
                      placeholder="https://example.com"
                      error={urlProblem}
                      hint={
                        urlProblem
                          ? undefined
                          : "Include https:// — some browsers reject a bare domain."
                      }
                    />
                  )}

                  <SelectInput
                    label="Related structure item"
                    value={resource.nodeKey ?? ""}
                    options={[
                      { value: "", label: "— none —" },
                      ...draft.nodes.map((node) => ({
                        value: node.key,
                        label: node.title || "Untitled item",
                      })),
                    ]}
                    onChange={(nodeKey) =>
                      update(resource.key, { nodeKey: nodeKey || null })
                    }
                  />
                  <TagInput
                    label="Tags"
                    value={resource.tags}
                    onChange={(tags) => update(resource.key, { tags })}
                    className="sm:col-span-2"
                  />
                </div>
                <TextAreaInput
                  label="Description"
                  value={resource.description}
                  onChange={(description) => update(resource.key, { description })}
                  rows={2}
                />
              </RepeatableRow>
            );
          })}
        </ul>
      )}

      {files.length === 0 && !draft.resources.some((r) => r.upload) ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          You have no files uploaded elsewhere, but you can upload one right
          here — it is stored immediately and attached to the project when you
          create it.
        </p>
      ) : null}
    </StepSection>
  );
}

/**
 * Explains a malformed URL instead of letting the browser reject it silently.
 *
 * Only fires for something that looks like it was meant to be a URL; a blank
 * field is reported by the review step, not while typing.
 */
function urlProblemFor(url: string): string | undefined {
  const value = url.trim();
  if (!value) return undefined;

  // Bare domains are the common mistake; browsers reject them for a URL input.
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(value)) {
      return "Add https:// in front of the address.";
    }
    return "That does not look like a web address.";
  }

  try {
    const parsed = new URL(value);
    if (!parsed.hostname.includes(".")) {
      return "That address is missing a domain, e.g. example.com.";
    }
  } catch {
    return "That address could not be read.";
  }

  return undefined;
}

/**
 * Attachment control for file-type resources.
 *
 * Offers both routes because they serve different moments: picking something
 * already uploaded reuses an existing object, while uploading now is the only
 * option for a user starting from nothing — the wizard cannot create a `files`
 * row until the project exists, so the object is stored here and linked on
 * save.
 */
function ResourceAttachment({
  resource,
  files,
  onChange,
}: {
  resource: ProjectDraft["resources"][number];
  files: WizardFile[];
  onChange: (changes: Partial<ProjectDraft["resources"][number]>) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const result = await uploadWizardFileAction(formData);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      onChange({
        upload: result.file,
        fileId: null,
        name: resource.name.trim() || result.file.name,
      });
    } catch {
      setError("The upload could not be completed. Check your connection.");
    } finally {
      setUploading(false);
    }
  }

  const existing = files.find((file) => file.id === resource.fileId);
  const attached = resource.upload
    ? {
        name: resource.upload.name,
        size: resource.upload.sizeBytes,
      }
    : existing
      ? { name: existing.name, size: existing.size_bytes ?? 0 }
      : null;

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <p className="text-sm font-medium">Attachment</p>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition",
            uploading
              ? "pointer-events-none opacity-60"
              : "hover:bg-accent"
          )}
        >
          <FileUp className="size-3.5" />
          {uploading ? "Uploading…" : attached ? "Replace file" : "Upload file"}
          <input
            type="file"
            className="sr-only"
            onChange={(event) => void handleUpload(event)}
            disabled={uploading}
          />
        </label>

        {files.length > 0 ? (
          <select
            value={resource.fileId ?? ""}
            onChange={(event) =>
              onChange({
                fileId: event.target.value || null,
                upload: null,
              })
            }
            aria-label="Choose an already uploaded file"
            className="h-8 min-w-48 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
          >
            <option value="">— or pick an uploaded file —</option>
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
                {file.size_bytes ? ` (${formatFileSize(file.size_bytes)})` : ""}
              </option>
            ))}
          </select>
        ) : null}

        {attached ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Paperclip className="size-3" />
            {attached.name}
            {attached.size ? ` · ${formatFileSize(attached.size)}` : ""}
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {!attached && !error ? (
        <p className="text-xs text-muted-foreground">
          A file-type resource needs either an upload or an existing file.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 11 — Advanced Options
// ---------------------------------------------------------------------------

export function StepAdvanced({
  draft,
  patch,
}: {
  draft: ProjectDraft;
  patch: (update: Partial<ProjectDraft>) => void;
}) {
  const options = draft.options;

  function set(changes: Partial<ProjectDraft["options"]>) {
    patch({ options: { ...options, ...changes } });
  }

  return (
    <StepSection
      title="Advanced Options"
      description="Only options that are actually implemented are shown — nothing here is decorative."
    >
      <div className="grid gap-x-6 lg:grid-cols-2">
        <ToggleField
          label="Enable project history"
          hint="Record what changed, when, and the old and new values."
          checked={options.historyEnabled}
          onChange={(historyEnabled) => set({ historyEnabled })}
        />
        <ToggleField
          label="Enable version history"
          hint="Keeps a snapshot of the project each time it is saved."
          checked={options.versionHistoryEnabled}
          onChange={(versionHistoryEnabled) => set({ versionHistoryEnabled })}
        />
        <ToggleField
          label="Enable daily notes"
          hint="Show the daily planner section for this project."
          checked={options.dailyNotesEnabled}
          onChange={(dailyNotesEnabled) => set({ dailyNotesEnabled })}
        />
        <ToggleField
          label="Enable project calendar"
          hint="Include this project's dates in the calendar views."
          checked={options.calendarEnabled}
          onChange={(calendarEnabled) => set({ calendarEnabled })}
        />
        <ToggleField
          label="Notify on task completion"
          checked={options.notifyOnTaskComplete}
          onChange={(notifyOnTaskComplete) => set({ notifyOnTaskComplete })}
        />
        <ToggleField
          label="Notify when something goes overdue"
          checked={options.notifyOnOverdue}
          onChange={(notifyOnOverdue) => set({ notifyOnOverdue })}
        />
        <ToggleField
          label="Archive automatically on completion"
          hint="Move the project to Archived when its status becomes Completed."
          checked={options.archiveAfterCompletion}
          onChange={(archiveAfterCompletion) => set({ archiveAfterCompletion })}
        />
        <ToggleField
          label="Keep an offline draft"
          hint="Save wizard progress in this browser so a dropped connection does not lose it."
          checked={options.offlineDraft}
          onChange={(offlineDraft) => set({ offlineDraft })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SelectInput
          label="Default task priority"
          value={options.defaultTaskPriority}
          options={PRIORITY_LIST.map((value) => ({
            value,
            label:
              value === "none"
                ? "No priority"
                : value === "urgent"
                  ? "Critical"
                  : value.charAt(0).toUpperCase() + value.slice(1),
          }))}
          onChange={(defaultTaskPriority) => set({ defaultTaskPriority })}
        />
        <TextInput
          label="Default reminder lead time"
          type="number"
          min={1}
          value={options.defaultReminderMinutes}
          onChange={(defaultReminderMinutes) => set({ defaultReminderMinutes })}
          placeholder="minutes"
          hint="Applied to new reminders."
        />
        <SelectInput
          label="Data export format"
          value={options.exportFormat}
          options={[
            { value: "json", label: "JSON" },
            { value: "csv", label: "CSV" },
            { value: "both", label: "JSON + CSV" },
          ] as const}
          onChange={(exportFormat) => set({ exportFormat })}
        />
      </div>
    </StepSection>
  );
}

// ---------------------------------------------------------------------------
// Step 12 — Final Review
// ---------------------------------------------------------------------------

export function StepReview({
  draft,
  today,
  errors,
  onJump,
}: {
  draft: ProjectDraft;
  today: string;
  errors: StepErrors;
  onJump: (step: WizardStepId) => void;
}) {
  const summary = summarizeDraft(draft, today);
  const allErrors = Object.entries(errors).filter(
    (entry): entry is [WizardStepId, string[]] => Boolean(entry[1]?.length)
  );

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <IconPreview icon={draft.icon} color={draft.color} size="lg" />
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate text-base font-semibold">
              {draft.name || "Untitled project"}
            </h3>
            <p className="truncate text-xs text-muted-foreground">
              {draft.title || draft.description || "No description"}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="rounded-full">
              {STATUS_LABELS[draft.status] ?? draft.status}
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {CATEGORY_LABELS[draft.category] ?? draft.category}
            </Badge>
            <Badge variant="secondary" className="rounded-full">
              {PROJECT_TYPE_LABELS[draft.projectType] ?? draft.projectType}
            </Badge>
          </div>
        </div>

        {summary.tagCount > 0 ? (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            Tags: {draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean).join(", ")}
          </p>
        ) : null}
      </section>

      {allErrors.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="size-4" /> Fix before creating
          </h3>
          {allErrors.map(([step, messages]) => (
            <ErrorList key={step} messages={messages} />
          ))}
          <p className="text-xs text-muted-foreground">
            The project will still be created — these are reported so nothing is
            silently dropped.
          </p>
        </section>
      ) : (
        <p className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">
          <CheckCircle2 className="size-4" /> Everything checks out.
        </p>
      )}

      <ReviewStats summary={summary} currency={draft.currency} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ReviewList
          icon={<FolderTree className="size-4" />}
          title="Structure"
          onJump={() => onJump("structure")}
          items={[
            ["Total nodes", summary.structure.total],
            ["Phases", summary.structure.phase],
            ["Chapters", summary.structure.chapter],
            ["Lessons", summary.structure.lesson],
            ["Topics", summary.structure.topic],
            ["Sections", summary.structure.section],
            ["Collections", summary.structure.collection],
            ["Modules", summary.structure.module],
          ]}
        />
        <ReviewList
          icon={<ListChecks className="size-4" />}
          title="Work"
          onJump={() => onJump("tasks")}
          items={[
            ["Tasks", summary.taskCount],
            ["Completed tasks", summary.completedTaskCount],
            ["Checklist items", summary.checklistItems],
            ["Initial progress", `${summary.initialProgress}%`],
            ["Milestones", summary.milestoneCount],
          ]}
        />
        <ReviewList
          icon={<Coins className="size-4" />}
          title="Finance & extras"
          onJump={() => onJump("finance")}
          items={[
            ["Total income", `${summary.finance.totalIncome} ${draft.currency}`],
            ["Total expense", `${summary.finance.totalExpense} ${draft.currency}`],
            ["Balance", `${summary.finance.balance} ${draft.currency}`],
            [
              "Remaining budget",
              summary.finance.remainingBudget === null
                ? "Not set"
                : `${summary.finance.remainingBudget} ${draft.currency}`,
            ],
            ["Reminders", summary.reminderCount],
            ["Daily notes", summary.dailyNoteCount],
            ["Calendar entries", summary.calendarEventCount],
            ["Resources", summary.resourceCount],
            ["Detail fields filled", `${summary.detailFieldCount} / ${DETAIL_FIELDS.length}`],
          ]}
        />
        <ReviewList
          icon={<Settings2 className="size-4" />}
          title="Features"
          onJump={() => onJump("advanced")}
          items={[
            ["History", draft.options.historyEnabled ? "On" : "Off"],
            ["Version history", draft.options.versionHistoryEnabled ? "On" : "Off"],
            ["Daily notes", draft.options.dailyNotesEnabled ? "On" : "Off"],
            ["Calendar", draft.options.calendarEnabled ? "On" : "Off"],
            ["Offline draft", draft.options.offlineDraft ? "On" : "Off"],
            ["Export format", draft.options.exportFormat.toUpperCase()],
          ]}
        />
      </div>
    </div>
  );
}

function ReviewStats({
  summary,
  currency,
}: {
  summary: ReturnType<typeof summarizeDraft>;
  currency: string;
}) {
  const cards = [
    { label: "Total days", value: summary.countdown.totalDays },
    { label: "Remaining", value: `${summary.countdown.daysRemaining} days` },
    { label: "Structure nodes", value: summary.structure.total },
    { label: "Checklist progress", value: `${summary.checklistProgress}%` },
    { label: "Tasks", value: summary.taskCount },
    {
      label: "Balance",
      value: `${summary.finance.balance} ${currency}`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex flex-col gap-0.5 rounded-lg border bg-card p-3"
        >
          <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {card.label}
          </span>
          <span className="truncate text-lg font-semibold tabular-nums">{card.value}</span>
        </div>
      ))}
    </div>
  );
}

function ReviewList({
  icon,
  title,
  items,
  onJump,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<[string, string | number]>;
  onJump: () => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h3>
        <button
          type="button"
          onClick={onJump}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Edit <ArrowRight className="size-3" />
        </button>
      </header>
      <dl className="flex flex-col">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}