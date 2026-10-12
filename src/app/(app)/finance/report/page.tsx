import { requireUser } from "@/lib/dal";
import { getFinanceDashboard } from "@/lib/dal/finance";
import { monthKey, resolveReportMonth } from "@/lib/finance-logic";
import { PageHeader } from "@/components/shared/page-header";
import { ReportView } from "@/components/finance/report-view";

export const metadata = {
  title: "Finance charts",
};

/**
 * The charts page.
 *
 * Split from /finance on purpose: the month page answers "how much do I have",
 * and a stack of empty charts above that answer makes the page look broken on a
 * ledger that has just been started. Here the cards are a menu, so the page is
 * only as long as the user asked it to be.
 *
 * Reached from the money page rather than the sidebar — it is a view of the same
 * numbers, not a section of its own, and a sidebar entry beside Finance would
 * read as a separate feature.
 */
export default async function FinanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const requested = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : null;

  const dashboard = await getFinanceDashboard({ month: requested ?? monthKey() });
  const month = resolveReportMonth(dashboard.allTime, requested);

  const openingBalance = dashboard.accounts.reduce(
    (sum, account) => sum + account.opening_balance,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Charts"
        description="Pick the cards you want. Your choice is remembered."
      />
      <ReportView
        month={month}
        entries={dashboard.allTime}
        openingBalance={openingBalance}
        allTimeTruncated={dashboard.allTimeTruncated}
      />
    </div>
  );
}
