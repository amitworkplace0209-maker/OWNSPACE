import { describe, expect, it } from "vitest";
import {
  billDueDate,
  billState,
  buildLedger,
  computeBudgets,
  groupByCategory,
  isSameMonth,
  isoDate,
  monthKey,
  monthLabel,
  monthOverMonth,
  monthRange,
  monthlyTrend,
  nextRecurringDate,
  occurrencesBetween,
  shiftMonth,
  summarizeMonth,
  summarisePortfolio,
  valueHoldings,
  type LedgerEntry,
} from "@/lib/finance-logic";

function entry(over: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "t1",
    type: "expense",
    amount: 100,
    transaction_date: "2026-03-10",
    ...over,
  };
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