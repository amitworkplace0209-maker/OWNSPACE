import { requireUser } from "@/lib/dal";
import { getDailyNotes, getPlanningEntries } from "@/lib/dal/notes";
import { getActiveProjects } from "@/lib/dal/projects";
import { getTasksDueInRange } from "@/lib/dal/tasks";
import { PageHeader } from "@/components/shared/page-header";
import { DailyPlannerWorkspace } from "@/components/daily/daily-planner-workspace";
import { localDateIso, weekDates, windowAround } from "@/lib/daily-logic";

export const metadata = {
  title: "Daily",
};

/**
 * Daily planner.
 *
 * Fetches a week either side of the selected day rather than only the visible
 * week. The client owns which day is selected, and the rollover moves that
 * selection forward at midnight — with the slack in the payload, that move is
 * served from data already on the client instead of needing a round trip at the
 * exact moment someone is opening their laptop.
 */
export default async function DailyPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; project?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const date =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : localDateIso();

  const { from, to } = windowAround(date, 7);
  const week = weekDates(date);
  const selectedWeekStart = week[0];
  const selectedWeekEnd = week[6];

  const [projects, dailyNotes, planning, weekTasks] = await Promise.all([
    getActiveProjects(),
    getDailyNotes({ from, to }),
    getPlanningEntries({ from, to }),
    // Only the selected week's due tasks — that is what the "due this week"
    // strip shows, and a fortnight of tasks would be fetched for nothing.
    getTasksDueInRange(selectedWeekStart, selectedWeekEnd),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Daily"
        description="Your journal and your plan for the day. Rolls over on its own at midnight."
      />
      <DailyPlannerWorkspace
        projects={projects}
        dailyNotes={dailyNotes}
        planning={planning}
        weekTasks={weekTasks}
        serverDate={date}
      />
    </div>
  );
}