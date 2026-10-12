"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Landmark,
  LineChart,
  PiggyBank,
  Plus,
  Receipt,
  Repeat,
  Search,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatStrip, type StatStripItem } from "@/components/shared/stat-strip";
import { WorkspaceToolbar, VIEW_ICONS } from "@/components/shared/workspace-toolbar";
import {
  bulkDeleteTransactionsAction,
  createFinanceTransactionAction,
  deleteBillAction,
  deleteBudgetAction,
  deleteHoldingAction,
  deleteRecurringAction,
  generateRecurringTransactionsAction,
  payBillAction,
  saveBillAction,
  saveBudgetAction,
  saveHoldingAction,
  saveRecurringAction,
  skipBillAction,
  updateFinanceTransactionAction,
  updateHoldingPriceAction,
  type FinanceFormState,
} from "@/lib/actions/finance";
import {
  billState,
  buildLedger,
  computeBudgets,
  groupByCategory,
  monthKey,
  monthLabel,
  monthlyTrend,
  monthOverMonth,
  shiftMonth,
  summarisePortfolio,
  summarizeMonth,
  valueHoldings,
  type BudgetProgress,
  type LedgerEntry,
} from "@/lib/finance-logic";
import { formatCurrency, formatNumber, formatPercent, formatSignedCurrency } from "@/lib/format";
import { paymentMethodLabels } from "@/config/finance";
import { cn } from "cn";
import {
  PAYMENT_METHODS,
  RECURRENCE_RULES,
  type FinanceBill,
  type FinanceBudget,
  type FinanceCategory,
  type FinanceHolding,
  type FinanceRecurring,
  type Project,
} from "@/types";

const CURRENCY = "INR";

type Tab = "overview" | "ledger" | "budgets" | "bills" | "recurring" | "investments";

type TransactionRow = LedgerEntry & {
  reference?: string | null;
  source?: string | null;
  occurred_at?: string | null;
  notes?: string | null;
  node_id?: string | null;
};

/**
 * Finance.
 *
 * Everything is rupees: amounts are formatted with `en-IN`, so twelve lakh
 * fifty-six thousand reads "₹12,56,000.00" rather than the western
 * "₹1,256,000.00". The old page hard-coded USD with no decimals, so a month of
 * spending displayed as rounded dollars.
 */
