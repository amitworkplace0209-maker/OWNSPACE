import type {
  FinanceAccount,
  FinanceCategory,
  FinanceType,
  PaymentMethod,
} from "@/types";
import type { CategoryBoardEntry } from "@/types";

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

/** The year a YYYY-MM belongs to. */
export function yearKey(month: string): string {
  return month.slice(0, 4);
}

/** First and last month of a YYYY year, as YYYY-MM. */
export function yearRange(year: string): { from: string; to: string } {
  return { from: `${year}-01`, to: `${year}-12` };
}

/** Every YYYY-MM in a year, in order. */
export function monthsOfYear(year: string): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

/** Human label for a YYYY-MM, e.g. "March 2026". */
export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

/** Human label for a YYYY year. */
export function yearLabel(year: string): string {
  return year;
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

// ---------------------------------------------------------------------------
// Month resolution
// ---------------------------------------------------------------------------

/**
 * The months that actually hold at least one transaction, newest first.
 *
 * The report opens on real data rather than on the calendar, so a user who has
 * not opened the app for three weeks lands on the month they last used instead
 * of an empty current month.
 */
export function monthsWithData(entries: LedgerEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.transaction_date) seen.add(entry.transaction_date.slice(0, 7));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

/**
 * Picks the month a report should open on.
 *
 * A requested month wins when it has data. Otherwise the latest month that does,
 * and only then the calendar month — so a brand-new ledger still shows the
 * current month rather than nothing at all.
 */
export function resolveReportMonth(
  entries: LedgerEntry[],
  requested?: string | null,
  today: Date = new Date()
): string {
  const current = monthKey(today);
  const months = monthsWithData(entries);
  if (requested && months.includes(requested)) return requested;
  // The current month is a legitimate choice even with no rows in it: it is the
  // month being added to, and the form needs somewhere to post.
  if (!requested || requested === current) return current;
  return months[0] ?? current;
}

/** The years that hold transactions, newest first. */
export function yearsWithData(entries: LedgerEntry[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.transaction_date) seen.add(entry.transaction_date.slice(0, 4));
  }
  return [...seen].sort((a, b) => b.localeCompare(a));
}

// ---------------------------------------------------------------------------
// Balance carry-forward
// ---------------------------------------------------------------------------

/**
 * Money in hand at the end of the month before `month`.
 *
 * This is the whole rollover rule in one function: a month never starts fresh.
 * Whatever the previous month finished with is what this one opens with, so the
 * balance on any day is opening + everything up to that day. An `openingBase`
 * covers the money you already had before any of this was recorded.
 *
 * Negative is a real result — a credit card's balance is carried the same way
 * and just grows more negative as you spend on it.
 *
 * Walks the whole array rather than stopping at the first entry in or after
 * `month`. Stopping early is only correct on a sorted array, and a silently
 * wrong balance is far worse than scanning a few thousand rows: several callers
 * pass filtered or unsorted history.
 */
export function closingBalanceThrough(
  entries: LedgerEntry[],
  month: string,
  openingBase = 0
): number {
  let running = openingBase;
  for (const entry of entries) {
    if (entry.transaction_date.slice(0, 7) >= month) continue;
    running += entry.type === "income" ? Number(entry.amount) || 0 : -((Number(entry.amount) || 0));
  }
  return running;
}

/** Every transaction dated before `month` starts with. */
export function entriesBeforeMonth(entries: LedgerEntry[], month: string): LedgerEntry[] {
  return entries.filter((entry) => entry.transaction_date.slice(0, 7) < month);
}

// ---------------------------------------------------------------------------
// Statements — one shape used for both the month and the year
// ---------------------------------------------------------------------------

export type PeriodTotals = {
  income: number;
  expense: number;
  net: number;
  /** income − expense as a percentage. Null when there was no income. */
  savingsRate: number | null;
  transactionCount: number;
  /** Mean per transaction, not per day — a month with one big entry is not "cheap". */
  averageTransaction: number;
};

export function totalsOf(entries: LedgerEntry[]): PeriodTotals {
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
    averageTransaction: entries.length > 0 ? (income + expense) / entries.length : 0,
  };
}

