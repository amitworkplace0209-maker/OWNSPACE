import { requireUser } from "@/lib/dal";
import { getFiles } from "@/lib/dal/time-files";
import { PageHeader } from "@/components/shared/page-header";
import { FileManager } from "@/components/files/file-manager";

export const metadata = {
  title: "Files",
};

export default async function FilesPage() {
  await requireUser();
  const files = await getFiles({ limit: 200 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Files" description="Every file you have uploaded across all projects." />
      <FileManager projectId={null} taskId={null} files={files} />
    </div>
  );
}