import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/dal";
import { monthKey, monthRange } from "@/lib/finance-logic";
import type {
  FinanceAccount,
  FinanceBill,
  FinanceBudget,
  FinanceCategory,
  FinanceHolding,
  FinanceRecurring,
  FinanceTransaction,
} from "@/types";

export type TransactionRow = FinanceTransaction & {
  category: { id: string; name: string; color: string | null } | null;
  project: { id: string; name: string; color: string | null } | null;
};

export type FinanceOverview = {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  thisMonthIncome: number;
  thisMonthExpense: number;
  transactionCount: number;
};

export const getFinanceCategories = cache(async (): Promise<FinanceCategory[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_categories")
    .select("*")
    .eq("user_id", user.id)
    // Accounts first inside their book: a category picker should open on
    // "Cash in hand", not on an alphabetically earlier "Bank account".
    .order("kind", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error || !data) return [];
  return data as FinanceCategory[];
});

/**
 * Opening balances, one per category.
 *
 * Read as a plain list and joined in memory rather than as a nested select:
 * `finance_accounts` is keyed by user, not by category, so a nested select on
 * `finance_categories` would silently return nothing for a category that has no
 * row yet, which is the common case.
 */
export const getFinanceAccounts = cache(async (): Promise<FinanceAccount[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_accounts")
    .select("*")
    .eq("user_id", user.id);

  if (error || !data) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    opening_balance: Number(row.opening_balance),
  })) as FinanceAccount[];
});

/**
 * Opening balances as a lookup keyed by category id.
 *
 * The report engine wants "what did this category start with", not the raw row,
 * and callers should not have to remember that a missing row means zero.
 */
export async function getOpeningBalances(): Promise<Map<string, number>> {
  const accounts = await getFinanceAccounts();
  return new Map(accounts.map((account) => [account.category_id, account.opening_balance]));
}

/**
 * One category, or null.
 *
 * Deliberately returns null instead of calling `notFound()`: the same lookup
 * backs a link-out and a page, and a 404 helper in a shared DAL turns a missing
 * row inside a list into a whole-page error.
 */
export const getFinanceCategory = cache(
  async (categoryId: string): Promise<FinanceCategory | null> => {
    const user = await requireUser();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("finance_categories")
      .select("*")
      .eq("user_id", user.id)
      .eq("id", categoryId)
      .maybeSingle();

    if (error || !data) return null;
    return data as FinanceCategory;
  }
);

export type TransactionListOptions = {
  type?: "income" | "expense" | "all";
  categoryId?: string;
  projectId?: string;
  from?: string;
  to?: string;
  query?: string;
  limit?: number;
};

export const getTransactions = cache(
  async (options: TransactionListOptions = {}): Promise<TransactionRow[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("finance_transactions")
      .select("*, category:finance_categories(id, name, color), project:projects(id, name, color)")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false });

    if (options.type && options.type !== "all") query = query.eq("type", options.type);
    if (options.categoryId) query = query.eq("category_id", options.categoryId);
    if (options.projectId) query = query.eq("project_id", options.projectId);
    if (options.from) query = query.gte("transaction_date", options.from);
    if (options.to) query = query.lte("transaction_date", options.to);
    if (options.query) query = query.ilike("description", `%${options.query}%`);
    if (options.limit) query = query.limit(options.limit);

    const { data, error } = await query;
    if (error || !data) return [];

    return (data as unknown as TransactionRow[]).map((t) => ({
      ...t,
      amount: Number(t.amount),
    }));
  }
);

