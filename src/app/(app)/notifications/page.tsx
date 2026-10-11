import { requireUser } from "@/lib/dal";
import { getNotificationCenterData } from "@/lib/dal/notifications";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationsWorkspace } from "@/components/notifications/notifications-workspace";

export const metadata = {
  title: "Notifications",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; type?: string }>;
}) {
  await requireUser();
  const params = await searchParams;

  const filter = params.filter === "unread" || params.filter === "read" ? params.filter : "all";
  const type = ["reminder", "task", "project", "system"].includes(params.type ?? "")
    ? (params.type as "reminder" | "task" | "project" | "system")
    : "all";

  const { notifications, unreadCount, totalCount } = await getNotificationCenterData({
    filter,
    type,
    limit: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Everything that needs your attention, in one place."
      />
      <NotificationsWorkspace
        notifications={notifications}
        filter={filter}
        type={type}
        unreadCount={unreadCount}
        totalCount={totalCount}
      />
    </div>
  );
}