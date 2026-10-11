import { requireUser } from "@/lib/dal";
import { getNoteDashboard, getNoteNodes, getNoteTags } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

export const metadata = {
  title: "Notes",
};

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; tag?: string; q?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const projectId = params.project ?? "";
  const tag = params.tag ?? "";
  const query = params.q ?? "";

  // The list, its rollup, the tag list and the section list are independent
  // reads, so they go out together rather than in sequence.
  const [{ notes, stats }, projects, tags, nodes] = await Promise.all([
    getNoteDashboard({ projectId }),
    getActiveProjects(),
    getNoteTags(),
    getNoteNodes(projectId && projectId !== "personal" ? projectId : undefined),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notes"
        description="Ideas, scratchpads and references — personal or filed under a project."
      />
      <NotesWorkspace
        notes={notes}
        stats={stats}
        projects={projects}
        tags={tags}
        nodes={nodes}
        initialProjectId={projectId}
        initialTag={tag}
        initialQuery={query}
      />
    </div>
  );
}