export const getFinanceOverview = cache(async (): Promise<FinanceOverview> => {
  const user = await requireUser();
  const supabase = await createClient();

  const now = new Date();
  // Local, not `toISOString()`. The ledger is organised by the user's calendar
  // month, and converting local midnight to UTC shifted the window back a day
  // east of UTC — so the 1st and the last day of the month fell outside it.
  const { from: monthStart, to: monthEnd } = monthRange(monthKey(now));

  const [allRes, monthRes, countRes] = await Promise.all([
    supabase.from("finance_transactions").select("type, amount").eq("user_id", user.id),
    supabase
      .from("finance_transactions")
      .select("type, amount")
      .eq("user_id", user.id)
      .gte("transaction_date", monthStart)
      .lte("transaction_date", monthEnd),
    supabase
      .from("finance_transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ]);

  const overview: FinanceOverview = {
    totalIncome: 0,
    totalExpense: 0,
    balance: 0,
    thisMonthIncome: 0,
    thisMonthExpense: 0,
    transactionCount: countRes.count ?? 0,
  };

  for (const t of allRes.data ?? []) {
    const amount = Number(t.amount);
    if (t.type === "income") overview.totalIncome += amount;
    else overview.totalExpense += amount;
  }
  for (const t of monthRes.data ?? []) {
    const amount = Number(t.amount);
    if (t.type === "income") overview.thisMonthIncome += amount;
    else overview.thisMonthExpense += amount;
  }

  overview.balance = overview.totalIncome - overview.totalExpense;
  return overview;
});

export type MonthlyPoint = {
  month: string; // YYYY-MM
  label: string; // "Sep 26"
  income: number;
  expense: number;
  net: number;
};

/** Income/expense per month for the last `months` months — used by charts. */
export const getMonthlyBreakdown = cache(
  async (months = 6): Promise<MonthlyPoint[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    const points: MonthlyPoint[] = [];
    const today = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      points.push({
        month: key,
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        income: 0,
        expense: 0,
        net: 0,
      });
    }

    const start = points[0].month + "-01";
    const end = `${points[points.length - 1].month}-31`;

    const { data, error } = await supabase
      .from("finance_transactions")
      .select("type, amount, transaction_date")
      .eq("user_id", user.id)
      .gte("transaction_date", start)
      .lte("transaction_date", end);

    if (error || !data) return points;

    const byMonth = new Map<string, { income: number; expense: number }>();
    for (const t of data) {
      const key = (t.transaction_date as string).slice(0, 7);
      const entry = byMonth.get(key) ?? { income: 0, expense: 0 };
      const amount = Number(t.amount);
      if (t.type === "income") entry.income += amount;
      else entry.expense += amount;
      byMonth.set(key, entry);
    }

    for (const p of points) {
      const entry = byMonth.get(p.month);
      p.income = entry?.income ?? 0;
      p.expense = entry?.expense ?? 0;
      p.net = p.income - p.expense;
    }

    return points;
  }
);

/** Spending by category for the current month — used by the pie/bar chart. */
export const getSpendingByCategory = cache(async (): Promise<Array<{ name: string; value: number; color: string | null }>> => {
  const user = await requireUser();
  const supabase = await createClient();

  const today = new Date();
  const { from, to } = monthRange(monthKey(today));

  const { data, error } = await supabase
    .from("finance_transactions")
    .select("category:finance_categories(name, color), amount")
    .eq("user_id", user.id)
    .eq("type", "expense")
    .gte("transaction_date", from)
    .lte("transaction_date", to);

  if (error || !data) return [];

  const byName = new Map<string, { value: number; color: string | null }>();
  for (const row of data as unknown as Array<{ category: { name: string; color: string | null } | null; amount: number }>) {
    const name = row.category?.name ?? "Uncategorized";
    const entry = byName.get(name) ?? { value: 0, color: row.category?.color ?? null };
    entry.value += Number(row.amount);
    byName.set(name, entry);
  }

  return [...byName.entries()].map(([name, entry]) => ({ name, value: entry.value, color: entry.color }));
});

export { paymentMethodLabels } from "@/config/finance";
// ---------------------------------------------------------------------------
// Budgets, bills, recurring, holdings migration 020
// ---------------------------------------------------------------------------

export type BudgetRow = FinanceBudget & {
  category: { id: string; name: string; color: string | null } | null;
  project: { id: string; name: string; color: string | null } | null;
};

export type RecurringRow = FinanceRecurring & {
  category: { id: string; name: string; color: string | null } | null;
  project: { id: string; name: string; color: string | null } | null;
};

export type BillRow = FinanceBill & {
  category: { id: string; name: string; color: string | null } | null;
  project: { id: string; name: string; color: string | null } | null;
};

export type HoldingRow = FinanceHolding;

/** `numeric` comes back from PostgREST as a string; everything downstream wants a number. */
function numeric<T extends { amount: number }>(rows: unknown): T[] {
  return ((rows ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    amount: Number(row.amount),
  })) as T[];
}

export const getBudgets = cache(
  async (options: { month?: string; projectId?: string } = {}): Promise<BudgetRow[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("finance_budgets")
      .select("*, category:finance_categories(id, name, color), project:projects(id, name, color)")
      .eq("user_id", user.id)
      .order("month", { ascending: false });

    if (options.month) query = query.eq("month", options.month);
    if (options.projectId) query = query.eq("project_id", options.projectId);

    const { data, error } = await query;
    if (error || !data) return [];
    return numeric<BudgetRow>(data);
  }
);

export const getBills = cache(async (): Promise<BillRow[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_bills")
    .select("*, category:finance_categories(id, name, color), project:projects(id, name, color)")
    .eq("user_id", user.id)
    .order("due_day", { ascending: true });
  if (error || !data) return [];
  return numeric<BillRow>(data);
});

export const getRecurring = cache(
  async (options: { activeOnly?: boolean; projectId?: string } = {}): Promise<RecurringRow[]> => {
    const user = await requireUser();
    const supabase = await createClient();

    let query = supabase
      .from("finance_recurring")
      .select("*, category:finance_categories(id, name, color), project:projects(id, name, color)")
      .eq("user_id", user.id)
      .order("next_due_on", { ascending: true });

    if (options.activeOnly) query = query.eq("is_active", true);
    if (options.projectId) query = query.eq("project_id", options.projectId);

    const { data, error } = await query;
    if (error || !data) return [];
    return numeric<RecurringRow>(data);
  }
);

export const getHoldings = cache(async (): Promise<HoldingRow[]> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_holdings")
    .select("*")
    .eq("user_id", user.id)
    .order("symbol", { ascending: true });
  if (error || !data) return [];

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    buy_price: Number(row.buy_price),
    current_price: row.current_price === null ? null : Number(row.current_price),
  })) as HoldingRow[];
});

