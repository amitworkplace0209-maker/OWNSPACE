import { Activity } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { getActivityTrend, type ActivityDay } from "@/lib/dal/analytics";
import { ActivityTrendChart } from "@/components/analytics/activity-trend-chart";
import { formatDurationMinutes } from "@/lib/format";

function totals(trend: ActivityDay[]) {
  return trend.reduce(
    (acc, day) => ({
      tasks: acc.tasks + day.tasksCompleted,
      minutes: acc.minutes + day.minutesTracked,
      pomodoros: acc.pomodoros + day.pomodoros,
      notes: acc.notes + day.notesCreated,
    }),
    { tasks: 0, minutes: 0, pomodoros: 0, notes: 0 }
  );
}

/**
 * Productivity — a 14-day trend plus the real totals behind it.
 *
 * The summary row exists so the chart never carries the only copy of a number;
 * every figure is summed from the same series that is drawn.
 */
export async function ProductivityCard({ days = 14 }: { days?: number }) {
  const trend = await getActivityTrend(days);
  const sum = totals(trend);
  const hasData = sum.tasks + sum.minutes + sum.pomodoros + sum.notes > 0;

  return (
    <SectionShell
      title="Productivity"
      icon={Activity}
      description={hasData ? `Last ${days} days` : "No activity in this range"}
      action="Analytics"
      actionHref="/analytics"
      interactive
    >
      {!hasData ? (
        <EmptyState
          icon={Activity}
          title="No activity in the last 14 days"
          description="Complete tasks, track time, or create notes."
          className="py-8"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-4 gap-2">
            {[
              { label: "Tasks", value: String(sum.tasks) },
              { label: "Focus", value: formatDurationMinutes(sum.minutes) },
              { label: "Pomodoros", value: String(sum.pomodoros) },
              { label: "Notes", value: String(sum.notes) },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border bg-muted/40 px-2 py-2 text-center"
              >
                <dt className="text-[10px] text-muted-foreground">
                  {item.label}
                </dt>
                <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <ActivityTrendChart data={trend} />
        </div>
      )}
    </SectionShell>
  );
}
