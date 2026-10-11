import { getDailyNotes } from "@/lib/dal/notes";
import { ProjectSection } from "@/components/projects/project-section";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { NotebookPen } from "lucide-react";

export const metadata = {
  title: "Daily Notes",
};

const SECTIONS = [
  { key: "todays_work", label: "Today's work" },
  { key: "completed_work", label: "Completed" },
  { key: "problems", label: "Problems" },
  { key: "ideas", label: "Ideas" },
  { key: "next_steps", label: "Next steps" },
] as const;

/** One project, its own daily log. */
export default async function ProjectDailyNotesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notes = await getDailyNotes({ projectId: id, limit: 60 });

  return (
    <ProjectSection
      title="Daily Notes"
      description="This project's own daily log — what was worked on, what got stuck, what comes next."
    >
      {notes.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="No daily notes yet"
          description="Daily notes created in the wizard, or from the daily planner, appear here."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {notes.map((note) => {
            const filled = SECTIONS.filter(
              (section) => (note[section.key] as string | null)?.trim()
            );

            return (
              <Card key={note.id}>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {note.title || note.note_date}
                  </CardTitle>
                  <CardDescription>{note.note_date}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {filled.length === 0 && !note.content ? (
                    <p className="text-sm text-muted-foreground">Nothing recorded.</p>
                  ) : null}
                  {filled.length > 0 ? (
                    <dl className="grid gap-3 sm:grid-cols-2">
                      {filled.map((section) => (
                        <div key={section.key} className="flex flex-col gap-1">
                          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                            {section.label}
                          </dt>
                          <dd className="text-sm whitespace-pre-wrap">
                            {(note[section.key] as string | null) ?? ""}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {note.content ? (
                    <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                      {note.content}
                    </p>
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