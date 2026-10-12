import { requireUser } from "@/lib/dal";
import { getFinanceDashboard } from "@/lib/dal/finance";
import { buildCategoryBoardRows, monthKey, resolveReportMonth } from "@/lib/finance-logic";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryPickerView } from "@/components/finance/category-picker";

export const metadata = {
  title: "Choose categories",
};

/**
 * Where the user decides which categories are worth their main page.
 *
 * Everything is still here — nothing is deleted or hidden from reach — but the
 * tiles chosen on this page are the ones the money page leads with. Thirty
 * seeded categories is the right default for somebody starting out and the wrong
 * thing to scroll past forever, so the choice is theirs to make.
 */
export default async function FinanceCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const requested = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : null;

  const dashboard = await getFinanceDashboard({ month: requested ?? monthKey() });
  const month = resolveReportMonth(dashboard.allTime, requested);

  const board = buildCategoryBoardRows(
    dashboard.categories,
    dashboard.allTime,
    month,
    dashboard.accounts
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categories"
        description="Tick the ones you want on your money page. Everything else keeps its own report — you just do not see it listed there."
      />
      <CategoryPickerView
        entries={board}
        month={month}
        totalCategories={dashboard.categories.length}
      />
    </div>
  );
}
