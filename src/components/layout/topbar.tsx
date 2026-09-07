import { getUnreadNotificationCount, getNotifications } from "@/lib/dal/calendar";
import { TopbarInner } from "@/components/layout/topbar-inner";
import type { AppUser } from "@/types";

export async function Topbar({ user }: { user: AppUser }) {
  const [unreadCount, notifications] = await Promise.all([
    getUnreadNotificationCount(),
    getNotifications({ limit: 8 }),
  ]);

  return (
    <TopbarInner
      user={user}
      unreadCount={unreadCount}
      notifications={notifications}
    />
  );
}