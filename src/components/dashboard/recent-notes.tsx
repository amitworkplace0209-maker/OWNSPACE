import Link from "next/link";
import { StickyNote, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { getRecentNotes } from "@/lib/dal/notes";
import { formatRelativeTime } from "@/lib/format";

/**
 * Recent notes.
 *
 * The `notes` table has no `category` column, so instead of inventing one this
 * card shows the two things that do exist: which project the note belongs to
 * and its tags.
 */
export async function RecentNotes({ limit = 5 }: { limit?: number }) {
  const notes = await getRecentNotes(limit);

  return (
    <SectionShell
      title="Recent notes"
      icon={StickyNote}
      description={
        notes.length > 0
          ? "Continued where you left off"
          : "Capture ideas as they arrive"
      }
      action="All notes"
      actionHref="/notes"
      interactive
    >
      {notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          description="Capture ideas in notes."
          className="py-8"
          action={
            <Button render={<Link href="/notes?new=1" />}>
              <Plus /> New note
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="group block rounded-lg border border-transparent px-2 py-2 transition hover:border-border hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium group-hover:underline">
                    {note.is_pinned ? "📌 " : null}
                    {note.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {formatRelativeTime(note.updated_at)}
                  </span>
                </div>

                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {note.content}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[11px] text-muted-foreground">
                    {note.project_name || "Personal"}
                  </span>
                  {note.tag_names.slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="h-4 rounded-full px-1.5 text-[10px]"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {note.tag_names.length > 3 ? (
                    <span className="text-[10px] text-muted-foreground">
                      +{note.tag_names.length - 3}
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionShell>
  );
}
