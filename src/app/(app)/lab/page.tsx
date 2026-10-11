import { requireUser } from "@/lib/dal";
import { getWorkspaceStats } from "@/lib/dal/stats";
import { getStorageStats } from "@/lib/dal/storage";
import { getFinanceOverview } from "@/lib/dal/finance";
import { getGDriveStatus } from "@/lib/dal/gdrive";
import { PageHeader } from "@/components/shared/page-header";
import { LabWorkspace } from "@/components/lab/lab-workspace";

export const metadata = {
  title: "Lab",
};

export default async function LabPage() {
  await requireUser();

  const [stats, storageStats, financeOverview, gdrive] = await Promise.all([
    getWorkspaceStats(),
    getStorageStats(),
    getFinanceOverview(),
    getGDriveStatus(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lab"
        description="Small utilities powered by your real workspace data."
      />
      <LabWorkspace
        stats={stats}
        storageStats={storageStats}
        financeOverview={financeOverview}
        gdrive={gdrive}
      />
    </div>
  );
}