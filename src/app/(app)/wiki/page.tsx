import Link from "next/link";
import { requireUser } from "@/lib/dal";
import { getAllWikiPages } from "@/lib/dal/time-files";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { BookOpen, Clock } from "lucide-react";
import { formatRelativeTime } from "@/lib/format";

export const metadata = {
  title: "Wiki",
};

export default async function WikiPage() {
  await requireUser();
  const pages = await getAllWikiPages();

  const byProject = new Map<string, typeof pages>();
  for (const page of pages) {
    const key = page.project?.id ?? "unassigned";
    const list = byProject.get(key) ?? [];
    list.push(page);
    byProject.set(key, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Wiki" description="Every knowledge page, indexed by project." />
      {pages.length === 0 ? (
        <EmptyState icon={BookOpen} title="No wiki pages yet" description="Create wiki pages inside any of your projects." />
      ) : (
        <div className="flex flex-col gap-6">
          {Array.from(byProject.entries()).map(([projectId, projectPages]) => (
            <section key={projectId}>
              <h2 className="mb-3 text-sm font-semibold">
                {projectPages[0].project?.name ?? "Unassigned"}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{projectPages.length} page{projectPages.length === 1 ? "" : "s"}</span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {projectPages.map((page) => (
                  <li key={page.id}>
                    <Link
                      href={projectId === "unassigned" ? "/wiki" : `/projects/${projectId}/wiki`}
                      className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4 transition hover:border-primary/50 hover:bg-accent/40"
                    >
                      <p className="text-sm font-medium">{page.title}</p>
                      {page.content ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{page.content.replace(/[#>*`_\-\[\]()]/g, "").slice(0, 140)}</p>
                      ) : null}
                      <p className="mt-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="size-3" /> Updated {formatRelativeTime(page.updated_at)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}