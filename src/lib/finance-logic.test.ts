import { describe, expect, it } from "vitest";
import {
  billDueDate,
  billState,
  buildAccountSummary,
  buildCategoryBoardRows,
  buildCategoryReport,
  buildLedger,
  buildMonthStatement,
  buildYearSummary,
  closingBalanceThrough,
  computeBudgets,
  daysInMonth,
  groupByCategory,
  isSameMonth,
  isoDate,
  monthsOfYear,
  monthsWithData,
  monthKey,
  monthLabel,
  monthOverMonth,
  monthRange,
  monthlyTrend,
  nextRecurringDate,
  occurrencesBetween,
  resolveReportMonth,
  shiftMonth,
  summariseLiability,
  summarizeMonth,
  summarisePortfolio,
  totalsOf,
  valueHoldings,
  yearKey,
  yearRange,
  yearsWithData,
  type LedgerEntry,
} from "@/lib/finance-logic";
import type { FinanceAccount, FinanceCategory } from "@/types";

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "t1",
    type: "expense",
    amount: 100,
    transaction_date: "2026-03-10",
    ...over,
  };
}

/** An entry filed under a category, which is what a category report reads. */
function filed(categoryId: string, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return entry({
    category_id: categoryId,
    category: { id: categoryId, name: "Test", color: null },
    ...over,
  });
}

describe("month helpers", () => {
  it("formats a local YYYY-MM-DD", () => {
    expect(isoDate(new Date(2026, 2, 5))).toBe("2026-03-05");
  });

  it("formats a YYYY-MM", () => {
    expect(monthKey(new Date(2026, 2, 5))).toBe("2026-03");
  });

  it("gives the real last day of a month", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2024-02")).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(monthRange("2026-04")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("shifts months across year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-03", -3)).toBe("2025-12");
  });

  it("labels a month", () => {
    expect(monthLabel("2026-03")).toMatch(/March 2026/);
  });

  it("compares a transaction date to a month", () => {
    expect(isSameMonth("2026-03-31", "2026-03")).toBe(true);
    expect(isSameMonth("2026-04-01", "2026-03")).toBe(false);
  });
});

describe("summarizeMonth", () => {
  it("separates income from expense", () => {
    const summary = summarizeMonth([
      entry({ type: "income", amount: 50_000 }),
      entry({ type: "expense", amount: 20_000 }),
      entry({ type: "expense", amount: 5_000 }),
    ]);
    expect(summary.income).toBe(50_000);
    expect(summary.expense).toBe(25_000);
    expect(summary.net).toBe(25_000);
    expect(summary.transactionCount).toBe(3);
  });

  it("reports a savings rate when there is income", () => {
    expect(summarizeMonth([
      entry({ type: "income", amount: 100 }),
      entry({ type: "expense", amount: 25 }),
    ]).savingsRate).toBe(75);
  });

  it("leaves the savings rate null when there was no income", () => {
    // "You saved nothing" and "there was nothing to save" are different facts.
    expect(summarizeMonth([entry({ type: "expense", amount: 100 })]).savingsRate).toBeNull();
  });

  it("handles an empty month", () => {
    const summary = summarizeMonth([]);
    expect(summary).toMatchObject({ income: 0, expense: 0, net: 0, transactionCount: 0 });
  });

  it("reports a negative rate when spending exceeded income", () => {
    expect(summarizeMonth([
      entry({ type: "income", amount: 100 }),
      entry({ type: "expense", amount: 150 }),
    ]).savingsRate).toBe(-50);
  });
});

describe("buildLedger", () => {
  it("carries the balance forward day to day", () => {
    const days = buildLedger([
      entry({ id: "a", type: "income", amount: 1000, transaction_date: "2026-03-01" }),
      entry({ id: "b", type: "expense", amount: 300, transaction_date: "2026-03-02" }),
      entry({ id: "c", type: "expense", amount: 200, transaction_date: "2026-03-02" }),
      entry({ id: "d", type: "expense", amount: 100, transaction_date: "2026-03-05" }),
    ]);

    expect(days).toHaveLength(3);
    expect(days[0].balance).toBe(1000);
    expect(days[1].balance).toBe(500);
    expect(days[2].balance).toBe(400);
  });

  it("sorts days chronologically regardless of input order", () => {
    const days = buildLedger([
      entry({ transaction_date: "2026-03-09" }),
      entry({ transaction_date: "2026-03-01" }),
    ]);
    expect(days.map((day) => day.date)).toEqual(["2026-03-01", "2026-03-09"]);
  });

  it("starts from an opening balance", () => {
    expect(buildLedger([entry({ type: "income", amount: 100 })], 500)[0].balance).toBe(600);
  });

  it("counts several transactions on one day", () => {
    expect(buildLedger([entry(), entry(), entry()])[0].count).toBe(3);
  });
});

