import { requireUser } from "@/lib/dal";
import { getActiveProjects } from "@/lib/dal/projects";
import { getCalendarBundle } from "@/lib/dal/calendar-bundle";
import { PageHeader } from "@/components/shared/page-header";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { shiftDays, toIsoDate } from "@/lib/calendar-logic";

export const metadata = {
  title: "Calendar",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; new?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  // Local, not `toISOString()`: the bundle and the month grid both place items
  // on their local day, so "today" has to be computed the same way or the
  // highlight and the Today stat drift by a day east of UTC.
  const todayIso = toIsoDate(new Date());
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? (params.month as string)
    : todayIso.slice(0, 7);

  // Pad the range by a week on each side so the month grid and the week view
  // can render days that spill over the month boundary.
  const from = `${shiftDays(`${month}-01`, -7)}T00:00:00.000Z`;
  const to = `${shiftDays(`${month}-01`, 45)}T23:59:59.999Z`;

  const [projects, bundle] = await Promise.all([
    getActiveProjects(),
    getCalendarBundle(from, to, todayIso),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Events, task deadlines, reminders and milestones in one place."
      />
      <CalendarWorkspace
        bundle={bundle}
        projects={projects}
        initialMonth={month}
        todayIso={todayIso}
        focusId={params.new}
      />
    </div>
  );
}