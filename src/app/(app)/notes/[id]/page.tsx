import Link from "next/link";
import { getNote, getNoteVersions } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { getTags } from "@/lib/dal/tags";
import { requireUser } from "@/lib/dal";
import { NoteDetailView } from "@/components/notes/note-detail";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Note",
};

export default async function NoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();

  const [note, projects, tags, versions] = await Promise.all([
    getNote(id),
    getActiveProjects(),
    getTags(),
    getNoteVersions(id),
  ]);

  return (
    <div className="flex flex-col gap-4 py-4">
      <Link href={`/notes${note.project_id ? `?project=${note.project_id}` : ""}`} className="flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-3.5" /> Back to notes
      </Link>
      <NoteDetailView note={note} projects={projects} tags={tags} versions={versions} />
    </div>
  );
}