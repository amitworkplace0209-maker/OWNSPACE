import { getProject } from "@/lib/dal/projects";
import { getPhasesWithProgress, getMilestones } from "@/lib/dal/phases-milestones";
import { PhasesMilestonesEditor } from "@/components/projects/phases-milestones-editor";

export const metadata = {
  title: "Phases & milestones",
};

export default async function ProjectPhasesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);

  const [phases, milestones] = await Promise.all([
    getPhasesWithProgress(id),
    getMilestones(id),
  ]);

  return (
    <PhasesMilestonesEditor
      projectId={project.id}
      phases={phases}
      milestones={milestones}
      readOnly={project.status === "archived"}
    />
  );
}