import { TopbarInner } from "@/components/layout/topbar-inner";
import type { AppUser, AppNotification } from "@/types";

/**
 * Server wrapper for the topbar.
 *
 * It exists only to keep the client boundary tidy: the notification rows are
 * fetched by the app layout, and `TopbarInner` is where the interactivity
 * (search, dropdowns, theme) begins.
 */
export async function Topbar({
  user,
  unreadCount,
  notifications,
}: {
  user: AppUser;
  unreadCount: number;
  notifications: AppNotification[];
}) {
  return (
    <TopbarInner
      user={user}
      unreadCount={unreadCount}
      notifications={notifications}
    />
  );
}