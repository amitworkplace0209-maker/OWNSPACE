import { getProject } from "@/lib/dal/projects";
import { ProjectTabs } from "@/components/projects/project-tabs";
import { ProjectIcon } from "@/components/project-creator/icon-picker";
import Link from "next/link";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch the project to 404 early if invalid (and show project name in layout).
  const project = await getProject(id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/projects" className="hover:underline">Projects</Link>
          <span className="text-muted-foreground/50">/</span>
        </div>
        <div className="flex items-center gap-3">
          {project.icon ? (
            <span
              aria-hidden="true"
              className="flex size-9 items-center justify-center rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: project.color ?? "var(--primary)" }}
            >
              <ProjectIcon
                name={project.icon}
                fallbackName={project.name}
                className="size-5"
              />
            </span>
          ) : null}
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
        </div>
      </div>
      <ProjectTabs projectId={project.id} />
      {children}
    </div>
  );
}