export type MonthStatement = {
  month: string;
  /** Carried in from the end of the previous month. */
  openingBalance: number;
  income: number;
  expense: number;
  net: number;
  /** opening + net. What the month finished with, and what next month opens with. */
  closingBalance: number;
  savingsRate: number | null;
  transactionCount: number;
  /** Distinct days that saw a transaction — not the length of the month. */
  activeDays: number;
  /** expense ÷ every day of the month, including the ones nothing was spent on. */
  dailyAverage: number;
  /** A month still in progress is projected forward at the current daily rate. */
  projectedExpense: number;
  biggestExpense: LedgerEntry | null;
  biggestIncome: LedgerEntry | null;
};

/** Days in a YYYY-MM, leap years included. */
export function daysInMonth(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

/**
 * The full month statement for one month, carrying the balance in from all
 * history before it.
 *
 * `projectedExpense` only extrapolates while the month is still running — once
 * it is over the projection is the actual figure, so a finished month never gets
 * restated by a rate that stopped meaning anything.
 */
export function buildMonthStatement(
  entries: LedgerEntry[],
  month: string,
  openingBase = 0,
  today: Date = new Date()
): MonthStatement {
  const inMonth = entries.filter((entry) => entry.transaction_date.slice(0, 7) === month);
  const totals = totalsOf(inMonth);
  const opening = closingBalanceThrough(entries, month, openingBase);

  let biggestExpense: LedgerEntry | null = null;
  let biggestIncome: LedgerEntry | null = null;
  const activeDays = new Set<string>();

  for (const entry of inMonth) {
    activeDays.add(entry.transaction_date);
    const amount = Number(entry.amount) || 0;
    if (entry.type === "expense") {
      if (!biggestExpense || amount > (Number(biggestExpense.amount) || 0)) biggestExpense = entry;
    } else if (!biggestIncome || amount > (Number(biggestIncome.amount) || 0)) {
      biggestIncome = entry;
    }
  }

  const length = daysInMonth(month);
  const isCurrentMonth = month === monthKey(today);
  // Only a month that has actually started is projected. Projecting a future
  // month would report spending that has not happened yet.
  const elapsed = isCurrentMonth ? Math.max(1, today.getDate()) : length;
  const dailyAverage = totals.expense / length;

  return {
    month,
    openingBalance: opening,
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    closingBalance: opening + totals.net,
    savingsRate: totals.savingsRate,
    transactionCount: totals.transactionCount,
    activeDays: activeDays.size,
    dailyAverage,
    projectedExpense: isCurrentMonth ? (totals.expense / elapsed) * length : totals.expense,
    biggestExpense,
    biggestIncome,
  };
}

export type MonthBucket = {
  month: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  /** True for months the user actually touched — the rest are zeros, not data. */
  hasData: boolean;
};

export type YearSummary = {
  year: string;
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  transactionCount: number;
  /** Closing balance at the end of December, carried in from all history. */
  closingBalance: number;
  openingBalance: number;
  /** Mean per month, counting only months that actually had spending. */
  averageMonthlyExpense: number;
  activeMonths: number;
  months: MonthBucket[];
  bestMonth: MonthBucket | null;
  worstMonth: MonthBucket | null;
};

/**
 * The year report, built from the same entries as the month report.
 *
 * No second query and no second set of rules: the month figures are the ones the
 * user has already seen, so a monthly and a yearly total for the same category
 * can never disagree.
 */
export function buildYearSummary(
  entries: LedgerEntry[],
  year: string,
  openingBase = 0
): YearSummary {
  const inYear = entries.filter((entry) => entry.transaction_date.slice(0, 4) === year);
  const totals = totalsOf(inYear);

  const months: MonthBucket[] = monthsOfYear(year).map((month) => {
    const bucket = inYear.filter((entry) => entry.transaction_date.slice(0, 7) === month);
    const income = bucket
      .filter((entry) => entry.type === "income")
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const expense = bucket
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    return {
      month,
      label: new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" }),
      income,
      expense,
      net: income - expense,
      transactionCount: bucket.length,
      hasData: bucket.length > 0,
    };
  });

  // A month with no entries is not "the month where you spent nothing" — it is a
  // month you never opened. Averaging over the months with data is the honest
  // figure; averaging over all twelve would understate a normal month badly.
  const activeMonths = months.filter((month) => month.hasData);
  // Ranked by spending, heaviest first: "the month that cost the most" is the
  // question a yearly report gets asked, and it is the first of this list.
  const ranked = [...activeMonths].sort((a, b) => b.expense - a.expense);
  const january = `${year}-01`;

  return {
    year,
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    savingsRate: totals.savingsRate,
    transactionCount: totals.transactionCount,
    openingBalance: closingBalanceThrough(entries, january, openingBase),
    closingBalance: closingBalanceThrough(entries, `${year}-01`, openingBase) + totals.net,
    averageMonthlyExpense:
      activeMonths.length > 0 ? totals.expense / activeMonths.length : 0,
    activeMonths: activeMonths.length,
    months,
    // "Worst" means most spent, which for a spending report is the one worth
    // naming. The lightest month is only interesting when there are two or more
    // to compare — a single active month has no "best" to speak of.
    worstMonth: ranked[0] ?? null,
    bestMonth: ranked.length > 1 ? ranked[ranked.length - 1] : null,
  };
}

// ---------------------------------------------------------------------------
// Per-category reports
// ---------------------------------------------------------------------------

/** A period measured for one category. */
export type CategoryPeriod = {
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
  /** Percentage of the parent book's spending for this period. Null when nothing. */
  share: number | null;
  trend: { percent: number | null; direction: "up" | "down" | "flat" };
};

export type CategoryReport = {
  categoryId: string | null;
  name: string;
  color: string | null;
  month: string;
  year: string;
  current: CategoryPeriod;
  previous: CategoryPeriod;
  yearly: CategoryPeriod;
  lifetime: CategoryPeriod;
  /** Day-by-day for the selected month — the bar chart's source. */
  days: MonthBucket[];
  /** Twelve-month shape for the selected year. */
  months: MonthBucket[];
  /** Every transaction in the selected month, newest first. */
  entries: LedgerEntry[];
};

function periodOf(
  entries: LedgerEntry[],
  shareBase: number,
  previousEntries: LedgerEntry[]
): CategoryPeriod {
  const totals = totalsOf(entries);
  const previous = totalsOf(previousEntries);
  // Compared on gross movement rather than on net: a category that spends 10k and
  // receives 10k netted to zero, which would read as "no change" when it moved
  // twenty thousand rupees in each direction.
  const change = monthOverMonth(totals.income + totals.expense, previous.income + previous.expense);

  return {
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    transactionCount: totals.transactionCount,
    share: shareBase > 0 ? ((totals.expense || totals.income) / shareBase) * 100 : null,
    trend: change,
  };
}

function bucketByMonth(entries: LedgerEntry[]): Map<string, LedgerEntry[]> {
  const buckets = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const key = entry.transaction_date.slice(0, 7);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }
  return buckets;
}

