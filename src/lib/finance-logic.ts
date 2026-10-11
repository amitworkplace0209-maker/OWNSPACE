import type { FinanceType, PaymentMethod } from "@/types";

/**
 * Pure finance arithmetic.
 *
 * Everything here is deliberately free of Supabase and of `server-only`, so the
 * numbers on the page can be tested without a database. The month and date
 * helpers use local time on purpose: a ledger is organised by the user's
 * calendar day, and a UTC conversion would slide a late-evening transaction
 * into the wrong month.
 */

/** Local YYYY-MM-DD. */
export function isoDate(value: Date = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local YYYY-MM. */
export function monthKey(value: Date = new Date()): string {
  return isoDate(value).slice(0, 7);
}

/** First and last day of a YYYY-MM, as local YYYY-MM-DD strings. */
export function monthRange(key: string): { from: string; to: string } {
  const [year, month] = key.split("-").map(Number);
  const last = new Date(year, month, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}

/** Shift a YYYY-MM by a number of months. */
export function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a YYYY-MM, e.g. "March 2026". */
export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function isSameMonth(transactionDate: string, key: string): boolean {
  return transactionDate.slice(0, 7) === key;
}

/** The minimum shape the ledger needs, so tests can pass plain objects. */
export type LedgerEntry = {
  id: string;
  type: FinanceType;
  amount: number;
  transaction_date: string;
  description?: string | null;
  category_id?: string | null;
  category?: { id: string; name: string; color: string | null } | null;
  project?: { id: string; name: string } | null;
  payment_method?: PaymentMethod | null;
  reference?: string | null;
  tags?: string[] | null;
  source?: string | null;
};

export type MonthSummary = {
  income: number;
  expense: number;
  net: number;
  /** income − expense, 0-100. Null when there was no income to save from. */
  savingsRate: number | null;
  transactionCount: number;
  /** Average across months that actually had spending. */
  averageExpense: number;
};

/**
 * Rolls a month's transactions into the headline figures.
 *
 * `savingsRate` is null rather than 0 when income is zero: "you saved nothing"
 * and "there was nothing to save" are different facts, and showing 0% for the
 * second one would be a lie.
 */
export function summarizeMonth(entries: LedgerEntry[]): MonthSummary {
  let income = 0;
  let expense = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (entry.type === "income") income += amount;
    else expense += amount;
  }

  return {
    income,
    expense,
    net: income - expense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : null,
    transactionCount: entries.length,
    averageExpense: entries.length > 0 ? expense / entries.length : 0,
  };
}

/**
 * Daily running balance — the "hisab kitab" view.
 *
 * Carries the balance forward from the start of the month, so the number on a
 * row is the real position on that day rather than a per-day delta.
 */
export type LedgerDay = {
  date: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Cumulative income − expense through the end of this day. */
  balance: number;
  count: number;
};

export function buildLedger(entries: LedgerEntry[], openingBalance = 0): LedgerDay[] {
  const byDay = new Map<string, LedgerDay>();

  for (const entry of entries) {
    const date = entry.transaction_date;
    const amount = Number(entry.amount) || 0;

    let day = byDay.get(date);
    if (!day) {
      day = {
        date,
        label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        income: 0,
        expense: 0,
        net: 0,
        balance: 0,
        count: 0,
      };
      byDay.set(date, day);
    }

    if (entry.type === "income") day.income += amount;
    else day.expense += amount;
    day.count += 1;
  }

  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  let running = openingBalance;
  for (const day of days) {
    day.net = day.income - day.expense;
    running += day.net;
    day.balance = running;
  }
  return days;
}

export type CategorySlice = {
  id: string | null;
  name: string;
  color: string | null;
  value: number;
  count: number;
  /** 0-100 of the type's total. */
  share: number;
};

/**
 * Spending (or income) grouped by category, biggest first.
 *
 * Grouped by category id where there is one, not by name: two categories can
 * legitimately share a name across types, and merging them would silently
 * combine income with spending.
 */
export function groupByCategory(
  entries: LedgerEntry[],
  type: FinanceType
): CategorySlice[] {
  const totals = new Map<string, CategorySlice>();

  for (const entry of entries) {
    if (entry.type !== type) continue;
    const key = entry.category?.id ?? "uncategorised";
    const slice = totals.get(key) ?? {
      id: entry.category?.id ?? null,
      name: entry.category?.name ?? "Uncategorised",
      color: entry.category?.color ?? null,
      value: 0,
      count: 0,
      share: 0,
    };
    slice.value += Number(entry.amount) || 0;
    slice.count += 1;
    totals.set(key, slice);
  }

  const slices = [...totals.values()];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  for (const slice of slices) {
    slice.share = total > 0 ? (slice.value / total) * 100 : 0;
  }
  return slices.sort((a, b) => b.value - a.value);
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export type BudgetInput = {
  id: string;
  month: string;
  amount: number;
  category_id: string | null;
  project_id: string | null;
  category?: { id: string; name: string; color: string | null } | null;
};

export type BudgetProgress = {
  id: string;
  month: string;
  label: string;
  /** null = overall budget, not tied to a category or project. */
  categoryName: string | null;
  amount: number;
  spent: number;
  remaining: number;
  /** 0-100+, over 100 means overspent. */
  percent: number;
  state: "under" | "near" | "over";
};

/**
 * Matches each budget against what was actually spent.
 *
 * Only expense transactions count toward a budget. Income has its own meaning
 * and counting it would make an over-budget month look healthy.
 */
export function computeBudgets(
  budgets: BudgetInput[],
  entries: LedgerEntry[],
  options: { projectId?: string } = {}
): BudgetProgress[] {
  const progress: BudgetProgress[] = [];

  for (const budget of budgets) {
    if (!budget.month) continue;

    const spent = entries
      .filter((entry) => {
        if (entry.type !== "expense") return false;
        // A NULL on the budget means "everything", so an uncategorised
        // transaction still counts against it.
        if (budget.category_id && entry.category?.id !== budget.category_id) return false;
        if (budget.project_id && entry.project?.id !== budget.project_id) return false;
        if (!budget.project_id && !budget.category_id && options.projectId) {
          if (entry.project?.id !== options.projectId) return false;
        }
        return true;
      })
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

    const percent = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

    // 85% is the point where a month is worth acting on; past 100 the
    // budget is already broken.
    const state: BudgetProgress["state"] =
      percent >= 100 ? "over" : percent >= 85 ? "near" : "under";

    progress.push({
      id: budget.id,
      month: budget.month,
      label: budget.category?.name ?? "Overall",
      categoryName: budget.category?.name ?? null,
      amount: budget.amount,
      spent,
      remaining: budget.amount - spent,
      percent,
      state,
    });
  }

  return progress.sort((a, b) => b.percent - a.percent);
}

// ---------------------------------------------------------------------------
// Recurring transactions
// ---------------------------------------------------------------------------

export type RecurrenceRule = "daily" | "weekly" | "monthly" | "yearly" | "custom";

/** Last day of a month, for clamping. */
function lastDayOf(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * The next occurrence after `from`.
 *
 * Monthly arithmetic clamps rather than overflows: the 31st in a 30-day month
 * becomes the 30th, and never rolls into the following month — otherwise rent
 * due on the 31st would quietly post in March.
 */
export function nextRecurringDate(
  from: string,
  rule: RecurrenceRule,
  every = 1,
  repeatDays: number[] = []
): string {
  const base = new Date(`${from}T00:00:00`);
  if (Number.isNaN(base.getTime())) return from;

  const step = Math.max(1, Math.trunc(every) || 1);

  if (rule === "custom") {
    const days = repeatDays.filter((day) => day >= 0 && day <= 6);
    if (days.length === 0) return from;
    for (let offset = 1; offset <= 8; offset += 1) {
      const candidate = new Date(base.getTime());
      candidate.setDate(base.getDate() + offset);
      if (days.includes(candidate.getDay())) return isoDate(candidate);
    }
    return from;
  }

  const next = new Date(base.getTime());
  const day = base.getDate();

  switch (rule) {
    case "daily":
      next.setDate(next.getDate() + step);
      break;
    case "weekly":
      next.setDate(next.getDate() + step * 7);
      break;
    case "monthly": {
      const targetMonth = base.getMonth() + step;
      next.setDate(1);
      next.setMonth(targetMonth);
      next.setDate(Math.min(day, lastDayOf(next.getFullYear(), next.getMonth())));
      break;
    }
    case "yearly": {
      next.setDate(1);
      next.setFullYear(base.getFullYear() + step);
      next.setMonth(base.getMonth());
      next.setDate(Math.min(day, lastDayOf(next.getFullYear(), next.getMonth())));
      break;
    }
  }
  return isoDate(next);
}

/**
 * Which due dates a rule owes, up to `until`.
 *
 * Returns every occurrence, not just the next one, so a schedule that has not
 * been generated in a while can be backfilled in a single pass.
 */
export function occurrencesBetween(
  from: string,
  rule: RecurrenceRule,
  every: number,
  options: { from: string; until?: string | null; repeatDays?: number[]; limit?: number } = {
    from,
  }
): string[] {
  const results: string[] = [];
  const limit = options.limit ?? 24;
  let cursor = from;

  for (let i = 0; i < limit; i += 1) {
    cursor = nextRecurringDate(cursor, rule, every, options.repeatDays ?? []);
    if (cursor === from && i === 0) break; // no progress
    if (options.until && cursor > options.until) break;
    if (cursor < options.from) continue;
    results.push(cursor);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export type BillState = "overdue" | "due_soon" | "upcoming" | "paid" | "inactive";

export type BillInput = {
  id: string;
  name: string;
  amount: number;
  due_day: number;
  status: string;
  is_active: boolean;
  last_paid_on: string | null;
  remind_days_before: number | null;
};

/**
 * The date a bill is due in a given month, clamped to that month's length.
 *
 * Rent on the 31st in February becomes the 28th (or 29th) rather than spilling
 * into March.
 */
export function billDueDate(key: string, dueDay: number): string {
  const [year, month] = key.split("-").map(Number);
  const clamped = Math.min(Math.max(1, dueDay), lastDayOf(year, month - 1));
  return `${key}-${String(clamped).padStart(2, "0")}`;
}

export function billState(
  bill: BillInput,
  key: string,
  today: Date = new Date()
): { state: BillState; dueOn: string; daysUntil: number } {
  if (!bill.is_active) {
    return { state: "inactive", dueOn: billDueDate(key, bill.due_day), daysUntil: 0 };
  }

  const dueOn = billDueDate(key, bill.due_day);

  // A bill settled on a date inside this month is done for this month.
  if (bill.status === "paid" && bill.last_paid_on && bill.last_paid_on.slice(0, 7) === key) {
    return { state: "paid", dueOn, daysUntil: 0 };
  }

  const daysUntil = Math.round(
    (new Date(`${dueOn}T00:00:00`).getTime() - startOfDay(today).getTime()) / 86_400_000
  );

  if (bill.status === "skipped") return { state: "upcoming", dueOn, daysUntil };
  if (daysUntil < 0) return { state: "overdue", dueOn, daysUntil };
  if (bill.remind_days_before !== null && daysUntil <= bill.remind_days_before) {
    return { state: "due_soon", dueOn, daysUntil };
  }
  return { state: "upcoming", dueOn, daysUntil };
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

// ---------------------------------------------------------------------------
// Holdings
// ---------------------------------------------------------------------------

export type HoldingInput = {
  id: string;
  symbol: string;
  name: string | null;
  quantity: number;
  buy_price: number;
  current_price: number | null;
};

export type HoldingValue = HoldingInput & {
  invested: number;
  currentValue: number | null;
  /** null when no current price has been entered. */
  pnl: number | null;
  pnlPercent: number | null;
};

/**
 * Portfolio value and unrealised P/L.
 *
 * `currentValue` and `pnl` are null without a current price rather than
 * defaulting to the buy price — that would report a flat portfolio and imply
 * it had been valued.
 *
 * Generic over the input so every field of the row it was given is preserved.
 * Narrowing to `HoldingInput` here would drop `notes`, `acquired_on` and the
 * rest, and the caller could no longer hand the result back to an edit form.
 */
export function valueHoldings<T extends HoldingInput>(
  holdings: T[]
): Array<T & Omit<HoldingValue, keyof HoldingInput>> {
  return holdings.map((holding) => {
    const quantity = Number(holding.quantity) || 0;
    const buyPrice = Number(holding.buy_price) || 0;
    const invested = quantity * buyPrice;

    if (holding.current_price === null || holding.current_price === undefined) {
      return { ...holding, invested, currentValue: null, pnl: null, pnlPercent: null };
    }

    const currentPrice = Number(holding.current_price) || 0;
    const currentValue = quantity * currentPrice;
    const pnl = currentValue - invested;

    return {
      ...holding,
      invested,
      currentValue,
      pnl,
      pnlPercent: invested > 0 ? (pnl / invested) * 100 : null,
    };
  });
}

export type PortfolioSummary = {
  invested: number;
  /** Null when nothing has a price yet. */
  currentValue: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  /** Holdings still missing a current price. */
  unpriced: number;
};

export function summarisePortfolio(holdings: HoldingInput[]): PortfolioSummary {
  const valued = valueHoldings(holdings);
  const invested = valued.reduce((sum, holding) => sum + holding.invested, 0);
  const priced = valued.filter((holding) => holding.currentValue !== null);

  if (priced.length === 0) {
    return { invested, currentValue: null, pnl: null, pnlPercent: null, unpriced: valued.length };
  }

  const currentValue = priced.reduce((sum, holding) => sum + (holding.currentValue ?? 0), 0);
  // Holdings with no price still count toward the cost basis, so P/L is
  // measured against everything actually bought.
  const pnl = currentValue - invested;

  return {
    invested,
    currentValue,
    pnl,
    pnlPercent: invested > 0 ? (pnl / invested) * 100 : null,
    unpriced: valued.length - priced.length,
  };
}

// ---------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------

export type TrendPoint = {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
};

export function monthlyTrend(entries: LedgerEntry[], months: number, today = new Date()): TrendPoint[] {
  const points: TrendPoint[] = [];
  const current = monthKey(today);

  for (let i = months - 1; i >= 0; i -= 1) {
    const key = shiftMonth(current, -i);
    points.push({
      month: key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, {
        month: "short",
        year: "2-digit",
      }),
      income: 0,
      expense: 0,
      net: 0,
    });
  }

  const byMonth = new Map<string, { income: number; expense: number }>();
  for (const entry of entries) {
    const key = entry.transaction_date.slice(0, 7);
    const bucket = byMonth.get(key) ?? { income: 0, expense: 0 };
    const amount = Number(entry.amount) || 0;
    if (entry.type === "income") bucket.income += amount;
    else bucket.expense += amount;
    byMonth.set(key, bucket);
  }

  for (const point of points) {
    const bucket = byMonth.get(point.month);
    if (!bucket) continue;
    point.income = bucket.income;
    point.expense = bucket.expense;
    point.net = bucket.income - bucket.expense;
  }
  return points;
}

/**
 * Month-over-month change for a figure, as a percentage.
 *
 * Null when the previous month was zero — a jump from 0 has no meaningful
 * percentage, and reporting "Infinity%" or "100%" would both be misleading.
 */
export function monthOverMonth(
  current: number,
  previous: number
): { percent: number | null; direction: "up" | "down" | "flat" } {
  if (previous === 0) return { percent: null, direction: current === 0 ? "flat" : "up" };
  const percent = ((current - previous) / Math.abs(previous)) * 100;
  return {
    percent,
    direction: percent > 0.05 ? "up" : percent < -0.05 ? "down" : "flat",
  };
}