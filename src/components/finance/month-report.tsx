"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Info,
  LayoutGrid,
  LineChart,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryBoard, type CategoryBoardEntry } from "@/components/finance/category-board";
import { CategoryFormDialog } from "@/components/finance/category-dialogs";
import { seedFinanceCategoriesAction } from "@/lib/actions/finance";
import { DEFAULT_FINANCE_CATEGORIES } from "@/config/finance-categories";
import {
  buildMonthStatement,
  buildYearSummary,
  daysInMonth,
  monthLabel,
  monthOverMonth,
  monthsWithData,
  shiftMonth,
  type LedgerEntry,
} from "@/lib/finance-logic";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { cn } from "cn";

const CURRENCY = "INR";

/**
 * The month page.
 *
 * Two things only: the balance statement and the category board. The chart cards
 * live on their own page where they can be picked on and off — a page that shows
 * five empty charts above the numbers people actually came for reads as broken,
 * and a page that shows three charts plus five more behind a menu reads as
 * cluttered. This one is neither.
 *
 * Everything here is cut from one server read for one month, so the statement
 * and the tiles beneath it can never describe different months.
 */
export function MonthReportView({
  month,
  requestedMonth,
  entries,
  board,
  totalCategories,
  openingBalance,
  allTimeTruncated,
  readOnly = false,
}: {
  month: string;
  /** The month the URL asked for, even if it holds nothing. */
  requestedMonth: string | null;
  entries: LedgerEntry[];
  /** Only the categories the user pinned to this page. */
  board: CategoryBoardEntry[];
  /** How many categories exist in total, pinned or not. */
  totalCategories: number;
  /** Money in hand before any transaction was recorded. */
  openingBalance: number;
  allTimeTruncated: boolean;
  readOnly?: boolean;
}) {
  const [creating, setCreating] = React.useState(false);
  const router = useRouter();

  // Not local state. Moving between months has to be a navigation, because the
  // tiles below are built server-side for one month and a client-side month
  // variable would leave them describing another.
  const activeMonth = month;

  function goTo(next: string) {
    router.push(`/finance?month=${next}`);
  }

  const statement = React.useMemo(
    () => buildMonthStatement(entries, activeMonth, openingBalance),
    [entries, activeMonth, openingBalance]
  );
  const year = React.useMemo(
    () => buildYearSummary(entries, activeMonth.slice(0, 4), openingBalance),
    [entries, activeMonth, openingBalance]
  );

  const availableMonths = React.useMemo(() => monthsWithData(entries), [entries]);
  const previousMonth = shiftMonth(activeMonth, -1);
  const previous = React.useMemo(
    () => buildMonthStatement(entries, previousMonth, openingBalance),
    [entries, previousMonth, openingBalance]
  );

  const expenseChange = monthOverMonth(statement.expense, previous.expense);
  const incomeChange = monthOverMonth(statement.income, previous.income);

  // An empty requested month is worth saying out loud: the URL said one thing
  // and the page is showing another, and silently substituting would hide it.
  const substituted = requestedMonth !== null && requestedMonth !== activeMonth;

  return (
    <div className="flex flex-col gap-5">
      {substituted ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 text-warning" />
          <span>
            {monthLabel(requestedMonth!)} has nothing recorded in it, so this page is showing{" "}
            <button
              type="button"
              className="font-medium text-foreground underline"
              onClick={() => goTo(requestedMonth!)}
            >
              {monthLabel(activeMonth)}
            </button>{" "}
            — the most recent month with data.
          </span>
        </div>
      ) : null}

      {allTimeTruncated ? (
        <div className="flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 text-warning" />
          This ledger is past 20,000 transactions, so the carried-forward balance is calculated from
          the most recent 20,000 and may not include the very first entries.
        </div>
      ) : null}

      {/* Month navigation. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => goTo(shiftMonth(activeMonth, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            onClick={() => goTo(shiftMonth(activeMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-1 text-lg font-semibold tracking-tight">{monthLabel(activeMonth)}</h2>
          {availableMonths.length > 0 ? (
            <select
              value={activeMonth}
              onChange={(event) => goTo(event.target.value)}
              aria-label="Jump to a month with data"
              className="ml-2 h-7 rounded-lg border border-input bg-transparent px-2 text-xs outline-none"
            >
              {availableMonths.map((key) => (
                <option key={key} value={key}>
                  {monthLabel(key)}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/finance/report?month=${activeMonth}`} />}
          >
            <LineChart /> Charts
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={`/finance?month=${activeMonth}&view=workspace`} />}
          >
            <ListIcon /> Ledger
          </Button>
          {!readOnly ? (
            <Button variant="outline" size="sm" onClick={() => setCreating(true)}>
              <Plus /> Category
            </Button>
          ) : null}
        </div>
      </div>

      {/* The balance statement. Opening first, then what happened, then where it
          landed — in that order, because that is the order it happened in. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Hisab — {monthLabel(activeMonth)}</CardTitle>
          <CardDescription>
            Opens on the last day&apos;s balance and closes on this one. Nothing restarts each month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <FlowFigure
              label="Opening balance"
              value={formatCurrency(statement.openingBalance, CURRENCY)}
              hint={`Carried from ${monthLabel(previousMonth)}`}
              tone={statement.openingBalance < 0 ? "danger" : "neutral"}
            />
            <FlowFigure
              label="Came in"
              value={formatSignedCurrency(statement.income, CURRENCY)}
              hint={
                previous.income > 0
                  ? `${incomeChange.percent === null ? "new" : `${incomeChange.percent > 0 ? "+" : ""}${incomeChange.percent.toFixed(0)}%`} vs last month`
                  : "No income last month"
              }
              tone="success"
            />
            <FlowFigure
              label="Went out"
              value={formatSignedCurrency(-statement.expense, CURRENCY)}
              hint={
                previous.expense > 0
                  ? `${expenseChange.percent === null ? "new" : `${expenseChange.percent > 0 ? "+" : ""}${expenseChange.percent.toFixed(0)}%`} vs last month`
                  : "No spending last month"
              }
              tone="danger"
            />
            <FlowFigure
              label="Closing balance"
              value={formatCurrency(statement.closingBalance, CURRENCY)}
              hint="Next month opens here"
              tone={statement.closingBalance < 0 ? "danger" : "neutral"}
              emphasis
            />
          </div>

          <dl className="mt-4 grid gap-x-6 gap-y-1 border-t pt-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="Entries" value={String(statement.transactionCount)} />
            <Detail
              label="Days active"
              value={`${statement.activeDays} of ${daysInMonth(activeMonth)}`}
            />
            <Detail
              label="Average per day"
              value={formatCurrency(statement.dailyAverage, CURRENCY)}
            />
            <Detail
              label="Projected for the month"
              value={formatCurrency(statement.projectedExpense, CURRENCY)}
              hint={
                statement.projectedExpense > statement.expense
                  ? "at this month's rate"
                  : undefined
              }
            />
          </dl>

          {/* The year, as one line. The full twelve-month picture is a card on
              the charts page; here it is context for the number above it. */}
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            {year.year} so far:{" "}
            <span className="text-success">{formatCurrency(year.income, CURRENCY, { compact: true })}</span>{" "}
            in,{" "}
            <span className="text-destructive">{formatCurrency(year.expense, CURRENCY, { compact: true })}</span>{" "}
            out across {year.activeMonths} active {year.activeMonths === 1 ? "month" : "months"} ·{" "}
            <Link href={`/finance/report?month=${activeMonth}`} className="underline">
              charts
            </Link>
          </p>
        </CardContent>
      </Card>

      <StarterCategoriesPrompt
        existing={totalCategories}
        readOnly={readOnly}
      />

      {/* Every category the user chose to keep on this page. */}
      <section className="flex flex-col gap-3">
        <header className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Your categories</h3>
          <span className="text-xs text-muted-foreground">
            {board.length} on this page · each has its own monthly and yearly report
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            render={<Link href={`/finance/categories?month=${activeMonth}`} />}
          >
            <LayoutGrid /> Categories
          </Button>
        </header>

        <CategoryBoard
          entries={board}
          month={activeMonth}
          readOnly={readOnly}
          onCreate={() => setCreating(true)}
          emptyAction={
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                You have categories, but none of them are on this page yet. Tick the ones you want to
                see here — nothing gets deleted.
              </p>
              <Button
                render={
                  <Link href={`/finance/categories?month=${activeMonth}`} />
                }
              >
                <LayoutGrid /> Choose categories
              </Button>
            </div>
          }
        />
      </section>

      <CategoryFormDialog
        key="new"
        open={creating}
        onOpenChange={setCreating}
        existingNames={board.map((entry) => entry.name)}
      />
    </div>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------

/**
 * Offers the starter set of categories.
 *
 * Shown only while the user has few or none — a ledger they have already filled
 * in does not need an app telling them what categories exist. Safe to press more
 * than once: the action skips anything already there.
 */
function StarterCategoriesPrompt({ existing, readOnly }: { existing: number; readOnly: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (readOnly || existing >= DEFAULT_FINANCE_CATEGORIES.length) return null;

  const firstRun = existing === 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <Sparkles className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {firstRun
            ? "Start with the categories a household actually uses"
            : "Add the missing starter categories"}
        </p>
        <p className="text-xs text-muted-foreground">
          {DEFAULT_FINANCE_CATEGORIES.length} across six books — Hisab, Income, Ghar, Udhaar, Nivesh
          and everyday kharche. Each gets its own page with monthly and yearly figures.
        </p>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await seedFinanceCategoriesAction();
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success(
              result.added
                ? `Added ${result.added} ${result.added === 1 ? "category" : "categories"}.`
                : "You already have all of them."
            );
            router.refresh();
          })
        }
      >
        {pending ? "Adding…" : firstRun ? "Add them" : "Add missing"}
      </Button>
    </div>
  );
}

function FlowFigure({
  label,
  value,
  hint,
  tone,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "neutral" | "success" | "danger";
  emphasis?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border p-3", emphasis && "border-primary/40 bg-primary/5")}>
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">
        {value}
        {hint ? <span className="block text-[10px] text-muted-foreground">{hint}</span> : null}
      </dd>
    </div>
  );
}
