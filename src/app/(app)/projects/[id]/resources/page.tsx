import { getProjectResources } from "@/lib/dal/project-nodes";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Paperclip } from "lucide-react";
import { RESOURCE_TYPES, type ResourceType } from "@/types";

export const metadata = {
  title: "Resources",
};

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

/** Links, repositories, documentation and uploaded files for this project. */
export default async function ProjectResourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const resources = await getProjectResources(id);

  const counts = Object.fromEntries(RESOURCE_TYPES.map((type) => [type, 0])) as Record<
    ResourceType,
    number
  >;
  for (const resource of resources) counts[resource.resource_type as ResourceType] += 1;

  return (
    <ProjectSection
      title="Resources"
      description="Everything attached to this project — links, repositories, documentation and files."
    >
      {resources.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {RESOURCE_TYPES.filter((type) => counts[type] > 0).map((type) => (
            <span key={type} className="rounded-full border bg-card px-2.5 py-0.5 text-xs">
              {counts[type]} {TYPE_LABELS[type].toLowerCase()}
            </span>
          ))}
        </div>
      ) : null}

      {resources.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No resources yet"
          description="Add links, repositories, documentation or uploaded files from the wizard or the project menu."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {resources.map((resource) => {
            const isFile = Boolean(resource.storage_path);

            return (
              <Card key={resource.id}>
                <CardHeader>
                  <CardTitle className="text-sm">{resource.name}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  <span className="w-fit rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                    {TYPE_LABELS[resource.resource_type as ResourceType] ??
                      resource.resource_type}
                  </span>
                  {resource.description ? (
                    <p className="text-sm text-muted-foreground">{resource.description}</p>
                  ) : null}
                  {resource.url ? (
                    <a
                      href={resource.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate text-sm text-primary hover:underline"
                    >
                      {resource.url}
                    </a>
                  ) : null}
                  {isFile ? (
                    <p className="truncate text-xs text-muted-foreground">
                      Stored at {resource.storage_path}
                    </p>
                  ) : null}
                  {resource.tags && resource.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {resource.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md bg-muted px-1.5 py-0.5 text-[11px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ProjectSection>
  );
}