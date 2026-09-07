import { requireUser } from "@/lib/dal";
import { getRecentActivity } from "@/lib/dal/calendar";
import { PageHeader } from "@/components/shared/page-header";
import { ActivityList } from "@/components/shared/activity-list";

export const metadata = {
  title: "Activity",
};

export default async function ActivityPage() {
  await requireUser();
  const activities = await getRecentActivity({ limit: 100 });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Activity" description="Everything you have done, across every project." />
      <ActivityList activities={activities} />
    </div>
  );
}