/**
 * One category's whole world, for its own page.
 *
 * Separate from `getFinanceDashboard` because the shape differs: a category page
 * needs the entire history of *one* category (to carry its balance forward and
 * to chart a whole year) rather than one month of everything. The rows still go
 * over the wire once, so the page stays a single round trip.
 *
 * Returns `category: null` rather than calling `notFound()` — the page decides
 * what a missing category means, so the DAL stays a plain reader.
 */
export const getCategoryReportData = cache(
  async (categoryId: string, options: { month?: string; projectId?: string } = {}) => {
    const user = await requireUser();
    const supabase = await createClient();
    const month = options.month ?? monthKey();

    const [category, accounts, holdings, entries] = await Promise.all([
      getFinanceCategory(categoryId),
      getFinanceAccounts(),
      getHoldings(),
      (async () => {
        let query = supabase
          .from("finance_transactions")
          .select(
            "*, category:finance_categories(id, name, color, kind), project:projects(id, name, color)"
          )
          .eq("user_id", user.id)
          .eq("category_id", categoryId)
          // Ascending, because `closingBalanceThrough` stops at the first entry
          // in or after the target month — that only works on a sorted array.
          .order("transaction_date", { ascending: true })
          .order("id", { ascending: true })
          .limit(20_000);

        if (options.projectId) query = query.eq("project_id", options.projectId);
        const { data } = await query;
        return ((data ?? []) as unknown[]).map((row) => {
          const transaction = row as TransactionRow;
          return { ...transaction, amount: Number(transaction.amount) };
        }) as TransactionRow[];
      })(),
    ]);

    const account = accounts.find((entry) => entry.category_id === categoryId) ?? null;

    return {
      month,
      category,
      entries,
      openingBalance: account?.opening_balance ?? 0,
      account,
      // Only an investment category has holdings; filtering here keeps the page
      // from needing to know that.
      holdings: holdings.filter((holding) => holding.category_id === categoryId),
    };
  }
);

