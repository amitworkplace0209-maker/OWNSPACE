import { searchAll } from "@/lib/dal/search";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import Link from "next/link";
import { Search as SearchIcon, FolderKanban, CheckSquare, NotebookPen, BookOpen, FileText, Milestone } from "lucide-react";

const sectionMeta: Record<string, { label: string; icon: typeof SearchIcon }> = {
  projects: { label: "Projects", icon: FolderKanban },
  tasks: { label: "Tasks", icon: CheckSquare },
  notes: { label: "Notes", icon: NotebookPen },
  wiki: { label: "Wiki", icon: BookOpen },
  files: { label: "Files", icon: FileText },
  milestones: { label: "Milestones", icon: Milestone },
};

function Section({
  kind,
  items,
}: {
  kind: string;
  items: Array<{ id: string; title: string; subtitle?: string | null; href: string }>;
}) {
  if (items.length === 0) return null;
  const meta = sectionMeta[kind] ?? { label: kind, icon: SearchIcon };
  const Icon = meta.icon;

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-card-foreground">
        <Icon className="size-4 text-muted-foreground" />
        {meta.label}
        <span className="ml-auto text-xs text-muted-foreground/60">{items.length}</span>
      </h2>
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            className="border-b border-border/50 py-2 last:border-0"
          >
            <Link href={item.href} className="group flex flex-col gap-0.5 hover:underline">
              <span className="truncate text-sm font-medium">{item.title}</span>
              {item.subtitle ? (
                <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";

  if (!q) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Search" description="Enter a term above to search across your workspace." />
        <EmptyState icon={SearchIcon} title="Type to search" description="Search projects, tasks, notes, wiki pages, files and milestones." />
      </div>
    );
  }

  const results = await searchAll(q);

  const total =
    results.projects.length +
    results.tasks.length +
    results.notes.length +
    results.wiki.length +
    results.files.length +
    results.milestones.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Search: "${q}"`}
        description={`${total} result${total === 1 ? "" : "s"} across your workspace`}
      />

      {total === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No results found"
          description={`No items match “${q}” in your workspace.`}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(sectionMeta).map((kind) => {
            const sectionKey = kind === "files" ? "files" : kind === "dailyNotes" ? "dailyNotes" : kind;
            const items = (results as Record<string, Array<{ id: string; title: string; subtitle?: string | null; href: string }>>)[sectionKey] ?? [];
            return <Section key={kind} kind={kind} items={items} />;
          })}
          {results.dailyNotes.length > 0 ? (
            <Section kind="dailyNotes" items={results.dailyNotes} />
          ) : null}
        </div>
      )}
    </div>
  );
}