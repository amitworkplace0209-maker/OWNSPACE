import { requireUser } from "@/lib/dal";
import { getCalendarEvents } from "@/lib/dal/calendar";
import { getActiveProjects } from "@/lib/dal/projects";
import { PageHeader } from "@/components/shared/page-header";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";

export const metadata = {
  title: "Calendar",
};

function parseMonth(raw: string | undefined): { year: number; month: number } {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) {
    const [y, m] = raw.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const params = await searchParams;
  const { year, month } = parseMonth(params.month);
  const from = new Date(year, month, 1).toISOString();
  const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  const [projects, events] = await Promise.all([
    getActiveProjects(),
    getCalendarEvents(from, to),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Calendar" description="Your events, meetings and personal time." />
      <CalendarWorkspace events={events} projects={projects} initialMonth={`${year}-${String(month + 1).padStart(2, "0")}`} />
    </div>
  );
}