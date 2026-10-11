import { requireUser } from "@/lib/dal";
import { getFinanceDashboard } from "@/lib/dal/finance";
import { getActiveProjects } from "@/lib/dal/projects";
import { monthKey } from "@/lib/finance-logic";
import { PageHeader } from "@/components/shared/page-header";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";

export const metadata = {
  title: "Finance",
};

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; project?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  // Whitelisted to YYYY-MM so a hand-edited query string cannot ask the DAL
  // for a month range that does not exist.
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? (params.month as string) : monthKey();
  const projectId = params.project || undefined;

  // One dashboard read for the whole month: transactions, budgets, bills,
  // recurring rules and holdings. Splitting these per tab meant the header
  // figures and the tab contents could describe different months.
  const dashboard = await getFinanceDashboard({ month, projectId });
  const projects = await getActiveProjects();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance"
        description="Every rupee in and out — budgets, bills, recurring payments and investments."
      />
      <FinanceWorkspace
        transactions={dashboard.transactions}
        categories={dashboard.categories}
        projects={projects}
        budgets={dashboard.budgets}
        bills={dashboard.bills}
        recurring={dashboard.recurring}
        holdings={dashboard.holdings}
        month={dashboard.month}
        projectId={projectId}
      />
    </div>
  );
}