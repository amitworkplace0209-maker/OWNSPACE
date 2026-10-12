"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryFormDialog, OpeningBalanceDialog } from "@/components/finance/category-dialogs";
import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  KIND_META,
} from "@/config/finance-categories";
import { formatCurrency, formatPercent } from "@/lib/format";
import { cn } from "cn";
import type { CategoryBoardEntry, FinanceKind } from "@/types";

const CURRENCY = "INR";

export type { CategoryBoardEntry };

/**
 * Every category, grouped by the book it belongs to.
 *
 * The order is the order the books are meant to be read in — what came in, what
 * the house costs, where the money sits, what is owed, what is invested, what
 * is left over — rather than alphabetically, because a household budget is read
 * by meaning, not by letter.
 */
export function CategoryBoard({
  entries,
  month,
  activeId,
  compact = false,
  readOnly = false,
  onCreate,
  emptyAction,
}: {
  entries: CategoryBoardEntry[];
  month: string;
  activeId?: string;
  compact?: boolean;
  readOnly?: boolean;
  onCreate?: () => void;
  /** Replaces the default empty state — used when the user has categories but has unpinned them all. */
  emptyAction?: React.ReactNode;
}) {
  const [editing, setEditing] = React.useState<CategoryBoardEntry | null>(null);
  const [balance, setBalance] = React.useState<CategoryBoardEntry | null>(null);

  // Grouped by book. Runs before the empty check below so the hook order is the
  // same whether or not there is anything to show.
  const books = React.useMemo(() => {
    const groups = new Map<FinanceKind | "unclassified", CategoryBoardEntry[]>();
    for (const entry of entries) {
      const key = entry.kind ?? "unclassified";
      const bucket = groups.get(key) ?? [];
      bucket.push(entry);
      groups.set(key, bucket);
    }
    // Books in reading order, unclassified last — it is the fallback, not a book.
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
      .filter((key) => groups.has(key))
      .map((key) => ({ key, items: groups.get(key) ?? [] }));
  }, [entries]);

  if (entries.length === 0) {
    if (emptyAction) return <>{emptyAction}</>;
    return (
      <EmptyState
        icon={Wallet}
        title="No categories yet"
        description="Add the categories you actually spend on and each one gets its own monthly and yearly report."
        action={
          readOnly || !onCreate ? undefined : (
            <Button onClick={onCreate}>
              <Plus /> Add a category
            </Button>
          )
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {books.map((book) => {
          const meta = book.key === "unclassified" ? null : KIND_META[book.key];
          const Icon = meta?.icon ?? Wallet;
          // The book total is the denominator for every tile inside it, which is
          // what makes "34% of the house" mean something.
          const bookTotal = book.items.reduce((sum, item) => sum + item.monthValue, 0);

          return (
            <section key={book.key} className="flex flex-col gap-3">
              <header className="flex flex-wrap items-center gap-2">
                <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </span>
                <h3 className="text-sm font-semibold">{meta?.label ?? "Other"}</h3>
                <span className="text-xs text-muted-foreground">{meta?.short ?? "Custom"}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatCurrency(bookTotal, CURRENCY, { compact: true })} this month
                </span>
              </header>

              {meta && !compact ? (
                <p className="-mt-1 text-xs text-muted-foreground">{meta.description}</p>
              ) : null}

              <div
                className={cn(
                  "grid gap-3",
                  compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                )}
              >
                {book.items
                  .slice()
                  .sort((a, b) => b.monthValue - a.monthValue)
                  .map((entry) => (
                    <CategoryTile
                      key={entry.id}
                      entry={entry}
                      bookTotal={bookTotal}
                      active={entry.id === activeId}
                      readOnly={readOnly}
                      onEdit={() => setEditing(entry)}
                      onBalance={() => setBalance(entry)}
                    />
                  ))}
              </div>
            </section>
          );
        })}
      </div>

      <CategoryFormDialog
        // Keyed so switching between two categories rebuilds the form rather than
        // leaving the previous one's name and book in the fields.
        key={editing?.id ?? "new"}
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        existingNames={entries.map((entry) => entry.name)}
        category={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                kind: editing.kind,
                color: editing.color,
                icon: editing.icon,
                type: editing.type,
              }
            : undefined
        }
      />

      <OpeningBalanceDialog
        open={Boolean(balance)}
        onOpenChange={(open) => !open && setBalance(null)}
        categoryId={balance?.id ?? ""}
        categoryName={balance?.name ?? ""}
        current={balance?.balance ?? 0}
        month={balance?.activeMonth ?? month}
      />
    </>
  );
}

