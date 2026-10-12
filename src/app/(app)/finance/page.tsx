import { requireUser } from "@/lib/dal";
import { getFinanceDashboard } from "@/lib/dal/finance";
import { getActiveProjects } from "@/lib/dal/projects";
import { buildCategoryBoardRows, monthKey, resolveReportMonth } from "@/lib/finance-logic";
import { PageHeader } from "@/components/shared/page-header";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";
import { MonthReportView } from "@/components/finance/month-report";

export const metadata = {
  title: "Finance",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; project?: string; view?: string; category?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  // Whitelisted to YYYY-MM so a hand-edited query string cannot ask the DAL
  // for a month range that does not exist.
  const requested = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : null;
  const projectId = params.project || undefined;

  // One dashboard read for the whole page: the month, the full history behind
  // the carry-forward balance, budgets, bills, recurring rules, holdings and
  // categories. Splitting these per tab meant the header figures and the tab
  // contents could describe different months.
  const dashboard = await getFinanceDashboard({ month: requested ?? monthKey(), projectId });

  // The report opens on a month that has data rather than on the calendar, so a
  // user who has not opened the app for a while lands on real numbers. Falls
  // back to the current month when the ledger is empty, which is also the month
  // new entries would post into.
  const month = resolveReportMonth(dashboard.allTime, requested);

  // Every category, for the picker and for the report pages.
  const allBoard = buildCategoryBoardRows(
    dashboard.categories,
    dashboard.allTime,
    month,
    dashboard.accounts
  );

  // Only the ones the user chose to keep on the money page. Filtering here
  // rather than in the browser means the tiles that arrive are already the right
  // ones, so there is nothing to hide after paint.
  const board = allBoard.filter((entry) => entry.isPinned);

  // Every account's opening balance sums to the money in hand before any
  // transaction — the base the whole ledger's balance is carried from.
  const openingBalance = dashboard.accounts.reduce((sum, account) => sum + account.opening_balance, 0);

  const view = params.view === "workspace" ? "workspace" : "report";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance"
        description="Monthly and yearly reports for every category — hisab, ghar, nivesh, udhaar and the rest."
      />

      {view === "report" ? (
        <MonthReportView
          month={month}
          requestedMonth={requested}
          entries={dashboard.allTime}
          board={board}
          totalCategories={dashboard.categories.length}
          openingBalance={openingBalance}
          allTimeTruncated={dashboard.allTimeTruncated}
        />
      ) : (
        <FinanceWorkspace
          transactions={dashboard.transactions}
          categories={dashboard.categories}
          projects={await getActiveProjects()}
          budgets={dashboard.budgets}
          bills={dashboard.bills}
          recurring={dashboard.recurring}
          holdings={dashboard.holdings}
          month={dashboard.month}
          projectId={projectId}
          preselectedCategoryId={params.category}
        />
      )}
    </div>
  );
}
