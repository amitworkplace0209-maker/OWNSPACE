"use client";

import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  CategoryPieChart,
  DailySpendChart,
  IncomeExpenseChart,
} from "@/components/finance/finance-charts";
import {
  buildMonthStatement,
  buildYearSummary,
  groupByCategory,
  monthLabel,
  type LedgerEntry,
  type MonthBucket,
} from "@/lib/finance-logic";
import { formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/format";
import { cn } from "cn";
import type { CardId } from "@/components/finance/report-cards";

const CURRENCY = "INR";

/**
 * The individual report cards.
 *
 * Each one is a pure function of the month and the entries, so the page can show
 * any subset of them and none of them can disagree with another. Cards with
 * nothing to say render an empty state rather than being hidden — the page
 * already tells the user which cards they turned on, so silently dropping one
 * would look like the page had lost it.
 */
export function ReportCardGrid({
  enabled,
  month,
  entries,
  year,
  openingBalance,
}: {
  enabled: CardId[];
  month: string;
  entries: LedgerEntry[];
  year: ReturnType<typeof buildYearSummary>;
  openingBalance: number;
}) {
  const statement = buildMonthStatement(entries, month, openingBalance);
  const inMonth = entries.filter((entry) => entry.transaction_date.slice(0, 7) === month);
  const expenseSlices = groupByCategory(inMonth, "expense");
  const incomeSlices = groupByCategory(inMonth, "income");

  const on = (id: CardId) => enabled.includes(id);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {on("trend") ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              Income vs expenses — all twelve months of {year.year}
            </CardTitle>
            <CardDescription>
              Year total {formatCurrency(year.expense, CURRENCY, { compact: true })} out,{" "}
              {formatCurrency(year.income, CURRENCY, { compact: true })} in
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IncomeExpenseChart data={year.months} activeMonth={month} />
          </CardContent>
        </Card>
      ) : null}

      {on("savings") ? <SavingsCard year={year} /> : null}

      {on("spending") ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Where the money went — {monthLabel(month)}</CardTitle>
            <CardDescription>Expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2">
              <CategoryPieChart
                data={expenseSlices.map((slice) => ({
                  id: slice.id,
                  name: slice.name,
                  value: slice.value,
                  color: slice.color,
                }))}
              />
              <ul className="flex flex-col gap-1.5">
                {expenseSlices.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Nothing to split up for {monthLabel(month)}.
                  </li>
                ) : (
                  expenseSlices.slice(0, 12).map((slice) => (
                    <li key={slice.id ?? "none"} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: slice.color ?? "var(--primary)" }}
                      />
                      <Link
                        href={slice.id ? `/finance/category/${slice.id}?month=${month}` : "/finance"}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        {slice.name}
                      </Link>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {slice.share.toFixed(0)}%
                      </span>
                      <span className="w-20 text-right tabular-nums font-medium">
                        {formatCurrency(slice.value, CURRENCY, { compact: true })}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {on("income") ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">What came in</CardTitle>
            <CardDescription>Income by category — {monthLabel(month)}</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeSlices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No income recorded for {monthLabel(month)}.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {incomeSlices.map((slice) => (
                  <li key={slice.id ?? "none"} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.color ?? "var(--success)" }}
                    />
                    <Link
                      href={slice.id ? `/finance/category/${slice.id}?month=${month}` : "/finance"}
                      className="min-w-0 flex-1 truncate hover:underline"
                    >
                      {slice.name}
                    </Link>
                    <span className="tabular-nums font-medium text-success">
                      {formatCurrency(slice.value, CURRENCY)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {on("daily") ? (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Day by day — {monthLabel(month)}</CardTitle>
            <CardDescription>Which days the money actually moved</CardDescription>
          </CardHeader>
          <CardContent>
            <DailySpendChart data={expenseDays(inMonth)} color="var(--destructive)" />
          </CardContent>
        </Card>
      ) : null}

      {on("year") ? (
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm">The year {year.year} in one table</CardTitle>
            <CardDescription>
              {year.activeMonths} active {year.activeMonths === 1 ? "month" : "months"} ·{" "}
              {formatCurrency(year.income, CURRENCY, { compact: true })} in,{" "}
              {formatCurrency(year.expense, CURRENCY, { compact: true })} out
            </CardDescription>
          </CardHeader>
          <CardContent>
            <YearTable months={year.months} month={month} />
          </CardContent>
        </Card>
      ) : null}

      {/* Only reachable when every card is turned off. */}
      {enabled.length === 0 ? (
        <EmptyState
          icon={ChartColumn}
          title="No cards turned on"
          description="Use the Cards button at the top to pick the charts you want to see."
          className="lg:col-span-3"
        />
      ) : null}

      {/* Keeps the statement number on the page without spending a card slot. */}
      <p className="text-xs text-muted-foreground lg:col-span-3">
        Net this month{" "}
        <span className={statement.net >= 0 ? "text-success" : "text-destructive"}>
          {formatSignedCurrency(statement.net, CURRENCY)}
        </span>{" "}
        · {statement.transactionCount} entries across {statement.activeDays} days
      </p>
    </div>
  );
}

function SavingsCard({ year }: { year: ReturnType<typeof buildYearSummary> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Savings rate</CardTitle>
        <CardDescription>{year.year} so far</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <p className="dash-kpi-value">
            {year.savingsRate === null ? "—" : formatPercent(year.savingsRate, 100, 1)}
          </p>
          <p className="text-xs text-muted-foreground">
            {year.savingsRate === null
              ? "No income recorded this year"
              : `${formatCurrency(year.net, CURRENCY)} kept of ${formatCurrency(year.income, CURRENCY)}`}
          </p>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              (year.savingsRate ?? 0) >= 20
                ? "bg-success"
                : (year.savingsRate ?? 0) >= 0
                  ? "bg-warning"
                  : "bg-destructive"
            )}
            style={{ width: `${Math.min(100, Math.max(0, year.savingsRate ?? 0))}%` }}
          />
        </div>

        <dl className="flex flex-col gap-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Avg per active month</dt>
            <dd className="tabular-nums">
              {formatCurrency(year.averageMonthlyExpense, CURRENCY, { compact: true })}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Active months</dt>
            <dd className="tabular-nums">{year.activeMonths} of 12</dd>
          </div>
          {year.worstMonth ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Heaviest month</dt>
              <dd className="tabular-nums">
                {monthLabel(year.worstMonth.month)} ·{" "}
                {formatCurrency(year.worstMonth.expense, CURRENCY, { compact: true })}
              </dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * The year as a table.
 *
 * Months with nothing in them are struck through rather than left blank: a blank
 * row reads as "you spent nothing", which is a different and wrong claim from
 * "you never opened the app that month".
 */
function YearTable({ months, month }: { months: MonthBucket[]; month: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Month</th>
            <th className="py-2 pr-3 text-right font-medium">In</th>
            <th className="py-2 pr-3 text-right font-medium">Out</th>
            <th className="py-2 pr-3 text-right font-medium">Net</th>
            <th className="py-2 text-right font-medium">Entries</th>
          </tr>
        </thead>
        <tbody>
          {months.map((row) => {
            const current = row.month === month;
            return (
              <tr
                key={row.month}
                className={cn(
                  "border-b last:border-0",
                  current && "bg-primary/5",
                  !row.hasData && "text-muted-foreground/50"
                )}
              >
                <td className={cn("py-2 pr-3", !row.hasData && "line-through")}>
                  {monthLabel(row.month).replace(String(new Date().getFullYear() + 1), "").replace(String(new Date().getFullYear()), "")}
                  {current ? (
                    <span className="ml-1.5 text-[10px] text-primary">open</span>
                  ) : null}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-success">
                  {row.hasData ? formatCurrency(row.income, CURRENCY, { compact: true }) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-destructive">
                  {row.hasData ? formatCurrency(row.expense, CURRENCY, { compact: true }) : "—"}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {row.hasData ? formatSignedCurrency(row.net, CURRENCY, { compact: true }) : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {row.hasData ? row.transactionCount : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Expense days for the entries of one month, in date order.
 *
 * Only days that saw an expense appear — a bar chart of thirty slots where
 * twenty-six are zero says less than one that shows when the money moved.
 */
export function expenseDays(entries: LedgerEntry[]): MonthBucket[] {
  const byDay = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    if (entry.type !== "expense") continue;
    const bucket = byDay.get(entry.transaction_date) ?? [];
    bucket.push(entry);
    byDay.set(entry.transaction_date, bucket);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => ({
      month: date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      income: 0,
      expense: bucket.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
      net: 0,
      transactionCount: bucket.length,
      hasData: true,
    }));
}
