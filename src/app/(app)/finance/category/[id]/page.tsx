import { notFound } from "next/navigation";
import { getCategoryReportData, getFinanceDashboard } from "@/lib/dal/finance";
import { buildCategoryBoardRows, monthKey, resolveReportMonth } from "@/lib/finance-logic";
import { CategoryReportView } from "@/components/finance/category-report";

export const metadata = {
  title: "Category report",
};

/**
 * One category's own page.
 *
 * Every category gets a real URL, including the ones the user made themselves —
 * the report is generated from that category's transactions, so a custom
 * category behaves exactly like a seeded one and needs nothing extra to exist.
 */
export default async function FinanceCategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requested = /^\d{4}-\d{2}$/.test(query.month ?? "") ? (query.month as string) : null;

  const data = await getCategoryReportData(id, { month: requested ?? monthKey() });

  // 404 here rather than inside the DAL: this is the one caller where a missing
  // category genuinely is a missing page.
  if (!data.category) notFound();

  const month = resolveReportMonth(data.entries, requested);

  // Siblings come from the whole ledger, so the comparison at the foot of the
  // page is measured against the same month as everything above it. A second
  // scoped read would be the only reason this page needed two queries.
  const dashboard = await getFinanceDashboard({ month });

  const allBoards = buildCategoryBoardRows(
    dashboard.categories,
    dashboard.allTime,
    month,
    dashboard.accounts
  );

  // The book this category belongs to, summed for the month and including the
  // category itself — that is the denominator its share is measured against.
  const bookTotal = allBoards
    .filter((entry) => entry.kind === data.category!.kind)
    .reduce((sum, entry) => sum + entry.monthValue, 0);

  return (
    <CategoryReportView
      category={{
        id: data.category.id,
        name: data.category.name,
        kind: data.category.kind,
        color: data.category.color,
        icon: data.category.icon,
        type: data.category.type,
      }}
      entries={data.entries}
      month={month}
      holdings={data.holdings}
      openingBalance={data.openingBalance}
      siblings={allBoards.filter((entry) => entry.id !== id)}
      bookTotal={bookTotal}
    />
  );
}
