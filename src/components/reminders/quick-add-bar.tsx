"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createQuickReminderAction } from "@/lib/actions/calendar";
import { toIsoSubmit } from "@/lib/format";
import { parseQuickReminder, quickPriority } from "@/lib/quick-add";
import { cn } from "cn";

/**
 * One-line quick add.
 *
 * "tomorrow 9am standup" creates the reminder without opening the form. The
 * parse is shown back as a preview *before* saving, because a misread is worse
 * than no quick add at all — a reminder silently created for the wrong time is
 * worse than the three clicks the form costs.
 *
 * The parsed result is also handed to the caller so an offline create can be
 * queued and replayed; without that the bar would be the one control on the
 * page that quietly does nothing with no connection.
 */

export type QuickAddResult = {
  title: string;
  /** ISO timestamp, ready for the server action. */
  remindAt: string;
  priority: string;
};

export function QuickAddBar({
  defaultProjectId = "",
  onCreate,
  disabled = false,
}: {
  defaultProjectId?: string;
  /**
   * Persists the reminder. Omit to let the bar call the server action itself;
   * supply one (the offline path does) to intercept the write.
   */
  onCreate?: (result: QuickAddResult) => Promise<{ error?: string }>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Live preview of what the line parsed into. Recomputed on every keystroke,
  // which is cheap — the parser is a handful of regexes over a short string.
  const parsed = React.useMemo(
    () => (value.trim() ? parseQuickReminder(value) : null),
    [value]
  );

  const canSave = Boolean(parsed?.title) && !saving && !disabled;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed?.title || saving) return;

    setSaving(true);
    const payload: QuickAddResult = {
      title: parsed.title,
      remindAt: toIsoSubmit(parsed.remindAt),
      priority: quickPriority(parsed.title) ?? "none",
    };

    try {
      const result = onCreate
        ? await onCreate(payload)
        : await createQuickReminderAction({
            title: payload.title,
            remindAt: payload.remindAt,
            priority: payload.priority,
            projectId: defaultProjectId,
          });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setValue("");
      inputRef.current?.focus();
      router.refresh();
      toast.success(`Reminder set for ${formatPreviewTime(payload.remindAt)}.`);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(next: string) {
    setValue(next);
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 rounded-xl border bg-card p-2"
    >
      <div className="flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves; Escape clears, so a mis-typed line is one keystroke
            // from a clean slate.
            if (event.key === "Escape" && value) {
              event.preventDefault();
              setValue("");
            }
          }}
          placeholder="Quick add — “tomorrow 9am standup” or “in 2h call the bank”"
          aria-label="Quick add a reminder"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Clear"
            className="shrink-0 rounded text-muted-foreground transition hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <Button type="submit" size="sm" disabled={!canSave}>
          {saving ? "Adding…" : "Add"}
        </Button>
      </div>

      {parsed?.title ? (
        <p
          className={cn(
            "flex flex-wrap items-center gap-1.5 px-1 text-xs text-muted-foreground"
          )}
        >
          <span className="text-foreground">{parsed.title}</span>
          <span aria-hidden="true">·</span>
          <span>{formatPreviewTime(toIsoSubmit(parsed.remindAt))}</span>
          {parsed.matched ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
              read “{parsed.matched}”
            </span>
          ) : (
            <span className="text-muted-foreground/80">
              no time found — defaulting to an hour from now
            </span>
          )}
        </p>
      ) : null}
    </form>
  );
}

function formatPreviewTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "unscheduled";
  return at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}