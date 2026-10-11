"use client";

import { useId, type ReactNode } from "react";
import { cn } from "cn";
import { Trash2, Plus, GripVertical, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { FieldError } from "@/components/shared/form-field";

/**
 * Shared controls for the project wizard.
 *
 * The wizard's twelve steps all need the same handful of inputs, and steps 5-10
 * are repeat-until-removed editors. These components keep that markup in one
 * place so every row in every repeatable list looks and behaves identically.
 */

export function WizardField({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children(id)}
      {hint && !error ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
      <FieldError message={error} />
    </div>
  );
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  type = "text",
  min,
  max,
  step,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  type?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  maxLength?: number;
  className?: string;
}) {
  return (
    <WizardField label={label} hint={hint} error={error} required={required} className={className}>
      {(id) => (
        <Input
          id={id}
          type={type}
          value={value}
          min={min}
          max={max}
          step={step}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </WizardField>
  );
}

export function TextAreaInput({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
  hint,
  error,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <WizardField label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <Textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </WizardField>
  );
}

export function SelectInput<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  className,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  hint?: string;
  error?: string;
  className?: string;
}) {
  return (
    <WizardField label={label} hint={hint} error={error} className={className}>
      {(id) => (
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </WizardField>
  );
}

export function ToggleField({
  label,
  hint,
  checked,
  onChange,
  className,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-3 py-1", className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export function TagInput({
  label,
  value,
  onChange,
  hint,
  placeholder = "design, frontend, q3",
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <WizardField label={label} hint={hint} className={className}>
      {(id) => (
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </WizardField>
  );
}

/** Read-only-looking but still selectable: timezone is a list, not free text. */
const TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

export function TimezoneInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options = TIMEZONES.includes(value as (typeof TIMEZONES)[number])
    ? TIMEZONES.map((zone) => ({ value: zone, label: zone }))
    : [{ value, label: value }, ...TIMEZONES.map((zone) => ({ value: zone, label: zone }))];

  return (
    <SelectInput
      label="Timezone"
      value={value}
      options={options}
      onChange={onChange}
      hint="Used for the countdown and for reminder times."
    />
  );
}

/**
 * Card wrapper for one step. Keeps the twelve steps visually identical and
 * gives the review step a place to explain itself.
 */
export function StepSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("flex flex-col gap-4 rounded-xl border bg-card p-4", className)}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function AddRowButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>
      <Plus /> {children}
    </Button>
  );
}

export function RemoveRowButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      aria-label={`Remove ${label}`}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

/**
 * One editable row inside a repeatable list.
 *
 * Collapsed by default so a project with fifty checklist items does not open
 * as a fifty-row form; the header stays a summary that is always readable.
 */
export function RepeatableRow({
  title,
  subtitle,
  badge,
  children,
  onRemove,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  children: ReactNode;
  onRemove: () => void;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <li className="rounded-lg border bg-background/60">
      <div className="flex items-center gap-2 px-2.5 py-2">
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        <details id={id} open={defaultOpen} className="min-w-0 flex-1">
          <summary className="flex cursor-pointer list-none flex-col">
            <span className="flex items-center gap-2 text-sm font-medium">
              <GripVertical aria-hidden="true" className="size-3.5 text-muted-foreground/50" />
              <span className="truncate">{title || "Untitled"}</span>
              {badge}
            </span>
            {subtitle ? (
              <span className="truncate pl-5 text-xs text-muted-foreground">{subtitle}</span>
            ) : null}
          </summary>
          <div className="mt-3 flex flex-col gap-3">{children}</div>
        </details>
        <RemoveRowButton onClick={onRemove} label={title || "row"} />
      </div>
    </li>
  );
}

/**
 * Picks a related row by its stable key.
 *
 * Earlier versions matched by *title*, which broke in three ordinary ways: two
 * untitled tasks both resolved to the same option, a titled task renamed after
 * being linked lost its link, and the select's displayed value no longer matched
 * any option. Keys are unique and never change, so they are the only safe thing
 * to put in a `<select value>`.
 */
export function RefPicker({
  label,
  items,
  value,
  onChange,
  hint,
  emptyLabel = "— none —",
  filterKey,
  className,
}: {
  label: string;
  items: Array<{ key: string; title: string }>;
  value: string | null;
  onChange: (key: string | null) => void;
  hint?: string;
  emptyLabel?: string;
  /** Keys to hide — used so a row cannot be its own parent. */
  filterKey?: string;
  className?: string;
}) {
  const options = items.filter((item) => item.key !== filterKey);

  return (
    <SelectInput
      label={label}
      value={value ?? ""}
      options={[
        { value: "", label: emptyLabel },
        ...options.map((item) => ({
          value: item.key,
          label: item.title || "Untitled",
        })),
      ]}
      onChange={(key) => onChange(key || null)}
      hint={hint}
      className={className}
    />
  );
}

export function ErrorList({ messages }: { messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <ul
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
    >
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

export function CountBadge({ value, label }: { value: number; label: string }) {
  return (
    <Badge variant="secondary" className="rounded-full">
      {value} {label}
    </Badge>
  );
}

/** Client-generated id so a child row can reference its parent before save. */
export function newKey(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function EmptyRow({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
      <span className="text-muted-foreground/60">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}