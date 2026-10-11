import { getProject } from "@/lib/dal/projects";
import { ProjectSection } from "@/components/projects/project-section";
import { ProjectSettingsForm } from "@/components/projects/project-settings-form";
import { ProjectDangerZone } from "@/components/projects/project-danger-zone";

export const metadata = {
  title: "Settings",
};

/**
 * Everything the wizard collected stays editable here.
 *
 * The child structure, tasks, checklists, reminders, daily notes, finance and
 * resources have their own tabs — this page owns the project row itself.
 */
export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await getProject(id);

  return (
    <ProjectSection
      title="Settings"
      description="Edit the project's own details, appearance and options."
    >
      <ProjectSettingsForm project={project} />
      <ProjectDangerZone
        projectId={project.id}
        projectName={project.name}
        currentStatus={project.status}
      />
    </ProjectSection>
  );
}