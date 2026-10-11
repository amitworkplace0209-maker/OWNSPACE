import { History } from "lucide-react";
import { SectionShell } from "@/components/dashboard/section-shell";
import { ActivityList } from "@/components/shared/activity-list";
import { getRecentActivity } from "@/lib/dal/calendar";

/**
 * Recent activity — the same grouped timeline the full /activity page uses,
 * so the dashboard never shows a different version of the truth.
 */
export async function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const activity = await getRecentActivity({ limit });

  return (
    <SectionShell
      title="Recent activity"
      icon={History}
      description={
        activity.length > 0
          ? "Your latest changes across Ownspece"
          : "Actions you take will appear here"
      }
      action="All activity"
      actionHref="/activity"
      interactive
    >
      <ActivityList activities={activity} />
    </SectionShell>
  );
}
