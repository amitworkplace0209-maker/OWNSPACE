import Link from "next/link";
import { getActiveProjects } from "@/lib/dal/projects";
import { Progress } from "@/components/ui/progress";
import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";

export async function ProjectsProgress() {
  const projects = await getActiveProjects();

  return (
    <ul className="flex flex-col gap-1">
      {projects.map((project) => (
        <li key={project.id}>
          <Link
            href={`/projects/${project.id}`}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-accent/40"
          >
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color ?? "var(--primary)" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium group-hover:underline">
                  {project.name}
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums text-muted-foreground",
                    project.progress >= 100 && "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {project.progress}%
                </span>
              </div>
              <Progress value={project.progress ?? 0} className="mt-1.5 h-1.5" />
            </div>
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/60 transition group-hover:text-primary" />
          </Link>
        </li>
      ))}
    </ul>
  );
}