export function FinanceWorkspace({
  transactions,
  categories,
  projects,
  budgets,
  bills,
  recurring,
  holdings,
  month,
  projectId,
  readOnly = false,
  preselectedCategoryId,
}: {
  transactions: TransactionRow[];
  categories: FinanceCategory[];
  projects: Project[];
  budgets: FinanceBudget[];
  bills: FinanceBill[];
  recurring: FinanceRecurring[];
  holdings: FinanceHolding[];
  month: string;
  projectId?: string;
  readOnly?: boolean;
  /** Opens the ledger filtered to one category — a category page's "add entry". */
  preselectedCategoryId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTab] = React.useState<Tab>("overview");
  const [query, setQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState(preselectedCategoryId ?? "");
  const [view, setView] = React.useState<"list" | "ledger">("list");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TransactionRow | null>(null);
  const [deleting, setDeleting] = React.useState<TransactionRow | null>(null);
  const [budgetForm, setBudgetForm] = React.useState<FinanceBudget | null | undefined>(undefined);
  const [billForm, setBillForm] = React.useState<FinanceBill | null | undefined>(undefined);
  const [recurringForm, setRecurringForm] = React.useState<FinanceRecurring | null | undefined>(undefined);
  const [holdingForm, setHoldingForm] = React.useState<FinanceHolding | null | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  // Seeded from the server so the first client render matches the server's
  // markup — deriving "this month" locally would flip the heading mid-hydration.
  const [activeMonth, setActiveMonth] = React.useState(month);
  const today = React.useMemo(() => new Date(), []);

  // View preference survives navigation; read through a rAF rather than
  // setting state straight in the effect body.
  React.useEffect(() => {
    const saved = window.localStorage.getItem("ownspece:finance:view");
    if (saved === "list" || saved === "ledger") {
      const id = window.requestAnimationFrame(() => setView(saved));
      return () => window.cancelAnimationFrame(id);
    }
  }, []);

  React.useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    router.replace(`${pathname}?${params.toString()}`);
    const id = window.requestAnimationFrame(() => {
      setEditing(null);
      setFormOpen(true);
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchParams, pathname, router]);

  function changeView(next: string) {
    setView(next as "list" | "ledger");
    window.localStorage.setItem("ownspece:finance:view", next);
  }

  const summary = React.useMemo(() => summarizeMonth(transactions), [transactions]);
  const ledger = React.useMemo(() => buildLedger(transactions), [transactions]);
  const trend = React.useMemo(() => monthlyTrend(transactions, 6), [transactions]);
  const expenseSlices = React.useMemo(
    () => groupByCategory(transactions, "expense"),
    [transactions]
  );
  const incomeSlices = React.useMemo(() => groupByCategory(transactions, "income"), [transactions]);
  const budgetProgress = React.useMemo(
    () => computeBudgets(budgets, transactions, { projectId }),
    [budgets, transactions, projectId]
  );
  const portfolio = React.useMemo(() => summarisePortfolio(holdings), [holdings]);
  const holdingValues = React.useMemo(() => valueHoldings(holdings), [holdings]);

  const previousTrend = trend[trend.length - 2] ?? { income: 0, expense: 0, net: 0 };
  const expenseChange = monthOverMonth(summary.expense, previousTrend.expense);
  const incomeChange = monthOverMonth(summary.income, previousTrend.income);

  const billStatuses = React.useMemo(
    () =>
      bills
        .map((bill) => ({ bill, ...billState(bill, activeMonth, today) }))
        // Most urgent first: overdue, then by how soon it is due.
        .sort((a, b) => {
          const rank = (state: string) =>
            state === "overdue" ? 0 : state === "due_soon" ? 1 : state === "upcoming" ? 2 : 3;
          const diff = rank(a.state) - rank(b.state);
          return diff !== 0 ? diff : a.daysUntil - b.daysUntil;
        }),
    [bills, activeMonth, today]
  );

  const filteredTransactions = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transactions.filter((transaction) => {
      if (typeFilter && transaction.type !== typeFilter) return false;
      if (categoryFilter && transaction.category?.id !== categoryFilter) return false;
      if (!needle) return true;
      const haystack = [
        transaction.description ?? "",
        transaction.reference ?? "",
        transaction.category?.name ?? "",
        transaction.project?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [transactions, query, typeFilter, categoryFilter]);

  // Derived, not pruned: anything off screen is simply absent from the set.
  const effectiveSelected = React.useMemo(() => {
    if (selected.size === 0) return selected;
    const visible = new Set(filteredTransactions.map((t) => t.id));
    const next = new Set([...selected].filter((id) => visible.has(id)));
    return next.size === selected.size ? selected : next;
  }, [selected, filteredTransactions]);

  const relevantCategories = categories.filter((category) =>
    typeFilter ? category.type === typeFilter : true
  );

  function runBulk() {
    const ids = [...effectiveSelected];
    if (ids.length === 0) return;
    startTransition(async () => {
      const result = await bulkDeleteTransactionsAction(ids);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Deleted ${result.affected ?? 0} transactions.`);
      setSelected(new Set());
      router.refresh();
    });
  }

  function generateRecurring() {
    startTransition(async () => {
      const result = await generateRecurringTransactionsAction();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      const parts: string[] = [];
      if (result.generated) parts.push(`${result.generated} transaction${result.generated === 1 ? "" : "s"}`);
      if (result.reminders) parts.push(`${result.reminders} reminder${result.reminders === 1 ? "" : "s"}`);
      toast.success(parts.length > 0 ? `Added ${parts.join(" and ")}.` : "Nothing was due yet.");
      router.refresh();
    });
  }

  const statItems: StatStripItem[] = [
    {
      id: "balance",
      label: "Balance this month",
      value: Math.round(summary.net),
      icon: Wallet,
      tone: summary.net >= 0 ? "success" : "danger",
      hint: `${formatCurrency(summary.net, CURRENCY, { compact: true })} saved`,
    },
    {
      id: "income",
      label: "Income",
      value: Math.round(summary.income),
      icon: ArrowUpRight,
      tone: "success",
      hint:
        previousTrend.income > 0
          ? `${expenseChange.direction === "flat" ? "" : ""}${incomeChange.percent !== null ? formatPercent(Math.abs(incomeChange.percent), 100, 1) : "new"} vs last month`
          : "No income this month",
    },
    {
      id: "expense",
      label: "Expenses",
      value: Math.round(summary.expense),
      icon: ArrowDownRight,
      tone: "warning",
      hint:
        previousTrend.expense > 0 && expenseChange.percent !== null
          ? `${expenseChange.percent > 0 ? "up" : "down"} ${Math.abs(expenseChange.percent).toFixed(1)}% vs last month`
          : "First month of data",
    },
    {
      id: "savings",
      label: "Savings rate",
      value: Math.round(summary.savingsRate ?? 0),
      icon: PiggyBank,
      tone: (summary.savingsRate ?? 0) >= 20 ? "success" : "warning",
      // Null means there was no income to save from — not a 0% rate.
      hint:
        summary.savingsRate === null
          ? "No income to save from"
          : `${formatCurrency(summary.net, CURRENCY, { compact: true })} kept`,
    },
    {
      id: "bills",
      label: "Bills due",
      value: billStatuses.filter((entry) => entry.state === "overdue" || entry.state === "due_soon").length,
      icon: Receipt,
      tone: billStatuses.some((entry) => entry.state === "overdue") ? "danger" : "info",
      hint: `${formatCurrency(
        billStatuses
          .filter((entry) => entry.state === "overdue" || entry.state === "due_soon")
          .reduce((sum, entry) => sum + Number(entry.bill.amount), 0),
        CURRENCY,
        { compact: true }
      )} to settle`,
    },
  ];

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "overview", label: "Overview", icon: <Sparkles className="size-4" /> },
    { id: "ledger", label: "Ledger", icon: <LineChart className="size-4" /> },
    { id: "budgets", label: "Budgets", icon: <Target className="size-4" /> },
    { id: "bills", label: "Bills", icon: <Receipt className="size-4" /> },
    { id: "recurring", label: "Recurring", icon: <Repeat className="size-4" /> },
    { id: "investments", label: "Investments", icon: <TrendingUp className="size-4" /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <StatStrip items={statItems} />

      {/* Month navigation — the page is organised around one month at a time. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() => setActiveMonth(shiftMonth(activeMonth, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            disabled={activeMonth >= monthKey(today)}
            onClick={() => setActiveMonth(shiftMonth(activeMonth, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-1 text-lg font-semibold tracking-tight">
            {monthLabel(activeMonth)}
          </h2>
          {activeMonth !== monthKey(today) ? (
            <Button variant="ghost" size="sm" onClick={() => setActiveMonth(monthKey(today))}>
              This month
            </Button>
          ) : null}
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={generateRecurring} disabled={pending}>
              <Repeat /> Run schedule
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Add transaction
            </Button>
          </div>
        ) : null}
      </div>

      <nav role="tablist" aria-label="Finance sections" className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl border bg-card p-1">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              type="button"
              aria-selected={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition",
                tab === entry.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>

        {/* The report view is the default on /finance; this is the way back. */}
        {!projectId ? (
          <Button variant="outline" size="sm" render={<Link href={`/finance?month=${activeMonth}`} />}>
            <LineChart /> Category reports
          </Button>
        ) : null}
      </nav>

      {tab === "overview" ? (
        <OverviewTab
          month={activeMonth}
          summary={summary}
          trend={trend}
          ledger={ledger}
          expenseSlices={expenseSlices}
          incomeSlices={incomeSlices}
          budgetProgress={budgetProgress}
          billStatuses={billStatuses}
          portfolio={portfolio}
          onGoToTab={(next) => setTab(next)}
        />
      ) : null}

      {tab === "ledger" ? (
        <>
          <WorkspaceToolbar
            filters={[
              {
                param: "type",
                label: "Type",
                value: typeFilter,
                options: [
                  { value: "", label: "Income and expense" },
                  { value: "income", label: "Income" },
                  { value: "expense", label: "Expense" },
                ],
              },
              {
                param: "category",
                label: "Category",
                value: categoryFilter,
                options: [
                  { value: "", label: "All categories" },
                  ...relevantCategories.map((category) => ({
                    value: category.id,
                    label: category.name,
                  })),
                ],
              },
            ]}
            onFilterChange={(param, value) => {
              if (param === "type") {
                setTypeFilter(value);
                // A category from the other type would silently hide everything.
                setCategoryFilter("");
              }
              if (param === "category") setCategoryFilter(value);
            }}
            search={{
              value: query,
              onChange: setQuery,
              placeholder: "Search description, reference, category…",
              label: "Search transactions",
            }}
            view={{
              value: view,
              onChange: changeView,
              options: [
                { value: "list", label: "List", icon: VIEW_ICONS.list },
                { value: "ledger", label: "Ledger", icon: VIEW_ICONS.grid },
              ],
            }}
          />

          {effectiveSelected.size > 0 && !readOnly ? (
            <div className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur">
              <span className="px-1 text-sm font-medium">{effectiveSelected.size} selected</span>
              <div className="h-4 w-px bg-border" />
              <Button variant="destructive" size="sm" disabled={pending} onClick={() => setBulkDeleting(true)}>
                <Trash2 /> Delete
              </Button>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelected(new Set())}>
                <X /> Clear
              </Button>
            </div>
          ) : null}

          {filteredTransactions.length === 0 ? (
            <EmptyState
              icon={Search}
              title={transactions.length === 0 ? "No transactions this month" : "Nothing matched"}
              description={
                transactions.length === 0
                  ? "Add income and expenses to see your balance, budget and trends."
                  : "Try clearing a filter or searching for something else."
              }
              action={
                transactions.length === 0 && !readOnly ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus /> Add transaction
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setTypeFilter("");
                      setCategoryFilter("");
                    }}
                  >
                    Clear filters
                  </Button>
                )
              }
            />
          ) : view === "ledger" ? (
            <LedgerView days={ledger} />
          ) : (
            <TransactionList
              transactions={filteredTransactions}
              selected={effectiveSelected}
              readOnly={readOnly}
              onToggleSelected={(id) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onEdit={(item) => {
                setEditing(item);
                setFormOpen(true);
              }}
              onDelete={(item) => setDeleting(item)}
            />
          )}
        </>
      ) : null}

      {tab === "budgets" ? (
        <BudgetsTab
          progress={budgetProgress}
          month={activeMonth}
          readOnly={readOnly}
          onSave={() => setBudgetForm(null)}
          onEdit={(budget) => setBudgetForm(budget)}
          onDelete={(budget) =>
            startTransition(async () => {
              const result = await deleteBudgetAction(budget.id);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Budget removed.");
                router.refresh();
              }
            })
          }
        />
      ) : null}

      {tab === "bills" ? (
        <BillsTab
          statuses={billStatuses}
          readOnly={readOnly}
          pending={pending}
          onPay={(bill) =>
            startTransition(async () => {
              const result = await payBillAction(bill.id);
              if (result.error) toast.error(result.error);
              else {
                toast.success(`${bill.name} marked paid and recorded.`);
                router.refresh();
              }
            })
          }
          onSkip={(bill) =>
            startTransition(async () => {
              const result = await skipBillAction(bill.id, activeMonth);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Bill skipped for this month.");
                router.refresh();
              }
            })
          }
          onEdit={(bill) => setBillForm(bill)}
          onDelete={(bill) =>
            startTransition(async () => {
              const result = await deleteBillAction(bill.id);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Bill removed.");
                router.refresh();
              }
            })
          }
        />
      ) : null}

      {tab === "recurring" ? (
        <RecurringTab
          rules={recurring}
          readOnly={readOnly}
          pending={pending}
          onGenerate={generateRecurring}
          onEdit={(rule) => setRecurringForm(rule)}
          onDelete={(rule) =>
            startTransition(async () => {
              const result = await deleteRecurringAction(rule.id);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Schedule removed.");
                router.refresh();
              }
            })
          }
        />
      ) : null}

      {tab === "investments" ? (
        <InvestmentsTab
          holdings={holdingValues}
          portfolio={portfolio}
          readOnly={readOnly}
          onEdit={(holding) => setHoldingForm(holding)}
          onPrice={(holding, price) =>
            startTransition(async () => {
              const result = await updateHoldingPriceAction(holding.id, price);
              if (result.error) toast.error(result.error);
              else {
                toast.success(`${holding.symbol} price updated.`);
                router.refresh();
              }
            })
          }
          onDelete={(holding) =>
            startTransition(async () => {
              const result = await deleteHoldingAction(holding.id);
              if (result.error) toast.error(result.error);
              else {
                toast.success("Holding removed.");
                router.refresh();
              }
            })
          }
        />
      ) : null}

      {/* Dialogs */}
      <TransactionFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        transaction={editing}
        categories={categories}
        projects={projects}
        defaultDate={`${activeMonth}-01`}
      />

      <BudgetFormDialog
        open={budgetForm !== undefined}
        onOpenChange={(open) => {
          if (!open) setBudgetForm(undefined);
        }}
        budget={budgetForm ?? null}
        categories={categories}
        month={activeMonth}
      />

      <BillFormDialog
        open={billForm !== undefined}
        onOpenChange={(open) => {
          if (!open) setBillForm(undefined);
        }}
        bill={billForm ?? null}
        categories={categories}
      />

      <RecurringFormDialog
        open={recurringForm !== undefined}
        onOpenChange={(open) => {
          if (!open) setRecurringForm(undefined);
        }}
        rule={recurringForm ?? null}
        categories={categories}
        projects={projects}
      />

      <HoldingFormDialog
        open={holdingForm !== undefined}
        onOpenChange={(open) => {
          if (!open) setHoldingForm(undefined);
        }}
        holding={holdingForm ?? null}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.description ?? "this transaction"}"?`}
        description="This permanently removes the entry from your ledger."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          setDeleting(null);
          const result = await bulkDeleteTransactionsAction([deleting.id]);
          if (result.error) toast.error(result.error);
          else {
            toast.success("Transaction deleted.");
            router.refresh();
          }
        }}
      />

      <ConfirmDialog
        open={bulkDeleting}
        onOpenChange={setBulkDeleting}
        title={`Delete ${effectiveSelected.size} transaction${effectiveSelected.size === 1 ? "" : "s"}?`}
        description="This permanently removes them from your ledger."
        confirmLabel="Delete"
        onConfirm={async () => {
          setBulkDeleting(false);
          runBulk();
        }}
      />
    </div>
  );
}
// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  month,
  summary,
  trend,
  ledger,
  expenseSlices,
  incomeSlices,
  budgetProgress,
  billStatuses,
  portfolio,
  onGoToTab,
}: {
  month: string;
  summary: ReturnType<typeof summarizeMonth>;
  trend: ReturnType<typeof monthlyTrend>;
  ledger: ReturnType<typeof buildLedger>;
  expenseSlices: ReturnType<typeof groupByCategory>;
  incomeSlices: ReturnType<typeof groupByCategory>;
  budgetProgress: ReturnType<typeof computeBudgets>;
  billStatuses: Array<{ bill: FinanceBill; state: string; dueOn: string; daysUntil: number }>;
  portfolio: ReturnType<typeof summarisePortfolio>;
  onGoToTab: (tab: Tab) => void;
}) {
  const maxTrend = Math.max(
    1,
    ...trend.map((point) => Math.max(point.income, point.expense))
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LineChart className="size-4 text-muted-foreground" />
              Income vs expenses
            </CardTitle>
            <CardDescription>Last six months</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-44 items-end gap-2">
              {trend.map((point) => (
                <div key={point.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-full w-full items-end justify-center gap-1">
                    <div
                      title={`Income ${formatCurrency(point.income, CURRENCY)}`}
                      className="w-2.5 rounded-t bg-success/70 transition-all hover:bg-success"
                      style={{ height: `${(point.income / maxTrend) * 100}%` }}
                    />
                    <div
                      title={`Expenses ${formatCurrency(point.expense, CURRENCY)}`}
                      className="w-2.5 rounded-t bg-destructive/70 transition-all hover:bg-destructive"
                      style={{ height: `${(point.expense / maxTrend) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {point.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-success/70" /> Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-destructive/70" /> Expenses
              </span>
              <span className="ml-auto">
                Net this month{" "}
                <span className={summary.net >= 0 ? "text-success" : "text-destructive"}>
                  {formatSignedCurrency(summary.net, CURRENCY)}
                </span>
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <PiggyBank className="size-4 text-muted-foreground" />
              Savings
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div>
              <p className="dash-kpi-value">
                {summary.savingsRate === null ? "—" : formatPercent(summary.savingsRate, 100, 1)}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary.savingsRate === null
                  ? "No income recorded this month"
                  : `${formatCurrency(summary.net, CURRENCY)} kept of ${formatCurrency(summary.income, CURRENCY)}`}
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  (summary.savingsRate ?? 0) >= 20
                    ? "bg-success"
                    : (summary.savingsRate ?? 0) >= 0
                      ? "bg-warning"
                      : "bg-destructive"
                )}
                  style={{
                    width: `${Math.min(100, Math.max(0, summary.savingsRate ?? 0))}%`,
                  }}
              />
            </div>

            <dl className="flex flex-col gap-1 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Income</dt>
                <dd className="tabular-nums text-success">{formatCurrency(summary.income, CURRENCY)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Expenses</dt>
                <dd className="tabular-nums text-destructive">{formatCurrency(summary.expense, CURRENCY)}</dd>
              </div>
              <div className="flex justify-between border-t pt-1 font-medium">
                <dt>Transactions</dt>
                <dd className="tabular-nums">{summary.transactionCount}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="size-4 text-muted-foreground" />
              Where it went
            </CardTitle>
            <CardDescription>Expenses by category</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseSlices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No spending recorded for {monthLabel(month)}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {expenseSlices.slice(0, 6).map((slice) => (
                  <div key={slice.id ?? "none"} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: slice.color ?? "var(--muted-foreground)" }}
                      />
                      <span className="flex-1 truncate">{slice.name}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {slice.share.toFixed(0)}%
                      </span>
                      <span className="tabular-nums font-medium">
                        {formatCurrency(slice.value, CURRENCY, { compact: true })}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${slice.share}%`,
                          backgroundColor: slice.color ?? "var(--primary)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ArrowUpRight className="size-4 text-muted-foreground" />
              What came in
            </CardTitle>
            <CardDescription>Income by category</CardDescription>
          </CardHeader>
          <CardContent>
            {incomeSlices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No income recorded for {monthLabel(month)}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {incomeSlices.map((slice) => (
                  <div key={slice.id ?? "none"} className="flex items-center gap-2 text-sm">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: slice.color ?? "var(--success)" }}
                    />
                    <span className="flex-1 truncate">{slice.name}</span>
                    <span className="tabular-nums font-medium text-success">
                      {formatCurrency(slice.value, CURRENCY)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Target className="size-4 text-muted-foreground" />
              Budget
            </CardTitle>
            <button
              type="button"
              onClick={() => onGoToTab("budgets")}
              className="text-xs text-muted-foreground hover:underline"
            >
              Manage
            </button>
          </CardHeader>
          <CardContent>
            {budgetProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">No budget set for this month.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {budgetProgress.slice(0, 4).map((budget) => (
                  <div key={budget.id} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate">{budget.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCurrency(budget.spent, CURRENCY, { compact: true })} /{" "}
                        {formatCurrency(budget.amount, CURRENCY, { compact: true })}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          budget.state === "over"
                            ? "bg-destructive"
                            : budget.state === "near"
                              ? "bg-warning"
                              : "bg-success"
                        )}
                        style={{ width: `${Math.min(100, budget.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Receipt className="size-4 text-muted-foreground" />
              Bills
            </CardTitle>
            <button
              type="button"
              onClick={() => onGoToTab("bills")}
              className="text-xs text-muted-foreground hover:underline"
            >
              Manage
            </button>
          </CardHeader>
          <CardContent>
            {billStatuses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No bills tracked yet.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {billStatuses.slice(0, 4).map(({ bill, state, daysUntil }) => (
                  <div key={bill.id} className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        state === "overdue"
                          ? "bg-destructive"
                          : state === "due_soon"
                            ? "bg-warning"
                            : state === "paid"
                              ? "bg-success"
                              : "bg-muted-foreground/40"
                      )}
                    />
                    <span className="flex-1 truncate">{bill.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {state === "paid"
                        ? "Paid"
                        : daysUntil < 0
                          ? `${Math.abs(daysUntil)}d late`
                          : `${daysUntil}d`}
                    </span>
                    <span className="tabular-nums">{formatCurrency(bill.amount, CURRENCY, { compact: true })}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Landmark className="size-4 text-muted-foreground" />
              Investments
            </CardTitle>
            <button
              type="button"
              onClick={() => onGoToTab("investments")}
              className="text-xs text-muted-foreground hover:underline"
            >
              Manage
            </button>
          </CardHeader>
          <CardContent>
            <p className="dash-kpi-value">
              {portfolio.currentValue === null
                ? formatCurrency(portfolio.invested, CURRENCY, { compact: true })
                : formatCurrency(portfolio.currentValue, CURRENCY, { compact: true })}
            </p>
            <p className="text-xs text-muted-foreground">
              {portfolio.pnl === null
                ? "Enter current prices to see profit"
                : `${portfolio.pnl >= 0 ? "+" : ""}${formatCurrency(portfolio.pnl, CURRENCY, { compact: true })} (${portfolio.pnlPercent !== null ? portfolio.pnlPercent.toFixed(1) : "0"}%)`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarClock className="size-4 text-muted-foreground" />
            Day by day
          </CardTitle>
          <CardDescription>Running balance for {monthLabel(month)}</CardDescription>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing recorded this month.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {ledger.map((day) => (
                <div
                  key={day.date}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-accent/40"
                >
                  <span className="w-24 shrink-0 text-xs text-muted-foreground">{day.label}</span>
                  <span className="w-20 shrink-0 text-xs tabular-nums text-success">
                    {day.income > 0 ? `+${formatCurrency(day.income, CURRENCY, { compact: true })}` : "—"}
                  </span>
                  <span className="w-20 shrink-0 text-xs tabular-nums text-destructive">
                    {day.expense > 0 ? `-${formatCurrency(day.expense, CURRENCY, { compact: true })}` : ""}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-sm font-medium tabular-nums",
                      day.balance >= 0 ? "text-foreground" : "text-destructive"
                    )}
                  >
                    {formatCurrency(day.balance, CURRENCY)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ledger + transaction list
// ---------------------------------------------------------------------------

function LedgerView({ days }: { days: ReturnType<typeof buildLedger> }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-col gap-1">
          {days.map((day) => (
            <div key={day.date} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-accent/40">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">{day.label}</span>
              <span className="text-xs text-muted-foreground">{day.count} entries</span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                in {formatCurrency(day.income, CURRENCY, { compact: true })} out{" "}
                {formatCurrency(day.expense, CURRENCY, { compact: true })}
              </span>
              <span
                className={cn(
                  "w-28 shrink-0 text-right text-sm font-medium tabular-nums",
                  day.balance >= 0 ? "text-foreground" : "text-destructive"
                )}
              >
                {formatCurrency(day.balance, CURRENCY)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TransactionList({
  transactions,
  selected,
  readOnly,
  onToggleSelected,
  onEdit,
  onDelete,
}: {
  transactions: TransactionRow[];
  selected: Set<string>;
  readOnly: boolean;
  onToggleSelected: (id: string) => void;
  onEdit: (item: TransactionRow) => void;
  onDelete: (item: TransactionRow) => void;
}) {
  // Grouped by day so the list reads like a statement rather than a flat feed.
  const groups = React.useMemo(() => {
    const byDay = new Map<string, TransactionRow[]>();
    for (const transaction of transactions) {
      const bucket = byDay.get(transaction.transaction_date) ?? [];
      bucket.push(transaction);
      byDay.set(transaction.transaction_date, bucket);
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [transactions]);

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([date, items]) => {
        const dayTotal = items.reduce((sum, item) => sum + (item.type === "income" ? item.amount : -item.amount), 0);
        return (
          <section key={date} className="flex flex-col gap-2">
            <header className="flex items-center gap-2 px-1">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </h3>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {items.length} item{items.length === 1 ? "" : "s"}
              </span>
              <span
                className={cn(
                  "ml-auto text-xs font-medium tabular-nums",
                  dayTotal >= 0 ? "text-success" : "text-destructive"
                )}
              >
                {formatSignedCurrency(dayTotal, CURRENCY)}
              </span>
            </header>

            <ul className="flex flex-col overflow-hidden rounded-xl border bg-card">
              {items.map((transaction) => (
                <li
                  key={transaction.id}
                  className="group flex items-center gap-3 border-b border-border/50 p-3 transition last:border-0 hover:bg-accent/30"
                >
                  {!readOnly ? (
                    <Checkbox
                      checked={selected.has(transaction.id)}
                      onCheckedChange={() => onToggleSelected(transaction.id)}
                      aria-label={`Select ${transaction.description ?? "transaction"}`}
                      className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[checked]:opacity-100"
                    />
                  ) : null}

                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: transaction.category?.color
                        ? `color-mix(in oklab, ${transaction.category.color} 16%, transparent)`
                        : "var(--muted)",
                      color: transaction.category?.color ?? "var(--muted-foreground)",
                    }}
                  >
                    {transaction.type === "income" ? (
                      <TrendingUp className="size-4" />
                    ) : (
                      <TrendingDown className="size-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {transaction.description || transaction.category?.name || "Transaction"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[
                        transaction.category?.name,
                        transaction.project?.name,
                        transaction.payment_method ? paymentMethodLabels[transaction.payment_method] : null,
                        transaction.reference,
                        transaction.source && transaction.source !== "manual"
                          ? transaction.source === "recurring"
                            ? "auto"
                            : "bill"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      transaction.type === "income" ? "text-success" : "text-foreground"
                    )}
                  >
                    {formatSignedCurrency(
                      transaction.type === "income" ? transaction.amount : -transaction.amount,
                      CURRENCY
                    )}
                  </span>

                  {!readOnly ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Edit ${transaction.description ?? "transaction"}`}
                        onClick={() => onEdit(transaction)}
                      >
                        <PencilIcon />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${transaction.description ?? "transaction"}`}
                        onClick={() => onDelete(transaction)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

function BudgetsTab({
  progress,
  month,
  readOnly,
  onSave,
  onEdit,
  onDelete,
}: {
  progress: ReturnType<typeof computeBudgets>;
  month: string;
  readOnly: boolean;
  onSave: () => void;
  onEdit: (budget: FinanceBudget) => void;
  onDelete: (budget: BudgetProgress) => void;
}) {
  const [deleting, setDeleting] = React.useState<BudgetProgress | null>(null);

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Budgets for {monthLabel(month)}</h3>
        {!readOnly ? (
          <Button size="sm" onClick={onSave}>
            <Plus /> Set a budget
          </Button>
        ) : null}
      </div>

      {progress.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No budget for this month"
          description="Set a cap and the page will track how much of it you have spent."
          action={
            readOnly ? undefined : (
              <Button onClick={onSave}>
                <Plus /> Set a budget
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {progress.map((budget) => (
            <Card key={budget.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target
                    className={cn(
                      "size-4",
                      budget.state === "over"
                        ? "text-destructive"
                        : budget.state === "near"
                          ? "text-warning"
                          : "text-success"
                    )}
                  />
                  {budget.label}
                </CardTitle>
                <Badge
                  variant="secondary"
                  className={cn(
                    "rounded-full px-2 py-0 text-[10px] capitalize",
                    budget.state === "over" && "bg-destructive/12 text-destructive",
                    budget.state === "near" && "bg-warning/12 text-warning"
                  )}
                >
                  {budget.state === "over" ? "Over budget" : budget.state === "near" ? "Getting close" : "On track"}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div>
                  <p className="dash-kpi-value">
                    {formatCurrency(budget.spent, CURRENCY, { compact: true })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    of {formatCurrency(budget.amount, CURRENCY, { compact: true })} ·{" "}
                    {budget.percent.toFixed(0)}%
                  </p>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      budget.state === "over"
                        ? "bg-destructive"
                        : budget.state === "near"
                          ? "bg-warning"
                          : "bg-success"
                    )}
                    style={{ width: `${Math.min(100, budget.percent)}%` }}
                  />
                </div>

                <p className="text-xs text-muted-foreground">
                  {budget.remaining >= 0
                    ? `${formatCurrency(budget.remaining, CURRENCY)} left`
                    : `${formatCurrency(Math.abs(budget.remaining), CURRENCY)} over`}
                </p>

                {!readOnly ? (
                  <div className="mt-1 flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onEdit({
                          id: budget.id,
                          user_id: "",
                          category_id: null,
                          project_id: null,
                          month: budget.month,
                          amount: budget.amount,
                          currency: CURRENCY,
                          created_at: "",
                          updated_at: "",
                        })
                      }
                    >
                      Edit
                    </Button>
<Button variant="ghost" size="sm" onClick={() => setDeleting(budget)}>
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Remove this budget?"
        description="Transactions already recorded are not affected."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!deleting) return;
          onDelete(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

const BILL_STATE: Record<
  string,
  { label: string; className: string; icon: React.ReactNode }
> = {
  overdue: {
    label: "Overdue",
    className: "bg-destructive/12 text-destructive",
    icon: <CircleAlert className="size-3" />,
  },
  due_soon: {
    label: "Due soon",
    className: "bg-warning/12 text-warning",
    icon: <CalendarClock className="size-3" />,
  },
  upcoming: { label: "Upcoming", className: "bg-muted text-muted-foreground", icon: null },
  paid: {
    label: "Paid",
    className: "bg-success/12 text-success",
    icon: <CheckCircle2 className="size-3" />,
  },
  inactive: { label: "Paused", className: "bg-muted text-muted-foreground", icon: null },
};

function BillsTab({
  statuses,
  readOnly,
  pending,
  onPay,
  onSkip,
  onEdit,
  onDelete,
}: {
  statuses: Array<{ bill: FinanceBill; state: string; dueOn: string; daysUntil: number }>;
  readOnly: boolean;
  pending: boolean;
  onPay: (bill: FinanceBill) => void;
  onSkip: (bill: FinanceBill) => void;
  onEdit: (bill: FinanceBill) => void;
  onDelete: (bill: FinanceBill) => void;
}) {
  const [deleting, setDeleting] = React.useState<FinanceBill | null>(null);
  const outstanding = statuses
    .filter((entry) => entry.state === "overdue" || entry.state === "due_soon")
    .reduce((sum, entry) => sum + Number(entry.bill.amount), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Bills</h3>
        {!readOnly ? (
          <Button size="sm" onClick={() => onEdit(undefined as never)}>
            <Plus /> Add bill
          </Button>
        ) : null}
      </div>

      {statuses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No bills tracked"
          description="Add rent, EMIs or subscriptions and they will show up here with their due dates."
          action={
            readOnly ? undefined : (
              <Button onClick={() => onEdit(undefined as never)}>
                <Plus /> Add bill
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardDescription>
              {outstanding > 0
                ? `${formatCurrency(outstanding, CURRENCY)} due or about to fall due`
                : "Everything is settled"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5">
              {statuses.map(({ bill, state, dueOn, daysUntil }) => {
                const meta = BILL_STATE[state] ?? BILL_STATE.upcoming;
                return (
                  <li
                    key={bill.id}
                    className={cn(
                      "group flex flex-wrap items-center gap-3 rounded-lg border p-3 transition",
                      state === "overdue" ? "border-destructive/40 bg-destructive/5" : "hover:bg-accent/30"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {bill.name}
                        <Badge
                          variant="secondary"
                          className={cn("rounded-full px-2 py-0 text-[10px]", meta.className)}
                        >
                          {meta.icon}
                          {meta.label}
                        </Badge>
                        {bill.remind_days_before !== null ? (
                          <span
                            className="flex items-center gap-0.5 text-[10px] text-muted-foreground"
                            title={`A reminder is raised ${bill.remind_days_before} days before`}
                          >
                            <Bell className="size-3" />
                            {bill.remind_days_before}d before
                          </span>
                        ) : null}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Due{" "}
                        {new Date(`${dueOn}T00:00:00`).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        })}
                        {state === "overdue"
                          ? ` ${Math.abs(daysUntil)} days late`
                          : daysUntil >= 0
                            ? `  in  ${daysUntil} days`
                            : ""}
                      </p>
                    </div>

                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatCurrency(bill.amount, CURRENCY)}
                    </span>

                    {!readOnly ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {(state === "overdue" || state === "due_soon" || state === "upcoming") && (
                          <Button size="sm" disabled={pending} onClick={() => onPay(bill)}>
                            <CheckCircle2 /> Mark paid
                          </Button>
                        )}
                        {state === "upcoming" ? (
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => onSkip(bill)}>
                            Skip
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${bill.name}`} onClick={() => onEdit(bill)}>
                          <PencilIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${bill.name}`} onClick={() => setDeleting(bill)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="Payments already recorded against it stay in your ledger."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          onDelete(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Recurring
// ---------------------------------------------------------------------------

function RecurringTab({
  rules,
  readOnly,
  pending,
  onGenerate,
  onEdit,
  onDelete,
}: {
  rules: FinanceRecurring[];
  readOnly: boolean;
  pending: boolean;
  onGenerate: () => void;
  onEdit: (rule: FinanceRecurring) => void;
  onDelete: (rule: FinanceRecurring) => void;
}) {
  const [deleting, setDeleting] = React.useState<FinanceRecurring | null>(null);
  const monthlyTotal = rules
    .filter((rule) => rule.repeat_rule === "monthly" && Number(rule.repeat_interval ?? 1) === 1)
    .reduce((sum, rule) => sum + (rule.type === "income" ? Number(rule.amount) : -Number(rule.amount)), 0);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Recurring transactions</h3>
        {!readOnly ? (
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" disabled={pending} onClick={onGenerate}>
              <Repeat /> Run schedule
            </Button>
            <Button size="sm" onClick={() => onEdit(undefined as never)}>
              <Plus /> Add schedule
            </Button>
          </div>
        ) : null}
      </div>

      {rules.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Nothing repeats yet"
          description="Set up salary, rent or an EMI once and it posts itself every period."
          action={
            readOnly ? undefined : (
              <Button onClick={() => onEdit(undefined as never)}>
                <Plus /> Add schedule
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="flex flex-col gap-1.5">
              {rules.map((rule) => (
                <li
                  key={rule.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3 transition hover:bg-accent/30"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      rule.type === "income" ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive"
                    )}
                  >
                    {rule.type === "income" ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{rule.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {rule.repeat_rule}
                      {(rule.repeat_interval ?? 1) > 1 ? ` every ${rule.repeat_interval}` : ""} next{" "}
                      {new Date(`${rule.next_due_on}T00:00:00`).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      })}
                      {rule.remind_days_before !== null ? ` reminds ${rule.remind_days_before}d before` : ""}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      rule.type === "income" ? "text-success" : "text-foreground"
                    )}
                  >
                    {formatSignedCurrency(rule.type === "income" ? Number(rule.amount) : -Number(rule.amount), CURRENCY)}
                  </span>

                  {!readOnly ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${rule.name}`} onClick={() => onEdit(rule)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${rule.name}`} onClick={() => setDeleting(rule)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>

            {monthlyTotal !== 0 ? (
              <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                Net monthly effect:{" "}
                <span className={monthlyTotal >= 0 ? "text-success" : "text-destructive"}>
                  {formatSignedCurrency(monthlyTotal, CURRENCY)}
                </span>
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="Transactions already generated from it stay in your ledger."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          onDelete(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Investments
// ---------------------------------------------------------------------------

function InvestmentsTab({
  holdings,
  portfolio,
  readOnly,
  onEdit,
  onPrice,
  onDelete,
}: {
  holdings: Array<FinanceHolding & { invested: number; currentValue: number | null; pnl: number | null; pnlPercent: number | null }>;
  portfolio: ReturnType<typeof summarisePortfolio>;
  readOnly: boolean;
  onEdit: (holding: FinanceHolding) => void;
  onPrice: (holding: FinanceHolding, price: number) => void;
  onDelete: (holding: FinanceHolding) => void;
}) {
  const [deleting, setDeleting] = React.useState<FinanceHolding | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Holdings</h3>
        {!readOnly ? (
          <Button size="sm" onClick={() => onEdit(undefined as never)}>
            <Plus /> Add holding
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">
        Prices are entered by you there is no live market feed, so nothing here updates on its own.
      </p>

      {holdings.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No holdings tracked"
          description="Add what you hold to see cost basis, current value and unrealised profit."
          action={
            readOnly ? undefined : (
              <Button onClick={() => onEdit(undefined as never)}>
                <Plus /> Add holding
              </Button>
            )
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <div className="mb-3 grid gap-3 sm:grid-cols-4">
              <Stat label="Invested" value={formatCurrency(portfolio.invested, CURRENCY, { compact: true })} />
              <Stat
                label="Current value"
                value={
                  portfolio.currentValue === null
                    ? "—"
                    : formatCurrency(portfolio.currentValue, CURRENCY, { compact: true })
                }
              />
              <Stat
                label="Profit / loss"
                value={portfolio.pnl === null ? "—" : formatSignedCurrency(portfolio.pnl, CURRENCY, { compact: true })}
                tone={portfolio.pnl === null ? "neutral" : portfolio.pnl >= 0 ? "success" : "danger"}
              />
              <Stat
                label="Return"
                value={portfolio.pnlPercent === null ? "—" : `${portfolio.pnlPercent.toFixed(1)}%`}
                tone={portfolio.pnl === null ? "neutral" : portfolio.pnl >= 0 ? "success" : "danger"}
              />
            </div>

            <ul className="flex flex-col gap-1.5">
              {holdings.map((holding) => (
                <li
                  key={holding.id}
                  className="group flex flex-wrap items-center gap-3 rounded-lg border p-3 transition hover:bg-accent/30"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-xs font-semibold text-primary">
                    {holding.symbol.slice(0, 3)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {holding.name || holding.symbol}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatNumber(holding.quantity)} {formatCurrency(holding.buy_price, CURRENCY)} ={" "}
                      {formatCurrency(holding.invested, CURRENCY)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-medium tabular-nums">
                      {holding.currentValue === null
                        ? "—"
                        : formatCurrency(holding.currentValue, CURRENCY)}
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
                      {holding.pnl === null
                        ? "No price set"
                        : `${formatSignedCurrency(holding.pnl, CURRENCY)} (${holding.pnlPercent?.toFixed(1)}%)`}
                    </p>
                  </div>

                  {!readOnly ? (
                    <PriceEditor holding={holding} onPrice={onPrice} />
                  ) : null}

                  {!readOnly ? (
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${holding.symbol}`} onClick={() => onEdit(holding)}>
                        <PencilIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${holding.symbol}`} onClick={() => setDeleting(holding)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Delete ${deleting?.symbol ?? "this holding"}?`}
        description="This removes the holding from your portfolio."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          onDelete(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}

/** Inline price entry, so updating a quote does not need a dialog. */
function PriceEditor({
  holding,
  onPrice,
}: {
  holding: FinanceHolding;
  onPrice: (holding: FinanceHolding, price: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(String(holding.current_price ?? ""));

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {holding.current_price === null ? "Set price" : "Update"}
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          toast.error("Enter a price of zero or more.");
          return;
        }
        onPrice(holding, parsed);
        setOpen(false);
      }}
    >
      <Input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="h-7 w-24"
        autoFocus
        aria-label={`Current price for ${holding.symbol}`}
      />
      <Button type="submit" size="sm">
        Save
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setOpen(false)}>
        <X />
      </Button>
    </form>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "danger";
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "success" && "text-success",
          tone === "danger" && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30";

function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  categories,
  projects,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionRow | null;
  categories: FinanceCategory[];
  projects: Project[];
  defaultDate: string;
}) {
  const router = useRouter();
  const action = transaction
    ? updateFinanceTransactionAction.bind(null, transaction.id)
    : createFinanceTransactionAction;
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(action, {
    error: undefined,
  });

  const [type, setType] = React.useState<"income" | "expense">(transaction?.type ?? "expense");
  const [categoryId, setCategoryId] = React.useState(transaction?.category?.id ?? "");

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  // Categories are typed by income/expense, so switching type must drop a
  // category that belongs to the other side otherwise the form submits an
  // impossible pairing the server cannot check on its own.
  const typed = categories.filter((category) => category.type === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
          <DialogDescription>Amounts are recorded in Indian Rupees.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />

          <div className="flex gap-1.5">
            {(["expense", "income"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  setCategoryId("");
                }}
                aria-pressed={type === value}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  type === value
                    ? value === "income"
                      ? "border-success/40 bg-success/10 text-success"
                      : "border-destructive/40 bg-destructive/10 text-destructive"
                    : "hover:bg-accent/50"
                )}
              >
                {value === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount" htmlFor="tx-amount" error={state.error}>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                  &#8377;
                </span>
                <Input
                  id="tx-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-7"
                  defaultValue={transaction?.amount ?? ""}
                  placeholder="—0.00"
                  required
                  autoFocus
                />
              </div>
            </FormField>

            <FormField label="Date">
              <Input
                type="date"
                name="transaction_date"
                defaultValue={transaction?.transaction_date ?? defaultDate}
                required
              />
            </FormField>
          </div>

          <FormField label="Description">
            <Input
              name="description"
              defaultValue={transaction?.description ?? ""}
              placeholder="e.g. Monthly rent"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category" hint={`Showing ${type} categories`}>
              <select
                name="category_id"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className={selectClass}
              >
                <option value="">Uncategorised</option>
                {typed.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Project">
              <select
                name="project_id"
                defaultValue={transaction?.project?.id ?? ""}
                className={selectClass}
              >
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Payment method">
              <select
                name="payment_method"
                defaultValue={transaction?.payment_method ?? ""}
                className={selectClass}
              >
                <option value="">Not set</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Reference" hint="Invoice or receipt number">
              <Input
                name="reference"
                defaultValue={transaction?.reference ?? ""}
                placeholder="INV-001"
              />
            </FormField>
          </div>

          <FormField label="Tags" hint="Comma separated">
            <Input
              name="tags"
              defaultValue={transaction?.tags?.join(", ") ?? ""}
              placeholder="recurring, essentials"
            />
          </FormField>

          <FormField label="Notes">
            <Textarea name="notes" defaultValue={transaction?.notes ?? ""} rows={2} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : transaction ? "Save changes" : "Add transaction"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BudgetFormDialog({
  open,
  onOpenChange,
  budget,
  categories,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: FinanceBudget | null;
  categories: FinanceCategory[];
  month: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    saveBudgetAction.bind(null, budget?.id ?? null),
    { error: undefined }
  );

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{budget ? "Edit budget" : `Budget for ${monthLabel(month)}`}</DialogTitle>
          <DialogDescription>
            Leave the category empty to cap everything together.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="month" value={budget?.month ?? month} />
          <input type="hidden" name="currency" value={CURRENCY} />

          <FormField label="Amount" htmlFor="budget-amount" error={state.error}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                &#8377;
              </span>
              <Input
                id="budget-amount"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                className="pl-7"
                defaultValue={budget?.amount ?? ""}
                placeholder="20000"
                required
                autoFocus
              />
            </div>
          </FormField>

          <FormField label="Category">
            <select name="category_id" defaultValue={budget?.category_id ?? ""} className={selectClass}>
              <option value="">Everything</option>
              {categories
                .filter((category) => category.type === "expense")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : budget ? "Save" : "Set budget"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BillFormDialog({
  open,
  onOpenChange,
  bill,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill: FinanceBill | null;
  categories: FinanceCategory[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    saveBillAction.bind(null, bill?.id ?? null),
    { error: undefined }
  );
  const [active, setActive] = React.useState(bill?.is_active ?? true);

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{bill ? "Edit bill" : "New bill"}</DialogTitle>
          <DialogDescription>
            A reminder is raised this many days before it falls due.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="is_enabled" value={active ? "on" : "off"} />

          <FormField label="Name" htmlFor="bill-name" error={state.error}>
            <Input
              id="bill-name"
              name="name"
              defaultValue={bill?.name ?? ""}
              placeholder="e.g. Rent"
              required
              autoFocus
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                  &#8377;
                </span>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-7"
                  defaultValue={bill?.amount ?? ""}
                  required
                />
              </div>
            </FormField>

            <FormField label="Due day" hint="Clamped to short months">
              <Input
                name="due_day"
                type="number"
                min="1"
                max="31"
                defaultValue={bill?.due_day ?? 1}
                required
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category">
              <select name="category_id" defaultValue={bill?.category_id ?? ""} className={selectClass}>
                <option value="">Uncategorised</option>
                {categories
                  .filter((category) => category.type === "expense")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
            </FormField>

            <FormField label="Remind me before" hint="Days, 0 for on the day">
              <Input
                name="remind_days_before"
                type="number"
                min="0"
                max="365"
                defaultValue={bill?.remind_days_before ?? 3}
              />
            </FormField>
          </div>

          <FormField label="Payment method">
            <select name="payment_method" defaultValue={bill?.payment_method ?? ""} className={selectClass}>
              <option value="">Not set</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabels[method]}
                </option>
              ))}
            </select>
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="accent-primary"
            />
            Track this bill
          </label>

          <FormField label="Notes">
            <Textarea name="notes" defaultValue={bill?.notes ?? ""} rows={2} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : bill ? "Save" : "Add bill"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function RecurringFormDialog({
  open,
  onOpenChange,
  rule,
  categories,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: FinanceRecurring | null;
  categories: FinanceCategory[];
  projects: Project[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    saveRecurringAction.bind(null, rule?.id ?? null),
    { error: undefined }
  );

  const [type, setType] = React.useState<"income" | "expense">(rule?.type ?? "expense");
  const [repeatRule, setRepeatRule] = React.useState(rule?.repeat_rule ?? "monthly");
  const [repeatDays, setRepeatDays] = React.useState<number[]>(rule?.repeat_days ?? []);
  const [active, setActive] = React.useState(rule?.is_active ?? true);

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  const typed = categories.filter((category) => category.type === type);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit schedule" : "New recurring transaction"}</DialogTitle>
          <DialogDescription>
            It posts itself into your ledger each period, and can raise a reminder ahead of time.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="is_enabled" value={active ? "on" : "off"} />
          {repeatDays.map((day) => (
            <input key={day} type="hidden" name="repeat_days" value={day} />
          ))}

          <div className="flex gap-1.5">
            {(["expense", "income"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                aria-pressed={type === value}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                  type === value ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50"
                )}
              >
                {value === "income" ? "Income" : "Expense"}
              </button>
            ))}
          </div>

          <FormField label="Name" htmlFor="rec-name" error={state.error}>
            <Input
              id="rec-name"
              name="name"
              defaultValue={rule?.name ?? ""}
              placeholder="e.g. Salary"
              required
              autoFocus
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount">
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
                  &#8377;
                </span>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="pl-7"
                  defaultValue={rule?.amount ?? ""}
                  required
                />
              </div>
            </FormField>

            <FormField label="First due date">
              <Input
                type="date"
                name="next_due_on"
                defaultValue={rule?.next_due_on ?? ""}
                required
              />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Repeats">
              <select
                name="repeat_rule"
                value={repeatRule}
                onChange={(event) => setRepeatRule(event.target.value as never)}
                className={selectClass}
              >
                {RECURRENCE_RULES.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </FormField>

            {repeatRule !== "custom" ? (
              <FormField label="Every" hint="Number of periods">
                <Input
                  name="repeat_interval"
                  type="number"
                  min="1"
                  max="365"
                  defaultValue={rule?.repeat_interval ?? 1}
                />
              </FormField>
            ) : null}
          </div>

          {repeatRule === "custom" ? (
            <FormField label="On these days">
              <div className="flex gap-1">
                {WEEKDAYS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() =>
                      setRepeatDays((current) =>
                        current.includes(day)
                          ? current.filter((entry) => entry !== day)
                          : [...current, day]
                      )
                    }
                    aria-pressed={repeatDays.includes(day)}
                    className={cn(
                      "size-8 rounded-lg border text-xs font-medium transition",
                      repeatDays.includes(day)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Category">
              <select name="category_id" defaultValue={rule?.category_id ?? ""} className={selectClass}>
                <option value="">Uncategorised</option>
                {typed.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Project">
              <select name="project_id" defaultValue={rule?.project_id ?? ""} className={selectClass}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Payment method">
              <select name="payment_method" defaultValue={rule?.payment_method ?? ""} className={selectClass}>
                <option value="">Not set</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Remind me before" hint="Days ahead, 0 for none">
              <Input
                name="remind_days_before"
                type="number"
                min="0"
                max="365"
                defaultValue={rule?.remind_days_before ?? 0}
              />
            </FormField>
          </div>

          <FormField label="Repeat until" hint="Optional">
            <Input type="date" name="repeat_until" defaultValue={rule?.repeat_until ?? ""} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              className="accent-primary"
            />
            Keep posting automatically
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : rule ? "Save" : "Add schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HoldingFormDialog({
  open,
  onOpenChange,
  holding,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: FinanceHolding | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FinanceFormState, FormData>(
    saveHoldingAction.bind(null, holding?.id ?? null),
    { error: undefined }
  );

  React.useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holding ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            No market feed is connected you enter the current price yourself.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="currency" value={CURRENCY} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Symbol" htmlFor="h-symbol" error={state.error}>
              <Input
                id="h-symbol"
                name="symbol"
                defaultValue={holding?.symbol ?? ""}
                placeholder="RELIANCE"
                required
                autoFocus
              />
            </FormField>
            <FormField label="Name">
              <Input name="name" defaultValue={holding?.name ?? ""} placeholder="Reliance Industries" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label="Quantity">
              <Input
                name="quantity"
                type="number"
                step="0.000001"
                min="0"
                defaultValue={holding?.quantity ?? ""}
                required
              />
            </FormField>
            <FormField label="Buy price">
              <Input
                name="buy_price"
                type="number"
                step="0.01"
                min="0.01"
                defaultValue={holding?.buy_price ?? ""}
                required
              />
            </FormField>
            <FormField label="Current price">
              <Input
                name="current_price"
                type="number"
                step="0.01"
                min="0"
                defaultValue={holding?.current_price ?? ""}
                placeholder="—"
              />
            </FormField>
          </div>

          <FormField label="Acquired on">
            <Input type="date" name="acquired_on" defaultValue={holding?.acquired_on ?? ""} />
          </FormField>

          <FormField label="Notes">
            <Textarea name="notes" defaultValue={holding?.notes ?? ""} rows={2} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : holding ? "Save" : "Add holding"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
