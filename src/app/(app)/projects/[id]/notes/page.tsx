import { getProject } from "@/lib/dal/projects";
import { getNoteDashboard, getNoteNodes, getNoteTags } from "@/lib/dal/notes";
import { ProjectSection } from "@/components/projects/project-section";
import { NotesWorkspace } from "@/components/notes/notes-workspace";

export const metadata = {
  title: "Notes",
};

/**
 * Notes for one project.
 *
 * Reuses the main /notes workspace instead of a second read-only card grid:
 * the old version offered no way to create, edit, pin or delete from here, so
 * any change meant leaving the project screen.
 */
export default async function ProjectNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  const [{ notes, stats }, tags, nodes] = await Promise.all([
    getNoteDashboard({ projectId: id }),
    getNoteTags(),
    getNoteNodes(id),
  ]);

  return (
    <ProjectSection title="Notes" description="Notes attached to this project.">
      <NotesWorkspace
        notes={notes}
        stats={stats}
        projects={[project]}
        tags={tags}
        nodes={nodes}
        initialProjectId={id}
        readOnly={project.status === "archived"}
      />
    </ProjectSection>
  );
}