describe("groupByCategory", () => {
  const cat = (id: string, name: string) => ({ id, name, color: "#fff" });

  it("groups by category and shares the total", () => {
    const slices = groupByCategory([
      entry({ type: "expense", amount: 300, category: cat("c1", "Food") }),
      entry({ type: "expense", amount: 100, category: cat("c1", "Food") }),
      entry({ type: "expense", amount: 100, category: cat("c2", "Travel") }),
    ], "expense");

    expect(slices.map((s) => s.name)).toEqual(["Food", "Travel"]);
    expect(slices[0].value).toBe(400);
    expect(slices[0].share).toBeCloseTo(80);
  });

  it("buckets uncategorised spending", () => {
    const slices = groupByCategory([entry({ type: "expense", amount: 50 })], "expense");
    expect(slices[0]).toMatchObject({ id: null, name: "Uncategorised", count: 1 });
  });

  it("keeps income and expense apart even with a shared category name", () => {
    // Grouping by name would silently merge these into one bar.
    const slices = groupByCategory([
      entry({ type: "expense", amount: 100, category: cat("c1", "Other") }),
    ], "expense");
    expect(slices).toHaveLength(1);
  });

  it("returns nothing for a type with no rows", () => {
    expect(groupByCategory([entry({ type: "income" })], "expense")).toHaveLength(0);
  });
});

describe("computeBudgets", () => {
  const budget = (over = {}) => ({
    id: "b1",
    month: "2026-03",
    amount: 10_000,
    category_id: null,
    project_id: null,
    category: null,
    ...over,
  });

  it("counts only expenses against a budget", () => {
    // Counting income would make an over-budget month look healthy.
    const [progress] = computeBudgets([budget()], [
      entry({ type: "expense", amount: 4000 }),
      entry({ type: "income", amount: 50_000 }),
    ]);
    expect(progress.spent).toBe(4000);
    expect(progress.remaining).toBe(6000);
    expect(progress.state).toBe("under");
  });

  it("scopes a budget to its category", () => {
    const cat = { id: "c1", name: "Food", color: null };
    const [progress] = computeBudgets([budget({ category_id: "c1", category: cat })], [
      entry({ type: "expense", amount: 100, category: cat }),
      entry({ type: "expense", amount: 5000, category: { id: "c2", name: "Travel", color: null } }),
    ]);
    expect(progress.spent).toBe(100);
    expect(progress.label).toBe("Food");
  });

  it("counts uncategorised spending against an overall budget", () => {
    const [progress] = computeBudgets([budget()], [entry({ type: "expense", amount: 700 })]);
    expect(progress.spent).toBe(700);
  });

  it("flags nearing and overspent", () => {
    expect(computeBudgets([budget({ amount: 100 })], [entry({ amount: 50 })])[0].state).toBe("under");
    expect(computeBudgets([budget({ amount: 100 })], [entry({ amount: 90 })])[0].state).toBe("near");
    expect(computeBudgets([budget({ amount: 100 })], [entry({ amount: 120 })])[0].state).toBe("over");
  });

  it("sorts the most overspent first", () => {
    const cat = (id: string) => ({ id, name: id, color: null });
    // Distinct categories, otherwise both overall budgets match every row and
    // the order would be arbitrary.
    const progress = computeBudgets(
      [
        budget({ id: "b1", amount: 100, category_id: "c1", category: cat("c1") }),
        budget({ id: "b2", amount: 100, category_id: "c2", category: cat("c2") }),
      ],
      [
        entry({ amount: 50, category: cat("c1") }),
        entry({ amount: 500, category: cat("c2") }),
      ]
    );
    expect(progress[0].id).toBe("b2");
    expect(progress[0].state).toBe("over");
  });
});

describe("nextRecurringDate", () => {
  it("advances daily, weekly, monthly, yearly", () => {
    expect(nextRecurringDate("2026-03-10", "daily")).toBe("2026-03-11");
    expect(nextRecurringDate("2026-03-10", "weekly")).toBe("2026-03-17");
    expect(nextRecurringDate("2026-03-10", "monthly")).toBe("2026-04-10");
    expect(nextRecurringDate("2026-03-10", "yearly")).toBe("2027-03-10");
  });

  it("respects the interval", () => {
    expect(nextRecurringDate("2026-03-10", "weekly", 2)).toBe("2026-03-24");
    expect(nextRecurringDate("2026-03-10", "daily", 5)).toBe("2026-03-15");
  });

  it("clamps a 31st monthly to a shorter month instead of overflowing", () => {
    // Rent on the 31st must not quietly post in March.
    expect(nextRecurringDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextRecurringDate("2026-03-31", "monthly")).toBe("2026-04-30");
    expect(nextRecurringDate("2028-01-31", "monthly")).toBe("2028-02-29");
  });

  it("keeps the day when moving forward across a long month", () => {
    expect(nextRecurringDate("2026-01-30", "monthly")).toBe("2026-02-28");
    expect(nextRecurringDate("2026-01-15", "monthly")).toBe("2026-02-15");
  });

  it("clamps Feb 29 on a yearly rule", () => {
    expect(nextRecurringDate("2028-02-29", "yearly")).toBe("2029-02-28");
  });

  it("picks the next matching weekday for custom", () => {
    // 2026-03-10 is a Tuesday; the next Monday is the 16th.
    expect(nextRecurringDate("2026-03-10", "custom", 1, [1])).toBe("2026-03-16");
  });

  it("never returns the starting day for custom", () => {
    expect(nextRecurringDate("2026-03-10", "custom", 1, [2])).toBe("2026-03-17");
  });

  it("returns the input when custom has no days", () => {
    expect(nextRecurringDate("2026-03-10", "custom", 1, [])).toBe("2026-03-10");
  });
});

