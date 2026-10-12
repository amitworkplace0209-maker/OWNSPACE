import { requireUser } from "@/lib/dal";
import { getActivityCount, getRecentActivity } from "@/lib/dal/calendar";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityList } from "@/components/shared/activity-list";
import { ClearActivityButton } from "@/components/activity/clear-activity-button";

export const metadata = {
  title: "Activity",
};

export default async function ActivityPage() {
  await requireUser();

  // Counted alongside the list rather than from it: the list shows the most
  // recent hundred, and the clear dialog has to state the real number or it
  // invites somebody to delete far more than they were told.
  const [activities, count] = await Promise.all([
    getRecentActivity({ limit: 100 }),
    getActivityCount(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Everything you have done, across every project."
        actions={<ClearActivityButton count={count} />}
      />
      <ActivityList activities={activities} />
    </div>
  );
}