function CategoryTile({
  entry,
  bookTotal,
  active,
  readOnly,
  onEdit,
  onBalance,
}: {
  entry: CategoryBoardEntry;
  bookTotal: number;
  active: boolean;
  readOnly: boolean;
  onEdit: () => void;
  onBalance: () => void;
}) {
  const Icon = (entry.icon && CATEGORY_ICONS[entry.icon]) || FALLBACK_CATEGORY_ICON;
  const isAccount = entry.kind === "cash_bank" || entry.type === "account";

  const change =
    entry.previousValue > 0
      ? ((entry.monthValue - entry.previousValue) / entry.previousValue) * 100
      : null;

  // An account's headline is its balance; everything else's is the month's
  // movement. A tile that showed both would not be able to lead with either.
  const headline = isAccount && entry.balance !== null ? entry.balance : entry.monthValue;
  const headlineLabel =
    isAccount && entry.balance !== null
      ? "Balance"
      : entry.kind === "investment"
        ? "Invested"
        : entry.kind === "income"
          ? "Earned"
          : "Spent";

  return (
    <Card
      className={cn(
        "group relative transition",
        active && "ring-primary/50 border-primary ring-2"
      )}
    >
      <CardHeader className="gap-2">
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
              {headlineLabel} this month
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-2.5">
        <div>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums",
              isAccount && entry.balance !== null && entry.balance < 0
                ? "text-destructive"
                : "text-foreground"
            )}
          >
            {formatCurrency(headline, CURRENCY, { compact: true })}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {change !== null ? (
              <span
                className={cn(
                  "flex items-center gap-0.5",
                  change > 0.05 ? "text-destructive" : change < -0.05 ? "text-success" : ""
                )}
              >
                {change > 0.05 ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {Math.abs(change).toFixed(0)}%
              </span>
            ) : entry.transactionCount > 0 ? (
              <span>first month</span>
            ) : (
              <span>nothing yet</span>
            )}
            {bookTotal > 0 && entry.monthValue > 0 ? (
              <span>· {formatPercent(entry.monthValue, bookTotal, 0)} of book</span>
            ) : null}
            {entry.transactionCount > 0 ? (
              <span>· {entry.transactionCount} txns</span>
            ) : null}
          </div>
        </div>

        {/* Share bar. Only drawn when there is a book to be a share of. */}
        {bookTotal > 0 && entry.monthValue > 0 ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (entry.monthValue / bookTotal) * 100)}%`,
                backgroundColor: entry.color ?? "var(--primary)",
              }}
            />
          </div>
        ) : null}

        <p className="text-[11px] text-muted-foreground">
          Year {formatCurrency(entry.yearValue, CURRENCY, { compact: true })}
        </p>

        <div className="flex items-center gap-1 border-t pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 flex-1 justify-start px-2 text-xs"
            render={<Link href={`/finance/category/${entry.id}?month=${entry.activeMonth}`} />}
          >
            Open report
            <ChevronRight className="size-3.5" />
          </Button>
          {isAccount && !readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={onBalance}
              title="Set the opening balance"
            >
              Balance
            </Button>
          ) : null}
          {!readOnly ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${entry.name}`} onClick={onEdit}>
              <SettingsIcon />
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