describe("occurrencesBetween", () => {
  it("lists every occurrence in a window", () => {
    const dates = occurrencesBetween("2026-03-01", "monthly", 1, {
      from: "2026-03-01",
      until: "2026-06-30",
      limit: 10,
    });
    expect(dates).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
  });

  it("respects the limit", () => {
    expect(
      occurrencesBetween("2026-01-01", "daily", 1, { from: "2026-01-01", limit: 3 })
    ).toHaveLength(3);
  });
});

describe("billDueDate", () => {
  it("uses the due day when the month is long enough", () => {
    expect(billDueDate("2026-03", 15)).toBe("2026-03-15");
  });

  it("clamps to the last day of a short month", () => {
    expect(billDueDate("2026-02", 31)).toBe("2026-02-28");
    expect(billDueDate("2024-02", 31)).toBe("2024-02-29");
    expect(billDueDate("2026-04", 31)).toBe("2026-04-30");
  });
});

describe("billState", () => {
  const today = new Date(2026, 2, 10); // 10 March 2026
  const bill = (over = {}) => ({
    id: "b1",
    name: "Rent",
    amount: 12_000,
    due_day: 5,
    status: "unpaid",
    is_active: true,
    last_paid_on: null,
    remind_days_before: 3,
    ...over,
  });

  it("is overdue once the due day has passed", () => {
    const result = billState(bill(), "2026-03", today);
    expect(result.state).toBe("overdue");
    expect(result.daysUntil).toBe(-5);
  });

  it("is due_soon inside the reminder window", () => {
    const result = billState(bill({ due_day: 12 }), "2026-03", today);
    expect(result.state).toBe("due_soon");
  });

  it("is upcoming outside the reminder window", () => {
    expect(billState(bill({ due_day: 25 }), "2026-03", today).state).toBe("upcoming");
  });

  it("is paid when settled this month", () => {
    const result = billState(
      bill({ status: "paid", last_paid_on: "2026-03-04" }),
      "2026-03",
      today
    );
    expect(result.state).toBe("paid");
  });

  it("is unpaid again when only last month was settled", () => {
    const result = billState(
      bill({ status: "paid", last_paid_on: "2026-02-04" }),
      "2026-03",
      today
    );
    expect(result.state).toBe("overdue");
  });

  it("is inactive when switched off", () => {
    expect(billState(bill({ is_active: false }), "2026-03", today).state).toBe("inactive");
  });

  it("treats a skipped bill as upcoming", () => {
    expect(billState(bill({ status: "skipped", due_day: 1 }), "2026-03", today).state).toBe("upcoming");
  });
});

describe("valueHoldings", () => {
  const holding = (over = {}) => ({
    id: "h1",
    symbol: "RELIANCE",
    name: "Reliance",
    quantity: 10,
    buy_price: 100,
    current_price: 150,
    ...over,
  });

  it("computes invested, current value and profit", () => {
    const [value] = valueHoldings([holding()]);
    expect(value.invested).toBe(1000);
    expect(value.currentValue).toBe(1500);
    expect(value.pnl).toBe(500);
    expect(value.pnlPercent).toBe(50);
  });

  it("leaves value and P/L null without a current price", () => {
    // Defaulting to the buy price would report a flat portfolio as valued.
    const [value] = valueHoldings([holding({ current_price: null })]);
    expect(value.invested).toBe(1000);
    expect(value.currentValue).toBeNull();
    expect(value.pnl).toBeNull();
  });

  it("reports a loss", () => {
    const [value] = valueHoldings([holding({ current_price: 80 })]);
    expect(value.pnl).toBe(-200);
    expect(value.pnlPercent).toBe(-20);
  });

  it("handles a fractional quantity", () => {
    const [value] = valueHoldings([holding({ quantity: 0.5, buy_price: 100, current_price: 110 })]);
    expect(value.currentValue).toBeCloseTo(55);
  });
});

describe("summarisePortfolio", () => {
  it("totals across holdings", () => {
    const summary = summarisePortfolio([
      { id: "a", symbol: "A", name: null, quantity: 10, buy_price: 100, current_price: 150 },
      { id: "b", symbol: "B", name: null, quantity: 5, buy_price: 200, current_price: 100 },
    ]);
    expect(summary.invested).toBe(2000);
    expect(summary.currentValue).toBe(2000);
    expect(summary.pnl).toBe(0);
  });

  it("measures P/L against the full cost basis even with unpriced holdings", () => {
    const summary = summarisePortfolio([
      { id: "a", symbol: "A", name: null, quantity: 10, buy_price: 100, current_price: 150 },
      { id: "b", symbol: "B", name: null, quantity: 10, buy_price: 100, current_price: null },
    ]);
    expect(summary.invested).toBe(2000);
    expect(summary.currentValue).toBe(1500);
    expect(summary.pnl).toBe(-500);
    expect(summary.unpriced).toBe(1);
  });

  it("is null when nothing has a price", () => {
    const summary = summarisePortfolio([
      { id: "a", symbol: "A", name: null, quantity: 1, buy_price: 10, current_price: null },
    ]);
    expect(summary.currentValue).toBeNull();
    expect(summary.pnlPercent).toBeNull();
  });

  it("handles an empty portfolio", () => {
    expect(summarisePortfolio([])).toMatchObject({ invested: 0, currentValue: null, unpriced: 0 });
  });
});

