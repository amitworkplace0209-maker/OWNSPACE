"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coins,
  Plus,
  Settings2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { BalanceLineChart, DailySpendChart, MonthlyTrendChart } from "@/components/finance/finance-charts";
import {
  CategoryBoard,
  type CategoryBoardEntry,
} from "@/components/finance/category-board";
import { CategoryFormDialog, OpeningBalanceDialog } from "@/components/finance/category-dialogs";
import {
  buildAccountSummary,
  buildCategoryReport,
  buildYearSummary,
  monthLabel,
  monthOverMonth,
  monthsWithData,
  shiftMonth,
  summariseLiability,
  summarisePortfolio,
  type LedgerEntry,
} from "@/lib/finance-logic";
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/lib/format";
import {
  CATEGORY_ICONS,
  FALLBACK_CATEGORY_ICON,
  KIND_META,
} from "@/config/finance-categories";
import { cn } from "cn";
import type { FinanceHolding, FinanceKind } from "@/types";

const CURRENCY = "INR";

/**
 * One category's page.
 *
 * Every figure below is cut from the same array of that category's transactions,
 * so the month report, the year report and the chart can never disagree. What
 * changes between categories is the headline: an account leads with its balance,
 * an investment with its value and P/L, a liability with what is still owed.
 */
export function CategoryReportView({
  category,
  entries,
  month,
  holdings,
  openingBalance,
  siblings,
  bookTotal,
  readOnly = false,
}: {
  category: { id: string; name: string; kind: FinanceKind | null; color: string | null; icon: string | null; type: string };
  entries: LedgerEntry[];
  month: string;
  holdings: FinanceHolding[];
  openingBalance: number;
  /** Every other category, for the side-by-side comparison at the foot. */
  siblings: CategoryBoardEntry[];
  /**
   * This category's own kind, summed for the month — including this category.
   * The share is "how much of the book", so leaving the category itself out
   * would report 100% for a book that contains nothing else.
   */
  bookTotal: number;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [balanceOpen, setBalanceOpen] = React.useState(false);

  // A navigation rather than local state, for the same reason as the main page:
  // the tiles in the comparison board are built server-side for one month, and a
  // client-side month variable would leave them describing a different one.
  const activeMonth = month;

  function goTo(next: string) {
    router.push(`/finance/category/${category.id}?month=${next}`);
  }

  const kind = category.kind;
  const meta = kind ? KIND_META[kind] : null;
  const Icon = (category.icon && CATEGORY_ICONS[category.icon]) || FALLBACK_CATEGORY_ICON;

  const report = React.useMemo(
    () =>
      buildCategoryReport(entries, {
        categoryId: category.id,
        name: category.name,
        color: category.color,
        month: activeMonth,
        year: activeMonth.slice(0, 4),
        shareBase: bookTotal,
      }),
    [entries, category.id, category.name, category.color, activeMonth, bookTotal]
  );

  const year = React.useMemo(() => buildYearSummary(entries, report.year), [entries, report.year]);

  // Only an account carries a balance, and only an investment carries a
  // portfolio. Both read the same rows, so there is nothing extra to fetch.
  const account = React.useMemo(
    () => (kind === "cash_bank" ? buildAccountSummary(entries, category.id, activeMonth, openingBalance) : null),
    [entries, category.id, activeMonth, openingBalance, kind]
  );

  const liability = React.useMemo(
    () => (kind === "liability" ? summariseLiability(entries, category.id) : null),
    [entries, category.id, kind]
  );

  const portfolio = React.useMemo(() => summarisePortfolio(holdings), [holdings]);

  const availableMonths = React.useMemo(() => monthsWithData(entries), [entries]);

  return (
    <div className="flex flex-col gap-5">
      {/* Breadcrumb + identity */}
      <div className="flex flex-col gap-3">
        <Link
          href="/finance"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-3.5" /> All categories
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-xl"
            style={{
              backgroundColor: category.color
                ? `color-mix(in oklab, ${category.color} 16%, transparent)`
                : "var(--muted)",
              color: category.color ?? "var(--muted-foreground)",
            }}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              {category.name}
              {meta ? (
                <Badge variant="secondary" className="rounded-full text-[10px]">
                  {meta.short}
                </Badge>
              ) : null}
            </h1>
            {meta ? <p className="text-xs text-muted-foreground">{meta.description}</p> : null}
          </div>

          {!readOnly ? (
            <div className="ml-auto flex items-center gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Settings2 /> Edit
              </Button>
              {kind === "cash_bank" ? (
                <Button variant="outline" size="sm" onClick={() => setBalanceOpen(true)}>
                  <Wallet /> Opening balance
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Month navigation — the same one the main page uses, so switching month
          behaves identically in both places. */}
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
          <span className="ml-1 text-sm font-medium">{monthLabel(activeMonth)}</span>
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

        {!readOnly ? (
          <Button
            size="sm"
            onClick={() => {
              router.push(`/finance?month=${activeMonth}&new=1&category=${category.id}`);
            }}
          >
            <Plus /> Add transaction
          </Button>
        ) : null}
      </div>

      {/* Headline — the number that means something for this kind of category. */}
      <CategoryHeadline
        kind={kind}
        account={account}
        liability={liability}
        portfolio={portfolio}
        holdings={holdings}
        report={report}
        year={year}
      />

      {/* Monthly and yearly, side by side, from the same rows. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodCard
          title="This month"
          caption={monthLabel(activeMonth)}
          income={report.current.income}
          expense={report.current.expense}
          count={report.current.transactionCount}
          share={report.current.share}
          trend={report.current.trend}
        />
        <PeriodCard
          title="This year"
          caption={report.year}
          income={report.yearly.income}
          expense={report.yearly.expense}
          count={report.yearly.transactionCount}
          share={null}
          trend={null}
        />
      </div>

      {/* The chart card. What it draws depends on what the category *is*. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {kind === "cash_bank"
              ? "Balance day by day"
              : kind === "investment"
                ? "Invested month by month"
                : "Spent day by day"}
          </CardTitle>
          <CardDescription>
            {kind === "cash_bank"
              ? `Carried in from ${monthLabel(shiftMonth(activeMonth, -1))} — nothing restarts each month`
              : `${monthLabel(activeMonth)}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {kind === "cash_bank" && account ? (
            <BalanceLineChart
              data={account.days}
              color={category.color ?? "var(--primary)"}
            />
          ) : (
            <DailySpendChart
              data={report.days}
              color={category.color ?? "var(--primary)"}
            />
          )}
        </CardContent>
      </Card>

      {/* Whole-year shape. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All twelve months of {report.year}</CardTitle>
          <CardDescription>
            Year total {formatCurrency(year.expense, CURRENCY, { compact: true })} ·{" "}
            {formatPercent(year.expense, year.expense || 1, 0)} across{" "}
            {year.activeMonths} active {year.activeMonths === 1 ? "month" : "months"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart
            data={report.months}
            color={category.color ?? "var(--primary)"}
          />
        </CardContent>
      </Card>

      {/* Holdings, for an investment category. */}
      {kind === "investment" && holdings.length > 0 ? (
        <HoldingsCard holdings={holdings} />
      ) : null}

      {/* The rows behind every number above. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Transactions in {monthLabel(activeMonth)}</CardTitle>
          <CardDescription>
            {report.entries.length === 0
              ? "Nothing recorded."
              : `${report.entries.length} ${report.entries.length === 1 ? "entry" : "entries"} · ${formatCurrency(report.current.expense + report.current.income, CURRENCY)} moved`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {report.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions for this category in {monthLabel(activeMonth)}.
            </p>
          ) : (
            <ul className="flex flex-col">
              {report.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0"
                >
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {new Date(`${entry.transaction_date}T00:00:00`).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {entry.description || entry.category?.name || "Transaction"}
                  </span>
                  {entry.source && entry.source !== "manual" ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {entry.source === "recurring" ? "auto" : "bill"}
                    </Badge>
                  ) : null}
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      entry.type === "income" ? "text-success" : "text-foreground"
                    )}
                  >
                    {formatSignedCurrency(
                      entry.type === "income" ? Number(entry.amount) : -Number(entry.amount),
                      CURRENCY
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Where this category sits among its siblings. */}
      {siblings.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {meta ? `${meta.label} side by side` : "Similar categories"}
            </CardTitle>
            <CardDescription>Same month, same data</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryBoard
              entries={siblings}
              month={activeMonth}
              activeId={category.id}
              compact
            />
          </CardContent>
        </Card>
      ) : null}

      <CategoryFormDialog
        key={category.id}
        open={editing}
        onOpenChange={setEditing}
        existingNames={siblings.map((entry) => entry.name).concat(category.name)}
        category={{
          id: category.id,
          name: category.name,
          kind,
          color: category.color,
          icon: category.icon,
          type: category.type,
        }}
      />

      <OpeningBalanceDialog
        open={balanceOpen}
        onOpenChange={setBalanceOpen}
        categoryId={category.id}
        categoryName={category.name}
        current={openingBalance}
        month={activeMonth}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Headline per kind
// ---------------------------------------------------------------------------

function CategoryHeadline({
  kind,
  account,
  liability,
  portfolio,
  holdings,
  report,
  year,
}: {
  kind: FinanceKind | null;
  account: ReturnType<typeof buildAccountSummary> | null;
  liability: ReturnType<typeof summariseLiability> | null;
  portfolio: ReturnType<typeof summarisePortfolio>;
  holdings: FinanceHolding[];
  report: ReturnType<typeof buildCategoryReport>;
  year: ReturnType<typeof buildYearSummary>;
}) {
  // An account leads with its balance, because that is the only figure that is
  // still true right now — everything else is a month's worth of movement.
  if (account) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Balance right now</p>
            <p
              className={cn(
                "dash-kpi-value mt-1",
                account.closingBalance < 0 ? "text-destructive" : "text-foreground"
              )}
            >
              {formatCurrency(account.closingBalance, CURRENCY)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Opened at {formatCurrency(account.openingBalance, CURRENCY)} on the 1st ·{" "}
              <span
                className={account.net >= 0 ? "text-success" : "text-destructive"}
              >
                {formatSignedCurrency(account.net, CURRENCY)}
              </span>{" "}
              this month
            </p>
          </CardContent>
        </Card>
        <StatCard
          title="Came in"
          value={formatCurrency(account.income, CURRENCY, { compact: true })}
          icon={ArrowUpRight}
          tone="success"
        />
        <StatCard
          title="Went out"
          value={formatCurrency(account.expense, CURRENCY, { compact: true })}
          icon={ArrowDownRight}
          tone="danger"
        />
      </div>
    );
  }

  // A liability leads with what is still owed, not with what was paid.
  if (liability) {
    const cleared = liability.borrowed > 0 && liability.outstanding <= 0;
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {cleared ? "Cleared" : "Still owed"}
            </p>
            <p
              className={cn(
                "dash-kpi-value mt-1",
                cleared ? "text-success" : "text-destructive"
              )}
            >
              {formatCurrency(Math.abs(liability.outstanding), CURRENCY)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Borrowed {formatCurrency(liability.borrowed, CURRENCY, { compact: true })} · repaid{" "}
              {formatCurrency(liability.repaid, CURRENCY, { compact: true })} across{" "}
              {liability.payments} {liability.payments === 1 ? "payment" : "payments"}
            </p>
          </CardContent>
        </Card>
        <StatCard
          title="Repaid so far"
          value={formatCurrency(liability.repaid, CURRENCY, { compact: true })}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          title="Average payment"
          value={
            liability.averagePayment === null
              ? "—"
              : formatCurrency(liability.averagePayment, CURRENCY, { compact: true })
          }
          icon={Coins}
          secondary={
            liability.peakOutstanding > 0
              ? `Peak was ${formatCurrency(liability.peakOutstanding, CURRENCY, { compact: true })}`
              : undefined
          }
        />
      </div>
    );
  }

  // An investment leads with what it is worth now, and P/L against what went in.
  if (kind === "investment") {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2">
          <CardContent className="pt-4">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Current value</p>
            <p className="dash-kpi-value mt-1">
              {portfolio.currentValue === null
                ? formatCurrency(portfolio.invested, CURRENCY, { compact: true })
                : formatCurrency(portfolio.currentValue, CURRENCY, { compact: true })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {portfolio.pnl === null
                ? `${holdings.length} ${holdings.length === 1 ? "holding" : "holdings"} · enter a price to see profit`
                : `${formatSignedCurrency(portfolio.pnl, CURRENCY, { compact: true })} (${formatPercent(portfolio.pnl, portfolio.invested, 1)}) against ${formatCurrency(portfolio.invested, CURRENCY, { compact: true })} invested`}
            </p>
          </CardContent>
        </Card>
        <StatCard
          title="Invested this month"
          value={formatCurrency(report.current.expense, CURRENCY, { compact: true })}
          icon={ArrowUpRight}
        />
        <StatCard
          title="Invested this year"
          value={formatCurrency(report.yearly.expense, CURRENCY, { compact: true })}
          icon={CalendarDays}
          secondary={`${year.activeMonths} active months`}
        />
      </div>
    );
  }

  // Everything else — household, income, plain spending, and any category the
  // user made without picking a book — leads with this month against last.
  const change = monthOverMonth(report.current.expense + report.current.income, report.previous.expense + report.previous.income);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="lg:col-span-2">
        <CardContent className="pt-4">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {kind ? KIND_META[kind].headline : "This month"}
          </p>
          <p className="dash-kpi-value mt-1">
            {formatCurrency(report.current.expense || report.current.income, CURRENCY)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {report.previous.expense + report.previous.income > 0 ? (
              <>
                <span className={change.direction === "up" ? "text-destructive" : "text-success"}>
                  {change.percent === null
                    ? "new this month"
                    : `${change.direction === "up" ? "up" : "down"} ${Math.abs(change.percent).toFixed(1)}%`}
                </span>{" "}
                vs last month
              </>
            ) : (
              "No comparable figure last month"
            )}
            {report.current.share !== null ? ` · ${report.current.share.toFixed(0)}% of the book` : null}
          </p>
        </CardContent>
      </Card>
      <StatCard
        title="Last month"
        value={formatCurrency(
          report.previous.expense || report.previous.income,
          CURRENCY,
          { compact: true }
        )}
        icon={TrendingDown}
      />
      <StatCard
        title="All of this year"
        value={formatCurrency(
          report.yearly.expense || report.yearly.income,
          CURRENCY,
          { compact: true }
        )}
        icon={CalendarDays}
        secondary={`${report.yearly.transactionCount} entries in ${report.year}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period card — one month or one year, identical shape
// ---------------------------------------------------------------------------

function PeriodCard({
  title,
  caption,
  income,
  expense,
  count,
  share,
  trend,
}: {
  title: string;
  caption: string;
  income: number;
  expense: number;
  count: number;
  share: number | null;
  trend: { percent: number | null; direction: "up" | "down" | "flat" } | null;
}) {
  const net = income - expense;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{caption}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-1.5 text-sm">
          <Row label="Came in" value={formatCurrency(income, CURRENCY)} tone="success" />
          <Row label="Went out" value={formatCurrency(expense, CURRENCY)} tone="danger" />
          <div className="flex justify-between border-t pt-1.5 font-medium">
            <dt>Net</dt>
            <dd className={cn("tabular-nums", net >= 0 ? "text-success" : "text-destructive")}>
              {formatSignedCurrency(net, CURRENCY)}
            </dd>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <dt>Entries</dt>
            <dd className="tabular-nums">{count}</dd>
          </div>
          {share !== null ? (
            <div className="flex justify-between text-xs text-muted-foreground">
              <dt>Share of the book</dt>
              <dd className="tabular-nums">{share.toFixed(1)}%</dd>
            </div>
          ) : null}
        </dl>

        {trend && trend.percent !== null ? (
          <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            {trend.direction === "up" ? (
              <TrendingUp className="size-3.5 text-destructive" />
            ) : (
              <TrendingDown className="size-3.5 text-success" />
            )}
            {Math.abs(trend.percent).toFixed(1)}% vs the month before
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

function HoldingsCard({ holdings }: { holdings: FinanceHolding[] }) {
  const valued = React.useMemo(
    () =>
      holdings.map((holding) => {
        const invested = Number(holding.quantity) * Number(holding.buy_price);
        const current =
          holding.current_price === null ? null : Number(holding.quantity) * Number(holding.current_price);
        return {
          ...holding,
          invested,
          current,
          pnl: current === null ? null : current - invested,
        };
      }),
    [holdings]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">What is held here</CardTitle>
        <CardDescription>
          Prices are entered by you — there is no live market feed, so nothing here updates on its own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col">
          {valued.map((holding) => (
            <li
              key={holding.id}
              className="flex items-center gap-3 border-b border-border/50 py-2.5 last:border-0"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                {holding.symbol.slice(0, 3)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{holding.name || holding.symbol}</p>
                <p className="text-[11px] text-muted-foreground">
                  {formatNumber(Number(holding.quantity))} ×{" "}
                  {formatCurrency(Number(holding.buy_price), CURRENCY)} ={" "}
                  {formatCurrency(holding.invested, CURRENCY)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium tabular-nums">
                  {holding.current === null ? "—" : formatCurrency(holding.current, CURRENCY)}
                </p>
                <p
                  className={cn(
                    "text-[11px] tabular-nums",
                    holding.pnl === null
                      ? "text-muted-foreground"
                      : holding.pnl >= 0
                        ? "text-success"
                        : "text-destructive"
                  )}
                >
                  {holding.pnl === null ? "No price set" : formatSignedCurrency(holding.pnl, CURRENCY)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