function bucketByDay(entries: LedgerEntry[]): MonthBucket[] {
  const buckets = new Map<string, LedgerEntry[]>();
  for (const entry of entries) {
    const bucket = buckets.get(entry.transaction_date) ?? [];
    bucket.push(entry);
    buckets.set(entry.transaction_date, bucket);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => {
      const income = bucket
        .filter((entry) => entry.type === "income")
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      const expense = bucket
        .filter((entry) => entry.type === "expense")
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
      return {
        month: date,
        label: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        income,
        expense,
        net: income - expense,
        transactionCount: bucket.length,
        hasData: true,
      };
    });
}

/**
 * Everything one category has done, across four windows at once.
 *
 * The month, the previous month, the year and all-time are cut from the same
 * array in one pass so a custom category gets a full report on the same terms as
 * a built-in one — the only difference between the two is which `kind` decides
 * the headline numbers, not whether it has a report at all.
 *
 * `shareBase` is the book total (all household spending, all investments) so the
 * category can say "this is 34% of the house", not just its own running total.
 */
export function buildCategoryReport(
  entries: LedgerEntry[],
  options: {
    categoryId?: string | null;
    name?: string;
    color?: string | null;
    month: string;
    year?: string;
    shareBase?: number;
  }
): CategoryReport {
  const { categoryId = null, name = "Uncategorised", color = null, month } = options;
  const year = options.year ?? yearKey(month);
  const previousMonth = shiftMonth(month, -1);
  const shareBase = options.shareBase ?? 0;

  const own = categoryId
    ? entries.filter(
        (entry) => entry.category?.id === categoryId || entry.category_id === categoryId
      )
    : entries.filter((entry) => !entry.category?.id && !entry.category_id);

  const byMonth = bucketByMonth(own);

  const months: MonthBucket[] = monthsOfYear(year).map((key) => {
    const bucket = byMonth.get(key) ?? [];
    const income = bucket
      .filter((entry) => entry.type === "income")
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    const expense = bucket
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
    return {
      month: key,
      label: new Date(`${key}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" }),
      income,
      expense,
      net: income - expense,
      transactionCount: bucket.length,
      hasData: bucket.length > 0,
    };
  });

  const currentEntries = byMonth.get(month) ?? [];
  const previousEntries = byMonth.get(previousMonth) ?? [];
  const yearlyEntries = own.filter((entry) => entry.transaction_date.slice(0, 4) === year);

  return {
    categoryId,
    name,
    color,
    month,
    year,
    current: periodOf(currentEntries, shareBase, previousEntries),
    previous: periodOf(previousEntries, shareBase, []),
    yearly: periodOf(yearlyEntries, shareBase, []),
    lifetime: periodOf(own, shareBase, []),
    days: bucketByDay(currentEntries),
    months,
    entries: [...currentEntries].sort((a, b) =>
      b.transaction_date.localeCompare(a.transaction_date)
    ),
  };
}

// ---------------------------------------------------------------------------
// Kind-specific metrics
// ---------------------------------------------------------------------------

/** The running position of an account, day by day, for one month. */
export type AccountDay = {
  date: string;
  label: string;
  income: number;
  expense: number;
  net: number;
  /** Cumulative balance, carried in from the opening balance. */
  balance: number;
  count: number;
};

export type AccountSummary = {
  openingBalance: number;
  income: number;
  expense: number;
  net: number;
  closingBalance: number;
  /** Closing − opening, as a percentage of opening. Null when opening is zero. */
  changePercent: number | null;
  days: AccountDay[];
  /** Lowest and highest closing balance reached in the month. */
  lowest: number;
  highest: number;
};

/**
 * An account's position for a month: what it opened with, what came in and out,
 * and what it is left with.
 *
 * This is the shape "Hisab" needs and the one a plain expense category does not:
 * the balance is cumulative across every month, so `closingBalance` here equals
 * `openingBalance` of the next month exactly, with nothing to reconcile.
 */
export function buildAccountSummary(
  entries: LedgerEntry[],
  categoryId: string | null,
  month: string,
  openingBase = 0
): AccountSummary {
  const own = categoryId
    ? entries.filter(
        (entry) => entry.category?.id === categoryId || entry.category_id === categoryId
      )
    : entries.filter((entry) => !entry.category?.id && !entry.category_id);

  const openingBalance = closingBalanceThrough(own, month, openingBase);
  const inMonth = own.filter((entry) => entry.transaction_date.slice(0, 7) === month);

  let running = openingBalance;
  let lowest = openingBalance;
  let highest = openingBalance;

  const days: AccountDay[] = [...inMonth]
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date))
    .reduce<AccountDay[]>((rows, entry) => {
      const amount = Number(entry.amount) || 0;
      const signed = entry.type === "income" ? amount : -amount;
      running += signed;

      const last = rows[rows.length - 1];
      if (last && last.date === entry.transaction_date) {
        last.income += entry.type === "income" ? amount : 0;
        last.expense += entry.type === "expense" ? amount : 0;
        last.net += signed;
        last.balance = running;
        last.count += 1;
        return rows;
      }

      rows.push({
        date: entry.transaction_date,
        label: new Date(`${entry.transaction_date}T00:00:00`).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
        }),
        income: entry.type === "income" ? amount : 0,
        expense: entry.type === "expense" ? amount : 0,
        net: signed,
        balance: running,
        count: 1,
      });
      return rows;
    }, []);

  for (const day of days) {
    if (day.balance < lowest) lowest = day.balance;
    if (day.balance > highest) highest = day.balance;
  }

  const income = inMonth
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const expense = inMonth
    .filter((entry) => entry.type === "expense")
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const closingBalance = openingBalance + income - expense;

  return {
    openingBalance,
    income,
    expense,
    net: income - expense,
    closingBalance,
    changePercent: openingBalance > 0 ? ((closingBalance - openingBalance) / openingBalance) * 100 : null,
    days,
    lowest: days.length > 0 ? lowest : closingBalance,
    highest: days.length > 0 ? highest : closingBalance,
  };
}

/** How a liability has moved over the life of the account. */
export type LiabilitySummary = {
  borrowed: number;
  repaid: number;
  /** Still owed. Negative once fully repaid. */
  outstanding: number;
  payments: number;
  /** Outstanding after the oldest payment — the high-water mark of the debt. */
  peakOutstanding: number;
  /** Average paid per payment, or null when nothing has been paid yet. */
  averagePayment: number | null;
};
/**
 * A liability is a loan, so the only meaningful figure is what is still owed.
 *
 * The interest part of an EMI cannot be separated without the rate schedule, so
 * it is deliberately not estimated here — a made-up principal/interest split
 * would be worse than none.
 */
export function summariseLiability(entries: LedgerEntry[], categoryId: string | null): LiabilitySummary {
  const own = categoryId
    ? entries.filter(
        (entry) => entry.category?.id === categoryId || entry.category_id === categoryId
      )
    : entries.filter((entry) => !entry.category?.id && !entry.category_id);

  const borrowed = own
    .filter((entry) => entry.type === "income")
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);
  const payments = own
    .filter((entry) => entry.type === "expense")
    .sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));

  const repaid = payments.reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  let running = borrowed;
  let peak = borrowed;
  for (const entry of payments) {
    running -= Number(entry.amount) || 0;
    if (running > peak) peak = running;
  }

  return {
    borrowed,
    repaid,
    outstanding: running,
    payments: payments.length,
    peakOutstanding: peak,
    averagePayment: payments.length > 0 ? repaid / payments.length : null,
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

export type MonthSummary = {
  income: number;
  expense: number;
  net: number;
  /** income − expense, 0-100. Null when there was no income to save from. */
  savingsRate: number | null;
  transactionCount: number;
  /** Average across the entries that were recorded. */
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
  const totals = totalsOf(entries);
  return {
    income: totals.income,
    expense: totals.expense,
    net: totals.net,
    savingsRate: totals.savingsRate,
    transactionCount: totals.transactionCount,
    averageExpense: totals.averageTransaction,
  };
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
// ---------------------------------------------------------------------------
// The category board
// ---------------------------------------------------------------------------

/**
 * Turns categories plus their transactions into the rows the category board
 * renders: one row per category, with its month, previous month and year
 * figures, and a closing balance for the accounts.
 *
 * One pass over the transactions fills every window at once. Doing this per
 * category would be O(categories × transactions) — with a hundred categories and
 * twenty thousand rows that is the difference between a page that loads and one
 * that does not.
 *
 * `isAccount` follows the category's *type* as well as its kind, because that is
 * what actually decides whether a closing balance means anything: a category
 * typed `account` holds money, anything else is a bucket.
 */
export function buildCategoryBoardRows(
  categories: FinanceCategory[],
  entries: LedgerEntry[],
  month: string,
  accounts: FinanceAccount[] = []
): CategoryBoardEntry[] {
  const previousMonth = shiftMonth(month, -1);
  const year = yearKey(month);
  const openingBy = new Map(accounts.map((row) => [row.category_id, row.opening_balance]));

  // category_id -> window -> rupees moved in that window
  const totals = new Map<string, { month: number; previous: number; year: number; count: number }>();

  for (const entry of entries) {
    const id = entry.category_id ?? entry.category?.id;
    if (!id) continue;

    const amount = Number(entry.amount) || 0;
    const bucket = totals.get(id) ?? { month: 0, previous: 0, year: 0, count: 0 };
    const key = entry.transaction_date.slice(0, 7);

    if (key === month) {
      bucket.month += amount;
      bucket.count += 1;
    } else if (key === previousMonth) {
      bucket.previous += amount;
    }

    if (entry.transaction_date.slice(0, 4) === year) bucket.year += amount;

    totals.set(id, bucket);
  }

  return categories.map((category) => {
    const bucket = totals.get(category.id);
    const isAccount = category.type === "account" || category.kind === "cash_bank";

    return {
      id: category.id,
      name: category.name,
      kind: category.kind,
      type: category.type,
      color: category.color,
      icon: category.icon,
      isPinned: category.is_pinned !== false,
      monthValue: bucket?.month ?? 0,
      previousValue: bucket?.previous ?? 0,
      yearValue: bucket?.year ?? 0,
      transactionCount: bucket?.count ?? 0,
      // Only worth computing for the handful of categories that actually hold
      // money — for everything else it would always be null.
      balance: isAccount
        ? buildAccountSummary(entries, category.id, month, openingBy.get(category.id) ?? 0)
            .closingBalance
        : null,
      hasOpeningBalance: openingBy.has(category.id),
      activeMonth: month,
    };
  });
}
