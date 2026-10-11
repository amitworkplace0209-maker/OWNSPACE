import { getProject } from "@/lib/dal/projects";
import { getFinanceDashboard } from "@/lib/dal/finance";
import { monthKey } from "@/lib/finance-logic";
import { ProjectSection } from "@/components/projects/project-section";
import { FinanceWorkspace } from "@/components/finance/finance-workspace";

export const metadata = {
  title: "Finance",
};

/**
 * Finance for one project.
 *
 * Reuses the main /finance workspace rather than a second read-only summary:
 * the old page hard-coded `.toFixed(2)` with no currency symbol at all, and
 * its budget bar divided expense by itself so it always read 100%.
 */
export default async function ProjectFinancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const project = await getProject(id);

  const month = /^\d{4}-\d{2}$/.test(query.month ?? "") ? (query.month as string) : monthKey();
  const dashboard = await getFinanceDashboard({ month, projectId: id });

  return (
    <ProjectSection
      title="Finance"
      description="Income, expenses and budget for this project."
    >
      <FinanceWorkspace
        transactions={dashboard.transactions}
        categories={dashboard.categories}
        projects={[project]}
        budgets={dashboard.budgets}
        bills={dashboard.bills}
        recurring={dashboard.recurring}
        holdings={[]}
        month={dashboard.month}
        projectId={id}
        readOnly={project.status === "archived"}
      />
    </ProjectSection>
  );
}