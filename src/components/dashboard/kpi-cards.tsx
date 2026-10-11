import {
  CheckCircle2,
  Clock,
  FolderKanban,
  Timer,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { getProjectSummary } from "@/lib/dal/projects";
import { getAnalyticsSnapshot } from "@/lib/dal/analytics";
import {
  dueTodayTone,
  overdueTone,
} from "@/lib/dashboard-logic";
import { formatDurationMinutes } from "@/lib/format";

/**
 * The four headline numbers, each a real figure with a real destination.
 *
 * Every secondary line is derived from data that was already loaded for this
 * render — nothing here is a trend invented for decoration, so cards that have
 * no honest comparison simply omit it. The tone is explicit because the tile
 * colour carries meaning: an overdue count has to look different from a healthy
 * one without reading the number.
 */
export async function KpiCards() {
  const [projectSummary, snapshot] = await Promise.all([
    getProjectSummary(),
    getAnalyticsSnapshot(),
  ]);

  const overdue = snapshot.tasks.overdue;
  const dueToday = snapshot.tasks.today;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Active projects"
        value={String(projectSummary.active)}
        href="/projects"
        icon={FolderKanban}
        tone="info"
        secondary={
          projectSummary.createdThisMonth > 0
            ? `+${projectSummary.createdThisMonth} this month`
            : `${projectSummary.total} total · ${projectSummary.completed} completed`
        }
        action="View projects"
      />

      <StatCard
        title="Tasks due today"
        value={String(dueToday)}
        href="/tasks?due=today"
        icon={CheckCircle2}
        secondary={`${snapshot.tasks.completionRate}% completion rate`}
        status={{
          label: dueToday === 0 ? "All clear" : `${dueToday} to work through`,
          tone: dueTodayTone(dueToday),
        }}
        action="Open today's list"
      />

      <StatCard
        title="Overdue tasks"
        value={String(overdue)}
        href="/tasks?due=overdue"
        icon={Clock}
        secondary={
          overdue > 0
            ? `Oldest is past due · ${snapshot.tasks.completed} tasks completed overall`
            : "Nothing past due"
        }
        status={{
          label: overdue > 0 ? "Needs attention" : "On track",
          tone: overdueTone(overdue),
        }}
        action="Review overdue"
      />

      <StatCard
        title="Time tracked today"
        value={formatDurationMinutes(snapshot.time.todayMinutes)}
        href="/time"
        icon={Timer}
        tone="success"
        secondary={`${formatDurationMinutes(snapshot.time.totalMinutes)} tracked all time`}
        action="Open time log"
      />
    </div>
  );
}