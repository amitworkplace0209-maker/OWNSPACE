import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Clock, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { Project } from "@/types";

interface ProjectCardProps {
  project: Project;
  className?: string;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  const statusColor =
    project.status === "active"
      ? "bg-emerald-500"
      : project.status === "on_hold"
        ? "bg-amber-500"
        : project.status === "completed"
          ? "bg-sky-500"
          : "bg-muted-foreground";

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
        className
      )}
    >
      <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl" style={{ background: `var(--card-color, var(--primary))`, opacity: 0.6 }} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition">
          {project.icon ? (
            <span className="text-lg">{project.icon}</span>
          ) : (
            <span className="text-lg font-bold text-muted-foreground">
              {project.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`size-2 rounded-full ${statusColor}`} />
          <span className="sr-only">{project.status}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
          {project.name}
        </Link>
        {project.description ? (
          <p className="text-sm text-muted-foreground line-clamp-2">{project.description}</p>
        ) : null}
      </div>
      {project.due_date ? (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="size-3" />
          <span>{project.due_date}</span>
        </div>
      ) : null}
      {project.progress > 0 ? (
        <div className="mt-2">
          <div className="progress-bar">
            <div
              className="progress-bar-fill"
              style={{ width: `${project.progress}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{project.progress}%</p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between">
        <Badge variant="outline" className="text-xs capitalize">
          {project.status.replace("_", " ")}
        </Badge>
        <Button variant="ghost" size="icon-sm" className="opacity-0 transition group-hover:opacity-100">
          <MoreHorizontal className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
