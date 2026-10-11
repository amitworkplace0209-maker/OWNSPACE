import { getProjectHistory } from "@/lib/dal/project-nodes";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { History } from "lucide-react";
import { formatDate } from "@/lib/format";

export const metadata = {
  title: "History",
};

/** Only the keys that actually changed, so the diff stays readable. */
function changedKeys(
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
): string[] {
  if (!oldValue || !newValue) return [];

  const keys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);
  return [...keys].filter((key) => {
    const before = oldValue[key];
    const after = newValue[key];
    if (before === after) return false;
    // Timestamps and progress churn on every save; they are not "changes".
    if (key === "updated_at" || key === "progress") return false;
    return true;
  });
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Change log for a project.
 *
 * `project_history` is append-only and records old and new values per entity,
 * so this renders the real diff rather than a generic "updated" line.
 */
export default async function ProjectHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entries = await getProjectHistory(id, 200);

  return (
    <ProjectSection
      title="History"
      description="What changed, when, and the old and new values."
    >
      {entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="No history yet"
          description="Enable project history in the project settings to record every change."
        />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <ul className="flex flex-col">
              {entries.map((entry) => {
                const keys = changedKeys(entry.old_value, entry.new_value);

                return (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-1 border-b border-border/50 py-2.5 last:border-0"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {entry.entity_type.replace("_", " ")}
                      </span>
                      <span className="text-sm font-medium capitalize">
                        {entry.action.replace("_", " ")}
                      </span>
                      <time
                        dateTime={entry.created_at}
                        className="ml-auto shrink-0 text-xs text-muted-foreground"
                      >
                        {formatDate(entry.created_at)}
                      </time>
                    </div>

                    {entry.summary ? (
                      <p className="text-sm text-muted-foreground">{entry.summary}</p>
                    ) : null}

                    {keys.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-1">
                        {keys.map((key) => (
                          <li
                            key={key}
                            className="flex flex-wrap items-center gap-1.5 text-xs"
                          >
                            <span className="font-medium">
                              {key.replace(/_/g, " ")}
                            </span>
                            <span className="text-muted-foreground line-through">
                              {display(entry.old_value?.[key])}
                            </span>
                            <span aria-hidden="true" className="text-muted-foreground/60">
                              →
                            </span>
                            <span className="text-foreground">
                              {display(entry.new_value?.[key])}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </ProjectSection>
  );
}