describe("monthlyTrend", () => {
  const today = new Date(2026, 2, 15);

  it("zero-fills months with no activity", () => {
    const points = monthlyTrend([], 3, today);
    expect(points).toHaveLength(3);
    expect(points.map((p) => p.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(points.every((p) => p.income === 0 && p.expense === 0)).toBe(true);
  });

  it("fills months that have activity", () => {
    const points = monthlyTrend(
      [
        entry({ type: "income", amount: 1000, transaction_date: "2026-02-05" }),
        entry({ type: "expense", amount: 400, transaction_date: "2026-02-06" }),
      ],
      3,
      today
    );
    expect(points[1]).toMatchObject({ month: "2026-02", income: 1000, expense: 400, net: 600 });
  });
});

describe("monthOverMonth", () => {
  it("reports a rise", () => {
    expect(monthOverMonth(150, 100)).toEqual({ percent: 50, direction: "up" });
  });

  it("reports a fall", () => {
    expect(monthOverMonth(80, 100).direction).toBe("down");
  });

  it("is null against a zero baseline", () => {
    // A jump from zero has no meaningful percentage.
    expect(monthOverMonth(500, 0).percent).toBeNull();
    expect(monthOverMonth(0, 0)).toEqual({ percent: null, direction: "flat" });
  });

  it("treats a tiny change as flat", () => {
    expect(monthOverMonth(100.01, 100).direction).toBe("flat");
  });
});
// ---------------------------------------------------------------------------
// Year helpers
// ---------------------------------------------------------------------------

describe("year helpers", () => {
  it("takes the year off a month", () => {
    expect(yearKey("2026-03")).toBe("2026");
  });

  it("spans a whole year", () => {
    expect(yearRange("2026")).toEqual({ from: "2026-01", to: "2026-12" });
  });

  it("lists twelve months in order", () => {
    const months = monthsOfYear("2026");
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });

  it("finds the years that hold data, newest first", () => {
    expect(
      yearsWithData([
        entry({ transaction_date: "2025-11-04" }),
        entry({ transaction_date: "2026-02-04" }),
        entry({ transaction_date: "2026-02-19" }),
      ])
    ).toEqual(["2026", "2025"]);
  });

  it("knows how long a month is, leap years included", () => {
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-01")).toBe(31);
  });
});

// ---------------------------------------------------------------------------
// Which month a report opens on
// ---------------------------------------------------------------------------

describe("monthsWithData / resolveReportMonth", () => {
  const history = [
    entry({ transaction_date: "2026-01-15" }),
    entry({ transaction_date: "2026-03-02" }),
    entry({ transaction_date: "2026-03-20" }),
  ];

  it("lists only months that have entries, newest first", () => {
    expect(monthsWithData(history)).toEqual(["2026-03", "2026-01"]);
  });

  it("honours a requested month that has data", () => {
    expect(resolveReportMonth(history, "2026-01")).toBe("2026-01");
  });

  it("falls back to the latest month with data when the request is empty", () => {
    // The whole point: opening the page should land on real numbers, not on a
    // calendar month the user never touched.
    expect(resolveReportMonth(history, "2026-02")).toBe("2026-03");
  });

  it("keeps the current month even with no data, because that is where entries go", () => {
    const today = new Date(2026, 4, 9);
    expect(resolveReportMonth([], "2026-05", today)).toBe("2026-05");
    expect(resolveReportMonth(history, "2026-05", today)).toBe("2026-05");
  });

  it("falls back to the calendar month on an empty ledger", () => {
    expect(resolveReportMonth([], "2020-01", new Date(2026, 4, 9))).toBe("2026-05");
  });
});

// ---------------------------------------------------------------------------
// Balance carry-forward — the rollover rule
// ---------------------------------------------------------------------------

describe("closingBalanceThrough", () => {
  const history = [
    entry({ id: "a", type: "income", amount: 10_000, transaction_date: "2026-01-05" }),
    entry({ id: "b", type: "expense", amount: 4_000, transaction_date: "2026-01-20" }),
    entry({ id: "c", type: "expense", amount: 2_500, transaction_date: "2026-02-03" }),
    entry({ id: "d", type: "income", amount: 1_000, transaction_date: "2026-03-01" }),
  ];

  it("sums everything strictly before the month", () => {
    expect(closingBalanceThrough(history, "2026-01")).toBe(0);
    expect(closingBalanceThrough(history, "2026-02")).toBe(6_000);
    expect(closingBalanceThrough(history, "2026-03")).toBe(3_500);
    expect(closingBalanceThrough(history, "2026-04")).toBe(4_500);
  });

  it("adds the opening base on top", () => {
    expect(closingBalanceThrough(history, "2026-02", 500)).toBe(6_500);
  });

  it("stops at the first entry in or after the month", () => {
    // A sorted array is what makes the early break safe; an unsorted one would
    // silently drop everything after the out-of-order row.
    expect(closingBalanceThrough(history, "2026-03")).toBe(3_500);
  });

  it("goes negative when more goes out than comes in", () => {
    expect(
      closingBalanceThrough(
        [entry({ type: "expense", amount: 1_200, transaction_date: "2026-01-04" })],
        "2026-02"
      )
    ).toBe(-1_200);
  });
});

// ---------------------------------------------------------------------------
// Month statement
// ---------------------------------------------------------------------------

describe("buildMonthStatement", () => {
  const entries = [
    entry({ id: "a", type: "income", amount: 50_000, transaction_date: "2026-01-01" }),
    entry({ id: "b", type: "expense", amount: 20_000, transaction_date: "2026-01-05" }),
    entry({ id: "c", type: "expense", amount: 5_000, transaction_date: "2026-02-02" }),
    entry({ id: "d", type: "expense", amount: 900, transaction_date: "2026-02-02" }),
    entry({ id: "e", type: "expense", amount: 4_100, transaction_date: "2026-03-15" }),
  ];

  it("carries the balance in and out", () => {
    const february = buildMonthStatement(entries, "2026-02");
    expect(february.openingBalance).toBe(30_000);
    expect(february.income).toBe(0);
    expect(february.expense).toBe(5_900);
    expect(february.net).toBe(-5_900);
    expect(february.closingBalance).toBe(24_100);
  });

  it("opens the very first month at zero", () => {
    expect(buildMonthStatement(entries, "2026-01").openingBalance).toBe(0);
  });

  it("includes the opening base", () => {
    expect(buildMonthStatement(entries, "2026-03", 1_000).openingBalance).toBe(1_000 + 24_100);
  });

  it("counts distinct days, not entries", () => {
    // Two expenses on the 2nd is one active day.
    expect(buildMonthStatement(entries, "2026-02").activeDays).toBe(1);
  });

  it("averages over every day of the month, spent or not", () => {
    expect(buildMonthStatement(entries, "2026-02").dailyAverage).toBeCloseTo(5_900 / 28, 6);
  });

  it("finds the biggest entry each way", () => {
    const january = buildMonthStatement(entries, "2026-01");
    expect(january.biggestIncome?.amount).toBe(50_000);
    expect(january.biggestExpense?.amount).toBe(20_000);
  });

  it("handles a month with nothing in it", () => {
    // Everything before September: 50,000 − 20,000 − 5,000 − 900 − 4,100.
    const empty = buildMonthStatement(entries, "2026-09");
    expect(empty).toMatchObject({
      openingBalance: 20_000,
      income: 0,
      expense: 0,
      net: 0,
      closingBalance: 20_000,
      transactionCount: 0,
      activeDays: 0,
    });
    expect(empty.biggestExpense).toBeNull();
  });

  it("does not project a month that has not started", () => {
    const future = buildMonthStatement(entries, "2026-09", 0, new Date(2026, 2, 15));
    expect(future.projectedExpense).toBe(0);
  });

  it("projects forward only while the month is running", () => {
    // 15 March, 10 days in: the run rate says the month ends at 4,100 ÷ 10 × 31.
    const march = buildMonthStatement(entries, "2026-03", 0, new Date(2026, 2, 15));
    expect(march.projectedExpense).toBeCloseTo((4_100 / 15) * 31, 6);
  });

  it("reports a finished month as its actual figure, not a projection", () => {
    const march = buildMonthStatement(entries, "2026-03", 0, new Date(2026, 5, 1));
    expect(march.projectedExpense).toBe(4_100);
  });
});

// ---------------------------------------------------------------------------
// Year summary
// ---------------------------------------------------------------------------

describe("buildYearSummary", () => {
  const entries = [
    entry({ id: "a", type: "income", amount: 40_000, transaction_date: "2026-01-05" }),
    entry({ id: "b", type: "expense", amount: 10_000, transaction_date: "2026-01-20" }),
    entry({ id: "c", type: "expense", amount: 25_000, transaction_date: "2026-02-02" }),
    entry({ id: "d", type: "expense", amount: 1_000, transaction_date: "2026-04-11" }),
    entry({ id: "e", type: "income", amount: 99_000, transaction_date: "2025-12-31" }),
  ];

  const year = buildYearSummary(entries, "2026");

  it("totals only the requested year", () => {
    expect(year.income).toBe(40_000);
    expect(year.expense).toBe(36_000);
    expect(year.net).toBe(4_000);
    expect(year.transactionCount).toBe(4);
  });

  it("always returns twelve months", () => {
    expect(year.months).toHaveLength(12);
  });

  it("marks empty months as having no data", () => {
    expect(year.months[2]).toMatchObject({ month: "2026-03", hasData: false, expense: 0 });
    expect(year.months[1]).toMatchObject({ month: "2026-02", hasData: true, expense: 25_000 });
  });

  it("averages over the months with data, not over all twelve", () => {
    // Dividing 36,000 by twelve would report a normal month as 3,000.
    expect(year.activeMonths).toBe(3);
    expect(year.averageMonthlyExpense).toBe(12_000);
  });

  it("carries the balance in from before January", () => {
    expect(year.openingBalance).toBe(99_000);
    expect(year.closingBalance).toBe(103_000);
  });

  it("names the heaviest and quietest months that actually happened", () => {
    // February 25,000; April 1,000; January 10,000.
    expect(year.worstMonth?.month).toBe("2026-02");
    expect(year.bestMonth?.month).toBe("2026-04");
  });

  it("does not name a best month when only one month happened", () => {
    // With a single active month there is nothing to be lighter than.
    const single = buildYearSummary(
      [entry({ type: "expense", amount: 500, transaction_date: "2026-05-05" })],
      "2026"
    );
    expect(single.worstMonth?.month).toBe("2026-05");
    expect(single.bestMonth).toBeNull();
  });

  it("reports a year with nothing in it", () => {
    const blank = buildYearSummary(entries, "2024");
    expect(blank).toMatchObject({
      income: 0,
      expense: 0,
      net: 0,
      transactionCount: 0,
      activeMonths: 0,
      averageMonthlyExpense: 0,
    });
    expect(blank.bestMonth).toBeNull();
  });

  it("leaves the savings rate null without income", () => {
    expect(buildYearSummary([entry({ type: "expense", transaction_date: "2026-05-05" })], "2026").savingsRate).toBeNull();
  });
});

describe("totalsOf", () => {
  it("separates income from expense", () => {
    expect(
      totalsOf([
        entry({ type: "income", amount: 500 }),
        entry({ type: "expense", amount: 200 }),
        entry({ type: "expense", amount: 300 }),
      ])
    ).toMatchObject({ income: 500, expense: 500, net: 0, transactionCount: 3 });
  });

  it("averages across entries", () => {
    expect(totalsOf([entry({ amount: 100 }), entry({ amount: 300 })]).averageTransaction).toBe(200);
  });

  it("does not divide by zero", () => {
    expect(totalsOf([]).averageTransaction).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-category reports
// ---------------------------------------------------------------------------

describe("buildCategoryReport", () => {
  const entries = [
    filed("rent", { id: "a", type: "expense", amount: 12_000, transaction_date: "2026-01-03" }),
    filed("rent", { id: "b", type: "expense", amount: 12_000, transaction_date: "2026-02-03" }),
    filed("rent", { id: "c", type: "expense", amount: 12_500, transaction_date: "2026-02-03" }),
    filed("kirana", { id: "d", type: "expense", amount: 4_000, transaction_date: "2026-02-10" }),
    filed("rent", { id: "e", type: "income", amount: 50_000, transaction_date: "2026-02-01" }),
  ];

  const report = buildCategoryReport(entries, { categoryId: "rent", month: "2026-02", shareBase: 28_500 });

  it("only counts its own category", () => {
    expect(report.current.expense).toBe(24_500);
    expect(report.current.income).toBe(50_000);
  });

  it("compares gross movement against the month before", () => {
    // February moved 50,000 in and 24,500 out = 74,500; January moved 12,000.
    // Comparing net instead would read a month that received fifty thousand as
    // "no change".
    expect(report.previous.expense).toBe(12_000);
    expect(report.current.trend.percent).toBeCloseTo(((74_500 - 12_000) / 12_000) * 100, 1);
  });

  it("reports the year and all-time separately", () => {
    expect(report.yearly.expense).toBe(36_500);
    expect(report.lifetime.expense).toBe(36_500);
  });

  it("states the share of the book it belongs to", () => {
    // Rent 24,500 of kirana 4,000 + rent 24,500 = 28,500.
    expect(report.current.share).toBeCloseTo((24_500 / 28_500) * 100, 1);
  });

  it("leaves the share null when the book is empty", () => {
    const lonely = buildCategoryReport([], { categoryId: "rent", month: "2026-02", shareBase: 0 });
    expect(lonely.current.share).toBeNull();
  });

  it("buckets the month by day, in date order", () => {
    expect(report.days.map((day) => day.label)).toHaveLength(2);
    // The 1st carries the income; the 3rd carries both expenses.
    expect(report.days[0]).toMatchObject({ income: 50_000, expense: 0, transactionCount: 1 });
    expect(report.days[1]).toMatchObject({ income: 0, expense: 24_500, transactionCount: 2 });
  });

  it("buckets the year into twelve months", () => {
    expect(report.months).toHaveLength(12);
    expect(report.months.find((month) => month.month === "2026-02")?.expense).toBe(24_500);
  });

  it("returns the month's entries newest first", () => {
    // The 3rd before the 1st; the two entries on the 3rd keep their input order.
    expect(report.entries.map((row) => row.id)).toEqual(["b", "c", "e"]);
  });

  it("reports the same for a category the user made themselves", () => {
    // Nothing in the input distinguishes a seeded category from a custom one,
    // which is the point: both get the same report.
    const custom = buildCategoryReport(entries, { categoryId: "kirana", month: "2026-02" });
    expect(custom.current.expense).toBe(4_000);
    expect(custom.yearly.transactionCount).toBe(1);
  });

  it("collapses uncategorised entries into one bucket", () => {
    const loose = buildCategoryReport([entry({ transaction_date: "2026-02-04", amount: 300 })], {
      categoryId: null,
      name: "Uncategorised",
      month: "2026-02",
    });
    expect(loose.current.expense).toBe(300);
  });

  it("follows the year of the selected month", () => {
    const dec = buildCategoryReport(entries, { categoryId: "rent", month: "2025-12" });
    expect(dec.year).toBe("2025");
    expect(dec.current.transactionCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Accounts — the Hisab view
// ---------------------------------------------------------------------------

describe("buildAccountSummary", () => {
  const entries = [
    filed("cash", { id: "a", type: "income", amount: 5_000, transaction_date: "2026-01-10" }),
    filed("cash", { id: "b", type: "expense", amount: 1_200, transaction_date: "2026-01-12" }),
    filed("cash", { id: "c", type: "expense", amount: 800, transaction_date: "2026-02-02" }),
    filed("cash", { id: "d", type: "expense", amount: 500, transaction_date: "2026-02-02" }),
    filed("cash", { id: "e", type: "income", amount: 2_000, transaction_date: "2026-02-05" }),
  ];

  it("carries the balance across months", () => {
    const january = buildAccountSummary(entries, "cash", "2026-01", 1_000);
    expect(january.openingBalance).toBe(1_000);
    expect(january.closingBalance).toBe(4_800);

    // February, read on its own with no opening base, opens on January's own
    // closing balance: 5,000 − 1,200 = 3,800. January's 1,000 base belonged to
    // January and is not double-counted.
    const february = buildAccountSummary(entries, "cash", "2026-02");
    expect(february.openingBalance).toBe(3_800);
    expect(february.closingBalance).toBe(3_800 - 1_300 + 2_000);
  });

  it("opens each month on exactly what the previous one closed with", () => {
    // The property that makes a rollover correct: no gap and no double count.
    // The same opening base is passed every month — that is how it works in the
    // app too, since one account has exactly one opening balance.
    let expected = 10_000;
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04"]) {
      const summary = buildAccountSummary(entries, "cash", month, 10_000);
      expect(summary.openingBalance).toBe(expected);
      expected = summary.closingBalance;
    }
    // 10,000 + 5,000 + 2,000 − 1,200 − 800 − 500.
    expect(expected).toBe(14_500);
  });

  it("only counts its own category", () => {
    const withNoise = [...entries, entry({ id: "z", amount: 99_000, transaction_date: "2026-02-01" })];
    expect(buildAccountSummary(withNoise, "cash", "2026-02").expense).toBe(1_300);
  });

  it("merges several entries on the same day into one row", () => {
    const february = buildAccountSummary(entries, "cash", "2026-02");
    expect(february.days).toHaveLength(2);
    // Opens at 3,800 (5,000 − 1,200 from January), then −800 and −500.
    expect(february.days[0]).toMatchObject({ expense: 1_300, balance: 2_500, count: 2 });
  });

  it("tracks the low and high of the month", () => {
    const february = buildAccountSummary(entries, "cash", "2026-02");
    expect(february.lowest).toBe(2_500);
    expect(february.highest).toBe(4_500);
  });

  it("reports the change against the opening balance", () => {
    const january = buildAccountSummary(entries, "cash", "2026-01", 1_000);
    expect(january.changePercent).toBeCloseTo(380, 6);
  });

  it("leaves the change null when it opened at zero", () => {
    expect(buildAccountSummary(entries, "cash", "2026-01").changePercent).toBeNull();
  });

  it("handles an untouched account", () => {
    const january = buildAccountSummary([], "cash", "2026-01", 750);
    expect(january).toMatchObject({
      openingBalance: 750,
      closingBalance: 750,
      lowest: 750,
      highest: 750,
    });
    expect(january.days).toEqual([]);
  });

  it("goes negative for a credit card", () => {
    const card = buildAccountSummary(
      [filed("card", { id: "a", type: "expense", amount: 4_000, transaction_date: "2026-03-04" })],
      "card",
      "2026-03",
      -2_500
    );
    expect(card.closingBalance).toBe(-6_500);
  });
});

// ---------------------------------------------------------------------------
// Liabilities
// ---------------------------------------------------------------------------

describe("summariseLiability", () => {
  const entries = [
    filed("loan", { id: "a", type: "income", amount: 500_000, transaction_date: "2026-01-05" }),
    filed("loan", { id: "b", type: "expense", amount: 10_000, transaction_date: "2026-02-05" }),
    filed("loan", { id: "c", type: "expense", amount: 10_000, transaction_date: "2026-03-05" }),
  ];

  it("reports what is still owed", () => {
    expect(summariseLiability(entries, "loan")).toMatchObject({
      borrowed: 500_000,
      repaid: 20_000,
      outstanding: 480_000,
      payments: 2,
      averagePayment: 10_000,
    });
  });

  it("remembers the high-water mark", () => {
    expect(summariseLiability(entries, "loan").peakOutstanding).toBe(500_000);
  });

  it("reports a cleared loan as nothing owed, not as a negative", () => {
    const cleared = summariseLiability(
      [
        filed("loan", { id: "a", type: "income", amount: 100, transaction_date: "2026-01-05" }),
        filed("loan", { id: "b", type: "expense", amount: 100, transaction_date: "2026-02-05" }),
      ],
      "loan"
    );
    expect(cleared.outstanding).toBe(0);
    expect(cleared.averagePayment).toBe(100);
  });

  it("leaves the average null when nothing has been paid", () => {
    const fresh = summariseLiability(
      [filed("loan", { id: "a", type: "income", amount: 100, transaction_date: "2026-01-05" })],
      "loan"
    );
    expect(fresh).toMatchObject({ borrowed: 100, repaid: 0, outstanding: 100, averagePayment: null });
  });

  it("only counts its own category", () => {
    const noisy = [...entries, entry({ id: "z", type: "expense", amount: 99_000, transaction_date: "2026-03-05" })];
    expect(summariseLiability(noisy, "loan").repaid).toBe(20_000);
  });
});

// ---------------------------------------------------------------------------
// The category board
// ---------------------------------------------------------------------------

/** A category row with sensible defaults; tests only state what they care about. */
function category(over: Partial<FinanceCategory> & { id: string }): FinanceCategory {
  return {
    user_id: "u1",
    name: over.id,
    type: "expense",
    kind: "expense",
    icon: null,
    is_system: false,
    color: null,
    created_at: "",
    updated_at: "",
    ...over,
  } as FinanceCategory;
}

/** An opening balance row, keyed to a category. */
function account(categoryId: string, opening: number): FinanceAccount {
  return {
    id: `acc-${categoryId}`,
    user_id: "u1",
    category_id: categoryId,
    opening_balance: opening,
    opening_month: "2026-01",
    currency: "INR",
    notes: null,
    created_at: "",
    updated_at: "",
  };
}

describe("buildCategoryBoardRows", () => {
  const categories = [
    category({ id: "rent", name: "Rent", kind: "household" }),
    category({ id: "kirana", name: "Kirana", kind: "household" }),
    category({ id: "salary", name: "Salary", kind: "income", type: "income" }),
    category({ id: "cash", name: "Cash in hand", kind: "cash_bank", type: "account" }),
  ];

  const entries = [
    filed("rent", { id: "a", type: "expense", amount: 12_000, transaction_date: "2025-12-03" }),
    filed("rent", { id: "b", type: "expense", amount: 12_000, transaction_date: "2026-01-03" }),
    filed("rent", { id: "c", type: "expense", amount: 13_000, transaction_date: "2026-02-03" }),
    filed("kirana", { id: "d", type: "expense", amount: 4_000, transaction_date: "2026-01-10" }),
    filed("kirana", { id: "e", type: "expense", amount: 6_000, transaction_date: "2026-02-10" }),
    filed("salary", { id: "f", type: "income", amount: 50_000, transaction_date: "2026-02-01" }),
    filed("cash", { id: "g", type: "expense", amount: 900, transaction_date: "2026-01-20" }),
    filed("cash", { id: "h", type: "expense", amount: 1_100, transaction_date: "2026-02-04" }),
  ];

  const rows = buildCategoryBoardRows(categories, entries, "2026-02");
  const row = (id: string) => rows.find((entry) => entry.id === id)!;

  it("keeps one row per category, including ones with no activity", () => {
    expect(rows).toHaveLength(4);
    expect(row("kirana").name).toBe("Kirana");
  });

  it("cuts the month, the month before and the year in one pass", () => {
    expect(row("rent")).toMatchObject({
      monthValue: 13_000,
      previousValue: 12_000,
      // January 12,000 plus February 13,000; December belongs to last year.
      yearValue: 25_000,
      transactionCount: 1,
    });
  });

  it("counts income as movement too", () => {
    expect(row("salary")).toMatchObject({ monthValue: 50_000, type: "income" });
  });

  it("leaves a balance off anything that is not an account", () => {
    expect(row("rent").balance).toBeNull();
    expect(row("salary").balance).toBeNull();
  });

  it("carries an account's balance through from before the month", () => {
    // 1,000 opening, −900 in January, −1,100 in February = −1,000.
    const withBase = buildCategoryBoardRows(categories, entries, "2026-02", [
      account("cash", 1_000),
    ]);
    expect(withBase.find((entry) => entry.id === "cash")!.balance).toBe(-1_000);
  });

  it("reports no opening balance as zero, not as a missing figure", () => {
    expect(row("cash").balance).toBe(-2_000);
    expect(row("cash").hasOpeningBalance).toBe(false);
  });

  it("flags which categories have an opening balance set", () => {
    const withBase = buildCategoryBoardRows(categories, entries, "2026-02", [
      account("cash", 1_000),
    ]);
    expect(withBase.find((entry) => entry.id === "cash")!.hasOpeningBalance).toBe(true);
    expect(withBase.find((entry) => entry.id === "rent")!.hasOpeningBalance).toBe(false);
  });

  it("stamps the month every row was cut for", () => {
    expect(rows.every((entry) => entry.activeMonth === "2026-02")).toBe(true);
  });

  it("treats a category with no kind as unclassified but still reports it", () => {
    const loose = buildCategoryBoardRows(
      [category({ id: "custom", name: "My own", kind: null })],
      [filed("custom", { type: "expense", amount: 750, transaction_date: "2026-02-06" })],
      "2026-02"
    );
    expect(loose[0]).toMatchObject({ kind: null, monthValue: 750, balance: null });
  });

  it("returns nothing for an empty ledger rather than throwing", () => {
    expect(buildCategoryBoardRows(categories, [], "2026-02")).toHaveLength(4);
    expect(buildCategoryBoardRows([], [], "2026-02")).toEqual([]);
  });
});
