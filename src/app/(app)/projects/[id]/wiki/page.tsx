import { getProject } from "@/lib/dal/projects";
import { getWikiPages, getWikiVersions } from "@/lib/dal/time-files";
import { ProjectWiki } from "@/components/wiki/project-wiki";

export const metadata = {
  title: "Project wiki",
};

export default async function ProjectWikiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  const pages = await getWikiPages(id);

  const versionsByPage: Record<string, Awaited<ReturnType<typeof getWikiVersions>>> = {};
  await Promise.all(
    pages.map(async (page) => {
      versionsByPage[page.id] = await getWikiVersions(page.id);
    })
  );

  return (
    <ProjectWiki
      projectId={project.id}
      pages={pages}
      readOnly={project.status === "archived"}
      versionsByPage={versionsByPage}
    />
  );
}