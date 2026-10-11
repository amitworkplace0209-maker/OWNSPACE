import { getProjectChecklists, checklistProgress } from "@/lib/dal/checklists";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { ListChecks } from "lucide-react";

export const metadata = {
  title: "Checklist",
};

/**
 * Checklist section.
 *
 * Progress is completed ÷ total on every checklist, and the header figure is
 * the same rule applied across all of them — the same arithmetic the wizard
 * used, so a project does not change its percentage when you come here.
 */
export default async function ProjectChecklistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const checklists = await getProjectChecklists(id);

  const allItems = checklists.flatMap((checklist) => checklist.items);
  const overall = checklistProgress(allItems);

  return (
    <ProjectSection
      title="Checklist"
      description="Every checklist attached to this project, with live completion."
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Overall</CardTitle>
          <CardDescription>
            {allItems.filter((item) => item.is_completed).length} of {allItems.length}{" "}
            items complete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Progress value={overall} className="h-2" />
            <span className="shrink-0 text-lg font-semibold tabular-nums">{overall}%</span>
          </div>
        </CardContent>
      </Card>

      {checklists.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title="No checklists yet"
          description="Checklists are created from the project wizard and belong to a task or a structure item."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {checklists.map((checklist) => {
            const progress = checklistProgress(checklist.items);

            return (
              <Card key={checklist.id}>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-sm">{checklist.title}</CardTitle>
                    <span className="text-sm font-semibold tabular-nums">{progress}%</span>
                  </div>
                  {checklist.ownerLabel || checklist.description ? (
                    <CardDescription>
                      {checklist.ownerLabel ? `Attached to ${checklist.ownerLabel}` : null}
                      {checklist.ownerLabel && checklist.description ? " · " : null}
                      {checklist.description}
                    </CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Progress value={progress} className="h-1.5" />
                  {checklist.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No items.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {checklist.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-2 border-b border-border/50 py-1.5 text-sm last:border-0"
                        >
                          <span
                            aria-hidden="true"
                            className={
                              item.is_completed
                                ? "size-3.5 shrink-0 rounded-full bg-success"
                                : "size-3.5 shrink-0 rounded-full border"
                            }
                          />
                          <span
                            className={
                              item.is_completed
                                ? "text-muted-foreground line-through"
                                : undefined
                            }
                          >
                            {item.content}
                          </span>
                          {item.due_date ? (
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              due {item.due_date}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </ProjectSection>
  );
}