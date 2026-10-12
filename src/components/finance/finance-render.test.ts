/**
 * Smoke-renders the finance report components to string with mock data.
 *
 * The unit tests cover the arithmetic; this covers the rendering. A chart fed an
 * empty array, or a category with no colour, is exactly where a money page
 * throws at runtime rather than failing a test.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * These are client components that read the App Router. `renderToStaticMarkup`
 * has no router context, so the hooks are stubbed — the point of the test is
 * what the components *render*, not what the router does.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/finance",
  useSearchParams: () => new URLSearchParams(),
}));

import { MonthReportView } from "@/components/finance/month-report";
import { CategoryPickerView } from "@/components/finance/category-picker";
import { ReportView } from "@/components/finance/report-view";
import { ReportCardGrid } from "@/components/finance/report-card-grid";
import { CategoryBoard } from "@/components/finance/category-board";
import { CategoryReportView } from "@/components/finance/category-report";
import { buildCategoryBoardRows, buildYearSummary } from "@/lib/finance-logic";
import type { FinanceCategory } from "@/types";

function cat(over: Partial<FinanceCategory> & { id: string }): FinanceCategory {
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

const CATEGORIES = [
  cat({ id: "cash", name: "Cash in hand", kind: "cash_bank", type: "account" }),
  cat({ id: "rent", name: "Rent", kind: "household" }),
  cat({ id: "salary", name: "Salary", kind: "income", type: "income" }),
  cat({ id: "loan", name: "Home loan", kind: "liability" }),
  cat({ id: "mf", name: "Mutual funds", kind: "investment" }),
  cat({ id: "custom", name: "My own thing", kind: null, color: null }),
];

const ENTRIES = [
  { id: "a", type: "expense", amount: 12000, transaction_date: "2026-01-03", category_id: "rent", category: { id: "rent", name: "Rent", color: "#ef4444" } },
  { id: "b", type: "expense", amount: 13000, transaction_date: "2026-02-03", category_id: "rent", category: { id: "rent", name: "Rent", color: "#ef4444" } },
  { id: "c", type: "income", amount: 50000, transaction_date: "2026-02-01", category_id: "salary", category: { id: "salary", name: "Salary", color: null } },
  { id: "d", type: "expense", amount: 900, transaction_date: "2026-01-20", category_id: "cash", category: { id: "cash", name: "Cash in hand", color: null } },
  { id: "e", type: "expense", amount: 1100, transaction_date: "2026-02-04", category_id: "cash", category: { id: "cash", name: "Cash in hand", color: null } },
  { id: "f", type: "income", amount: 500000, transaction_date: "2026-01-10", category_id: "loan", category: { id: "loan", name: "Home loan", color: null } },
  { id: "g", type: "expense", amount: 10000, transaction_date: "2026-02-10", category_id: "loan", category: { id: "loan", name: "Home loan", color: null } },
  { id: "h", type: "expense", amount: 5000, transaction_date: "2026-02-11", category_id: "mf", category: { id: "mf", name: "Mutual funds", color: null } },
  // Deliberately uncategorised: the one bucket that must still render.
  { id: "i", type: "expense", amount: 300, transaction_date: "2026-02-14", category_id: null, category: null },
] as never[];

describe("finance reports render", () => {
  it("renders the month report with data", () => {
    const board = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02");
    const html = renderToStaticMarkup(
      createElement(MonthReportView, {
        month: "2026-02",
        requestedMonth: null,
        entries: ENTRIES as never,
        board,
        totalCategories: CATEGORIES.length,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    expect(html).toContain("Hisab");
    expect(html).toContain("February 2026");
    // The board tiles and the statement are the same read, so rent shows in both.
    expect(html).toContain("Rent");
    expect(html).toContain("Cash in hand");
  });

  it("keeps the chart cards off the money page", () => {
    // The whole reason the charts moved: a page of empty charts above the
    // balance reads as broken on a ledger that has just been started.
    const board = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02");
    const html = renderToStaticMarkup(
      createElement(MonthReportView, {
        month: "2026-02",
        requestedMonth: null,
        entries: ENTRIES as never,
        board,
        totalCategories: CATEGORIES.length,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    expect(html).not.toContain("Income vs expenses");
    expect(html).not.toContain("Savings rate");
    expect(html).not.toContain("Day by day");
    expect(html).not.toContain("Where the money went");
    // But the way to reach them is still on the page.
    expect(html).toContain("/finance/report");
  });

  it("shows only the categories the user pinned", () => {
    // The board is filtered on the server, so the component is handed only the
    // pinned ones. Rendering them all here would hide the bug that filtering
    // happens anywhere else.
    const all = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02");
    const pinned = all.filter((entry) => entry.isPinned);

    const html = renderToStaticMarkup(
      createElement(MonthReportView, {
        month: "2026-02",
        requestedMonth: null,
        entries: ENTRIES as never,
        board: pinned,
        totalCategories: CATEGORIES.length,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    expect(html).toContain("Rent");
  });

  it("points at the picker when every category has been unpinned", () => {
    const html = renderToStaticMarkup(
      createElement(MonthReportView, {
        month: "2026-02",
        requestedMonth: null,
        entries: ENTRIES as never,
        board: [],
        totalCategories: CATEGORIES.length,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    // An empty page needs to say why, and where to go — otherwise it looks like
    // the categories were lost.
    expect(html).toContain("/finance/categories");
    expect(html).toContain("Choose categories");
  });

  it("renders the category picker with every category listed", () => {
    const board = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02");
    const html = renderToStaticMarkup(
      createElement(CategoryPickerView, {
        entries: board,
        month: "2026-02",
        totalCategories: CATEGORIES.length,
      })
    );
    // All of them, not just the pinned ones — this is where the choice happens.
    for (const category of CATEGORIES) {
      expect(html).toContain(category.name);
    }
    expect(html).toContain("of 6 on your page");
  });

  it("renders the picker when nothing is pinned", () => {
    const board = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02").map(
      (entry) => ({ ...entry, isPinned: false })
    );
    const html = renderToStaticMarkup(
      createElement(CategoryPickerView, {
        entries: board,
        month: "2026-02",
        totalCategories: CATEGORIES.length,
      })
    );
    expect(html).toContain("Nothing is on your money page");
  });

  it("renders the charts page with only the cards that were picked", () => {
    const html = renderToStaticMarkup(
      createElement(ReportView, {
        month: "2026-02",
        entries: ENTRIES as never,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    // The default selection is the trend chart and the spending split.
    expect(html).toContain("Income vs expenses");
    expect(html).toContain("Where the money went");
    expect(html).not.toContain("The year 2026 in one table");
    // The card picker is always there, so nothing is unreachable.
    expect(html).toContain("Cards");
    // And no stray category list at the foot of the page.
    expect(html).not.toContain("Biggest this month");
  });

  it("renders only the cards that were enabled, and none at all when empty", () => {
    const year = buildYearSummary(ENTRIES as never, "2026");

    const one = renderToStaticMarkup(
      createElement(ReportCardGrid, {
        enabled: ["savings"],
        month: "2026-02",
        entries: ENTRIES as never,
        year,
        openingBalance: 0,
      })
    );
    expect(one).toContain("Savings rate");
    expect(one).not.toContain("Income vs expenses");
    expect(one).not.toContain("Where the money went");

    const none = renderToStaticMarkup(
      createElement(ReportCardGrid, {
        enabled: [],
        month: "2026-02",
        entries: ENTRIES as never,
        year,
        openingBalance: 0,
      })
    );
    // An all-off page has to say why it is empty rather than just being blank.
    expect(none).toContain("No cards turned on");
  });

  it("renders every card on an empty ledger without crashing", () => {
    const year = buildYearSummary([], "2026");
    for (const id of [
      "trend",
      "savings",
      "daily",
      "income",
      "spending",
      "year",
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(ReportCardGrid, {
          enabled: [id],
          month: "2026-02",
          entries: [],
          year,
          openingBalance: 0,
        })
      );
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it("renders the month report on an empty ledger without crashing", () => {
    const html = renderToStaticMarkup(
      createElement(MonthReportView, {
        month: "2026-02",
        requestedMonth: null,
        entries: [],
        board: [],
        totalCategories: 0,
        openingBalance: 0,
        allTimeTruncated: false,
      })
    );
    // The starter-categories prompt is the only thing worth showing here.
    expect(html).toContain("categories");
  });

  it("renders every category page, whatever its kind", () => {
    const cases = [
      { category: cat({ id: "cash", name: "Cash in hand", kind: "cash_bank", type: "account" }), opening: 5000 },
      { category: cat({ id: "rent", name: "Rent", kind: "household" }), opening: 0 },
      { category: cat({ id: "salary", name: "Salary", kind: "income", type: "income" }), opening: 0 },
      { category: cat({ id: "loan", name: "Home loan", kind: "liability" }), opening: 0 },
      { category: cat({ id: "mf", name: "Mutual funds", kind: "investment" }), opening: 0 },
      { category: cat({ id: "custom", name: "My own thing", kind: null }), opening: 0 },
    ];

    for (const item of cases) {
      const own = ENTRIES.filter(
        (entry: Record<string, unknown>) => entry.category_id === item.category.id
      );
      const html = renderToStaticMarkup(
        createElement(CategoryReportView, {
          category: {
            id: item.category.id,
            name: item.category.name,
            kind: item.category.kind,
            color: item.category.color,
            icon: item.category.icon,
            type: item.category.type,
          },
          entries: own as never,
          month: "2026-02",
          holdings: [],
          openingBalance: item.opening,
          siblings: [],
          bookTotal: 0,
        })
      );
      expect(html).toContain(item.category.name);
    }
  });

  it("renders a category page with no transactions at all", () => {
    const html = renderToStaticMarkup(
      createElement(CategoryReportView, {
        category: { id: "ghost", name: "Brand new", kind: "expense", color: null, icon: null, type: "expense" },
        entries: [],
        month: "2026-02",
        holdings: [],
        openingBalance: 0,
        siblings: [],
        bookTotal: 0,
      })
    );
    expect(html).toContain("Brand new");
  });

  it("renders an investment page with holdings, priced and not", () => {
    const html = renderToStaticMarkup(
      createElement(CategoryReportView, {
        category: { id: "mf", name: "Mutual funds", kind: "investment", color: null, icon: null, type: "expense" },
        entries: ENTRIES.filter((e: Record<string, unknown>) => e.category_id === "mf") as never,
        month: "2026-02",
        holdings: [
          { id: "h1", user_id: "u1", symbol: "NIPpon", name: "Nippon Index", quantity: 12, buy_price: 100, current_price: 145, currency: "INR", notes: null, acquired_on: null, category_id: "mf", created_at: "", updated_at: "" },
          { id: "h2", user_id: "u1", symbol: "PPF", name: null, quantity: 1, buy_price: 50000, current_price: null, currency: "INR", notes: null, acquired_on: null, category_id: "mf", created_at: "", updated_at: "" },
        ],
        openingBalance: 0,
        siblings: [],
        bookTotal: 0,
      })
    );
    expect(html).toContain("Nippon Index");
    // A holding with no price has to say so rather than render a flat value.
    expect(html).toContain("No price set");
  });

  it("renders the board with a category that has no colour or icon", () => {
    const board = buildCategoryBoardRows(CATEGORIES, ENTRIES as never, "2026-02");
    const html = renderToStaticMarkup(
      createElement(CategoryBoard, { entries: board, month: "2026-02" })
    );
    expect(html).toContain("My own thing");
  });
});
