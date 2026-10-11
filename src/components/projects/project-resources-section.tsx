import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  FolderTree,
  Link2,
  Paperclip,
  StickyNote,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/shared/section-header";
import { formatRelativeTime } from "@/lib/format";
import { RESOURCE_TYPES, type ProjectResource, type ResourceType } from "@/types";

const TYPE_LABELS: Record<ResourceType, string> = {
  link: "Link",
  file: "File",
  google_drive: "Google Drive",
  supabase_file: "Uploaded file",
  note: "Note",
  document: "Document",
  repository: "Repository",
  api: "API docs",
  video: "Video",
  image: "Image",
  custom: "Other",
};

export { TYPE_LABELS as RESOURCE_TYPE_LABELS };

/**
 * Resources and notes.
 *
 * Resources are the links, repositories and documents attached to the project;
 * notes are the written thinking. They are listed side by side because both are
 * "things to read", and because the two lists were previously two separate
 * pages you had to know to visit.
 */
export function ProjectResourcesSection({
  projectId,
  resources,
  notes,
}: {
  projectId: string;
  resources: ProjectResource[];
  notes: Array<{ id: string; title: string; content: string; updated_at: string }>;
}) {
  const counts = Object.fromEntries(RESOURCE_TYPES.map((type) => [type, 0])) as Record<
    ResourceType,
    number
  >;
  for (const resource of resources) {
    if (resource.resource_type in counts) counts[resource.resource_type as ResourceType] += 1;
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Resources & notes"
        description="Links, repositories, documentation and the notes written for this project."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={`/projects/${projectId}/notes`} />}
            >
              <StickyNote /> All notes
            </Button>
            <Button render={<Link href={`/projects/${projectId}/resources`} />}>
              <Paperclip /> All resources
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" />
                Resources
                <span className="text-xs font-normal text-muted-foreground">
                  {resources.length}
                </span>
              </CardTitle>
              <Link
                href={`/projects/${projectId}/resources`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                All <ArrowUpRight className="size-3" />
              </Link>
            </div>
            {resources.length > 0 ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {RESOURCE_TYPES.filter((type) => counts[type] > 0).map((type) => (
                  <span key={type} className="rounded-full border bg-card px-2 py-0.5 text-[11px]">
                    {counts[type]} {TYPE_LABELS[type].toLowerCase()}
                  </span>
                ))}
              </div>
            ) : null}
          </CardHeader>

          <CardContent>
            {resources.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No resources attached yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {resources.slice(0, 8).map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <StickyNote className="size-4 text-muted-foreground" />
                Notes
                <span className="text-xs font-normal text-muted-foreground">
                  {notes.length}
                </span>
              </CardTitle>
              <Link
                href={`/projects/${projectId}/notes`}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
              >
                All <ArrowUpRight className="size-3" />
              </Link>
            </div>
          </CardHeader>

          <CardContent>
            {notes.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No notes written for this project yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {notes.slice(0, 8).map((note) => (
                  <NoteRow key={note.id} note={note} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ResourceRow({ resource }: { resource: ProjectResource }) {
  const isFile = Boolean(resource.storage_path);

  return (
    <li className="border-b border-border/50 py-2 last:border-0">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          {resource.url ? (
            <Link2 className="size-3.5 text-muted-foreground" />
          ) : (
            <FileText className="size-3.5 text-muted-foreground" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {resource.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer noopener"
              className="truncate text-sm font-medium hover:underline"
            >
              {resource.name}
            </a>
          ) : (
            <span className="truncate text-sm font-medium">{resource.name}</span>
          )}
          {resource.description ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {resource.description}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {TYPE_LABELS[resource.resource_type as ResourceType] ??
                resource.resource_type}
            </span>
            {isFile ? (
              <span className="truncate text-[11px] text-muted-foreground">
                {resource.storage_path}
              </span>
            ) : null}
            {resource.tags && resource.tags.length > 0 ? (
              <span className="truncate text-[11px] text-muted-foreground">
                · {resource.tags.join(", ")}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function NoteRow({
  note,
}: {
  note: { id: string; title: string; content: string; updated_at: string };
}) {
  return (
    <li className="border-b border-border/50 py-2 last:border-0">
      <Link href={`/notes/${note.id}`} className="flex items-start gap-2.5 group/note">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FolderTree className="size-3.5 text-muted-foreground" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium group-hover/note:underline">
            {note.title}
          </span>
          {note.content ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">{note.content}</p>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            Updated {formatRelativeTime(note.updated_at)}
          </span>
        </div>
      </Link>
    </li>
  );
}