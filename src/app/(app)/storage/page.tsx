import { requireUser } from "@/lib/dal";
import {
  FILES_BUCKET,
  getBucketConfigs,
  getBucketUsage,
  getCategorizedFiles,
  getStorageReport,
  getStorageStats,
  getUntrackedObjects,
  storageCategoryOrder,
} from "@/lib/dal/storage";
import { getDriveAccountUsage, getGDriveStatus } from "@/lib/dal/gdrive";
import { summariseDriveUsage } from "@/lib/storage-logic";
import { PageHeader } from "@/components/shared/page-header";
import { StorageWorkspace } from "@/components/storage/storage-workspace";

export const metadata = {
  title: "Storage",
};

export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; source?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const category =
    params.category && storageCategoryOrder.includes(params.category) ? params.category : null;
  // Whitelisted so a hand-edited query string cannot ask for an arbitrary view.
  const source = params.source === "drive" || params.source === "supabase" ? params.source : "all";

  // The two providers are read independently and never merged: a Drive byte and
  // a Supabase byte are different things, and adding them into one total would
  // imply a shared ceiling that does not exist.
  const [
    stats,
    files,
    bucketUsage,
    bucketConfigs,
    untracked,
    driveStatus,
    driveUsage,
    storageReport,
  ] = await Promise.all([
    getStorageStats(),
    getCategorizedFiles({ limit: 200, category: category ?? undefined }),
    getBucketUsage(FILES_BUCKET),
    getBucketConfigs(),
    getUntrackedObjects(FILES_BUCKET),
    getGDriveStatus(),
    getDriveAccountUsage(),
    getStorageReport(),
  ]);

  const bucketConfig = bucketConfigs.configs.find((entry) => entry.name === FILES_BUCKET) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Storage"
        description="Everything you have stored — Supabase files and every linked Google Drive, side by side."
      />
      <StorageWorkspace
        stats={stats}
        files={files}
        category={category}
        source={source}
        bucket={{
          name: FILES_BUCKET,
          public: bucketUsage.public || bucketConfig?.public || false,
          fileSizeLimitBytes: bucketConfig?.fileSizeLimitBytes ?? null,
          allowedMimeTypes: bucketConfig?.allowedMimeTypes ?? null,
          storedBytes: bucketUsage.storedBytes,
          storedCount: bucketUsage.storedCount,
          largestObjectBytes: bucketUsage.largestObjectBytes,
          unavailable: bucketUsage.unavailable,
        }}
        untracked={{ objects: untracked.objects, bytes: untracked.untrackedBytes, error: untracked.error }}
        bucketConfigError={bucketConfigs.error}
        storageReport={storageReport}
        drive={{
          configured: driveStatus.configured,
          accounts: driveStatus.accounts,
          error: driveStatus.error,
          usage: summariseDriveUsage(driveUsage),
        }}
      />
    </div>
  );
}