/**
 * Everything the personal /finance page renders, from one page of queries.
 *
 * The month window is computed here and reused by the ledger, the budgets and
 * the trend, so the three can never describe different months.
 *
 * `allTime` is the other half of the balance. Carrying a balance forward means
 * the opening figure for any month is "everything before it", which cannot be
 * computed from a window that starts at the first of the month — so the whole
 * history comes down once and the report engine slices it in memory. Bounded at
 * 20k rows: roughly 1,600 transactions a year, and a ledger past that is worth
 * paginating rather than shipping to the browser whole.
 */
export const getFinanceDashboard = cache(
  async (
    options: {
      month?: string;
      projectId?: string;
      allTimeLimit?: number;
    } = {}
  ) => {
    const user = await requireUser();
    const supabase = await createClient();

    const month = options.month ?? monthKey();
    const { from, to } = monthRange(month);
    const allTimeLimit = options.allTimeLimit ?? 20_000;

    // Two separate builders rather than one reused twice. postgrest-js
    // accumulates every `.order()` into a single ORDER BY, so re-ordering an
    // already-ordered builder would emit
    // `ORDER BY transaction_date DESC, transaction_date ASC, id ASC` — and
    // Postgres sorts on the first key, so the "ascending" would be silently
    // ignored and the carry-forward would walk the rows backwards.
    let monthQuery = supabase
      .from("finance_transactions")
      .select(
        "*, category:finance_categories(id, name, color, kind), project:projects(id, name, color)"
      )
      .eq("user_id", user.id)
      // Newest first, which is the order the ledger list renders in.
      .order("transaction_date", { ascending: false })
      .gte("transaction_date", from)
      .lte("transaction_date", to)
      .limit(1000);

    let allQuery = supabase
      .from("finance_transactions")
      .select(
        "*, category:finance_categories(id, name, color, kind), project:projects(id, name, color)"
      )
      .eq("user_id", user.id)
      // Oldest first. The report engine reads this array forwards, and a stable
      // id tiebreak keeps same-day rows in a fixed order.
      .order("transaction_date", { ascending: true })
      .order("id", { ascending: true })
      .limit(allTimeLimit);

    if (options.projectId) {
      monthQuery = monthQuery.eq("project_id", options.projectId);
      allQuery = allQuery.eq("project_id", options.projectId);
    }

    const [monthRes, allRes, budgets, bills, recurring, holdings, categories, accounts] =
      await Promise.all([
        monthQuery,
        allQuery,
        getBudgets({ month, projectId: options.projectId }),
        options.projectId ? Promise.resolve([]) : getBills(),
        getRecurring({ activeOnly: true, projectId: options.projectId }),
        getHoldings(),
        getFinanceCategories(),
        getFinanceAccounts(),
      ]);

    const toRows = (rows: unknown[]): TransactionRow[] =>
      (rows as unknown[]).map((row) => {
        const transaction = row as TransactionRow;
        return { ...transaction, amount: Number(transaction.amount) };
      });

    const allTime = toRows(allRes.data ?? []);

    return {
      month,
      transactions: toRows(monthRes.data ?? []),
      /** Kept for callers that still read a trend window; the same rows as allTime. */
      trend: allTime,
      allTime,
      /** True when the ledger is past the limit and the carry-forward is approximate. */
      allTimeTruncated: allTime.length >= allTimeLimit,
      budgets,
      bills,
      recurring,
      holdings,
      categories,
      accounts,
      monthError: monthRes.error?.message ?? null,
      trendError: allRes.error?.message ?? null,
    };
  }
);
