import { requireUser } from "@/lib/dal";
import { getDailyNotes, getPlanningEntries } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { DailyPlannerWorkspace } from "@/components/daily/daily-planner-workspace";

export const metadata = {
  title: "Daily",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : ymd(new Date());

  const selected = new Date(`${date}T00:00:00`);
  const weekStart = new Date(selected);
  weekStart.setDate(selected.getDate() - selected.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const from = ymd(weekStart);
  const to = ymd(weekEnd);

  const [projects, dailyNotes, planning] = await Promise.all([
    getActiveProjects(),
    getDailyNotes({ from, to }),
    getPlanningEntries({ from, to }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Daily" description="Your daily note and plans for the day." />
      <DailyPlannerWorkspace projects={projects} dailyNotes={dailyNotes} planning={planning} defaultDate={date} />
    </div>
  );
}