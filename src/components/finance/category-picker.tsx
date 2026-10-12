"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { CategoryFormDialog } from "@/components/finance/category-dialogs";
import {
  deleteFinanceCategoryAction,
  setCategoryPinnedAction,
} from "@/lib/actions/finance";
import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  KIND_META,
} from "@/config/finance-categories";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "cn";
import type { CategoryBoardEntry, FinanceKind } from "@/types";

const CURRENCY = "INR";

/**
 * Pick the categories worth seeing every day.
 *
 * Toggling is optimistic: the tile flips immediately and the server call follows,
 * because a checkbox that waits a round trip to move feels broken. A failure
 * rolls it back and says so — the number next to it is real money and silently
 * losing the choice would be worse than a flash of the wrong state.
 *
 * Unpinning never deletes anything. The category keeps its history, its report
 * and its own URL; it just stops being on the money page.
 */
export function CategoryPickerView({
  entries,
  month,
  totalCategories,
}: {
  entries: CategoryBoardEntry[];
  month: string;
  totalCategories: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<CategoryBoardEntry | null>(null);
  const [onlyPinned, setOnlyPinned] = React.useState(false);

  const pinned = entries.filter((entry) => entry.isPinned).length;

  function toggle(entry: CategoryBoardEntry) {
    setBusy(entry.id);

    startTransition(async () => {
      const result = await setCategoryPinnedAction(entry.id, !entry.isPinned);
      setBusy(null);
      if (result.error) {
        toast.error(result.error);
        // The tile reads straight from props, so there is no local copy to roll
        // back — a refresh is what puts the truth back on screen.
        router.refresh();
      }
    });
  }

  const visible = onlyPinned ? entries.filter((entry) => entry.isPinned) : entries;

  const groups = React.useMemo(() => {
    const buckets = new Map<FinanceKind | "unclassified", CategoryBoardEntry[]>();
    for (const entry of visible) {
      const key = entry.kind ?? "unclassified";
      const bucket = buckets.get(key) ?? [];
      bucket.push(entry);
      buckets.set(key, bucket);
    }
    const order: Array<FinanceKind | "unclassified"> = [
      "income",
      "cash_bank",
      "household",
      "expense",
      "liability",
      "investment",
      "unclassified",
    ];
    return order
      .filter((key) => buckets.has(key))
      .map((key) => ({
        key,
        items: buckets.get(key) ?? [],
        total: (buckets.get(key) ?? []).reduce((sum, item) => sum + item.monthValue, 0),
      }));
  }, [visible]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" render={<Link href={`/finance?month=${month}`} />}>
            <ArrowLeft /> Money
          </Button>
          <span className="h-4 w-px bg-border" />
          <span className="text-sm">
            <span className="font-semibold">{pinned}</span> of {totalCategories} on your page
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onlyPinned ? (
            <Button variant="outline" size="sm" onClick={() => setOnlyPinned(false)}>
              <Eye /> Showing all
            </Button>
          ) : pinned < totalCategories ? (
            <Button variant="outline" size="sm" onClick={() => setOnlyPinned(true)}>
              <EyeOff /> Hide the unpinned
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Add category
          </Button>
        </div>
      </div>

      {pinned === 0 && entries.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <span className="font-medium">Nothing is on your money page.</span>{" "}
          <span className="text-muted-foreground">
            Tick a few below and they will lead the page. Nothing has been deleted — every category
            still has its own report.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        {groups.map((group) => {
          const meta = group.key === "unclassified" ? null : KIND_META[group.key];
          // A plain map read, not a call that returns a component: React's
          // static-components rule is right that a component built during render
          // loses its identity on every pass.
          const Icon = meta?.icon ?? FALLBACK_CATEGORY_ICON;

          return (
            <section key={group.key} className="flex flex-col gap-2.5">
              <header className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <h2 className="text-sm font-semibold">{meta?.label ?? "Other"}</h2>
                <span className="text-xs text-muted-foreground">
                  {group.items.filter((entry) => entry.isPinned).length} of {group.items.length}{" "}
                  on your page
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatCurrency(group.total, CURRENCY, { compact: true })} this month
                </span>
              </header>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((entry) => (
                  <PickTile
                    key={entry.id}
                    entry={entry}
                    bookTotal={group.total}
                    busy={busy === entry.id}
                    disabled={pending}
                    onToggle={() => toggle(entry)}
                    onDelete={() => setDeleting(entry)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border p-6 text-center">
          <p className="text-sm font-medium">No categories yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add the ones you actually spend on, or start from the full set.
          </p>
          <Button className="mt-3" onClick={() => setCreating(true)}>
            <Plus /> Add a category
          </Button>
        </div>
      ) : null}

      <CategoryFormDialog
        key="new"
        open={creating}
        onOpenChange={setCreating}
        existingNames={entries.map((entry) => entry.name)}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The transactions recorded against it stay in your ledger, but they will show up as uncategorised."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          const target = deleting;
          setDeleting(null);
          const result = await deleteFinanceCategoryAction(target.id);
          if (result.error) toast.error(result.error);
          else {
            toast.success("Category deleted.");
            router.refresh();
          }
        }}
      />
    </div>
  );
}

function PickTile({
  entry,
  bookTotal,
  busy,
  disabled,
  onToggle,
  onDelete,
}: {
  entry: CategoryBoardEntry;
  bookTotal: number;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const Icon = (entry.icon && CATEGORY_ICONS[entry.icon]) || FALLBACK_CATEGORY_ICON;
  const on = entry.isPinned;
  const isAccount = entry.kind === "cash_bank" || entry.type === "account";
  const headline = isAccount && entry.balance !== null ? entry.balance : entry.monthValue;

  return (
    <Card
      className={cn(
        "transition",
        on ? "border-primary/40" : "border-dashed opacity-70 hover:opacity-100"
      )}
    >
      <CardHeader className="gap-2 pb-2">
        <div className="flex items-start gap-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: entry.color
                ? `color-mix(in oklab, ${entry.color} 16%, transparent)`
                : "var(--muted)",
              color: entry.color ?? "var(--muted-foreground)",
            }}
          >
            <Icon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">{entry.name}</CardTitle>
            <CardDescription className="text-[11px]">
              {isAccount ? "Balance" : "This month"}
            </CardDescription>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={`${on ? "Hide" : "Show"} ${entry.name} on the money page`}
            disabled={disabled}
            onClick={onToggle}
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition disabled:opacity-50",
              on
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input hover:bg-accent"
            )}
          >
            {on ? <Check className="size-3.5" /> : null}
          </button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <div>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(headline, CURRENCY, { compact: true })}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Year {formatCurrency(entry.yearValue, CURRENCY, { compact: true })}
            {bookTotal > 0 && entry.monthValue > 0
              ? ` · ${formatPercent(entry.monthValue, bookTotal, 0)} of book`
              : ""}
          </p>
        </div>

        {bookTotal > 0 && entry.monthValue > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, (entry.monthValue / bookTotal) * 100)}%`,
                backgroundColor: entry.color ?? "var(--primary)",
              }}
            />
          </div>
        ) : null}

        <div className="flex items-center gap-1 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 justify-start px-2 text-xs"
            render={<Link href={`/finance/category/${entry.id}?month=${entry.activeMonth}`} />}
          >
            Report
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${entry.name}`}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        {busy ? <span className="sr-only">Saving…</span> : null}
      </CardContent>
    </Card>
  );
}
