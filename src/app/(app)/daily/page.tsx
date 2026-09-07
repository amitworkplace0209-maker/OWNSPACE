import { requireUser } from "@/lib/dal";
import { getDailyNotes, getPlanningEntries } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { DailyPlannerWorkspace } from "@/components/daily/daily-planner-workspace";

export const metadata = {
  title: "Daily",
};

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : new Date().toISOString().slice(0, 10);

  const [projects, dailyNotes, planning] = await Promise.all([
    getActiveProjects(),
    getDailyNotes({ from: date, to: date }),
    getPlanningEntries({ from: date, to: date }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Daily" description="Your daily note and plans for the day." />
      <DailyPlannerWorkspace projects={projects} dailyNotes={dailyNotes} planning={planning} defaultDate={date} />
    </div>
  );
}