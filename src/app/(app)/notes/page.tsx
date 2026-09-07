import { requireUser } from "@/lib/dal";
import { getNotes } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

export const metadata = {
  title: "Notes",
};

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const [notes, projects] = await Promise.all([
    getNotes({ projectId: params.project || undefined, limit: 200 }),
    getActiveProjects(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notes" description="Ideas, scratchpads and references, organised by project." />
      <NotesWorkspace notes={notes} projects={projects} />
    </div>
  );
}