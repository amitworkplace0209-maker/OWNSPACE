import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { AppearanceManager } from "@/components/providers/appearance-manager";
import { requireUser, getProfile, getPreferences } from "@/lib/dal";
import { getNotificationCenterData } from "@/lib/dal/notifications";
import {
  DEFAULT_ACCENT,
  DEFAULT_BACKGROUND,
  DEFAULT_CARD_STYLE,
  DEFAULT_DENSITY,
  DEFAULT_THEME,
} from "@/config/appearance";
import type { AppUser } from "@/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  const prefs = await getPreferences(user.id);
  const notificationData = await getNotificationCenterData({ limit: 5 });

  const sessionUser: AppUser = {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
  };

  const appearance = {
    theme: prefs?.theme ?? DEFAULT_THEME,
    accent: prefs?.accent_color ?? DEFAULT_ACCENT,
    cardStyle: prefs?.card_style ?? DEFAULT_CARD_STYLE,
    density: prefs?.density ?? DEFAULT_DENSITY,
    background: prefs?.background_preset ?? DEFAULT_BACKGROUND,
  };

  return (
    <SidebarProvider>
      <AppearanceManager appearance={appearance} updatedAt={prefs?.updated_at} />
      <AppSidebar
        user={sessionUser}
        unreadCount={notificationData.unreadCount}
      />
      <SidebarInset className="pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0">
        <Topbar
          user={sessionUser}
          unreadCount={notificationData.unreadCount}
          notifications={notificationData.notifications}
        />
        {/* A div, not a <main>: SidebarInset already renders the page's single
            main landmark. Two <main> elements break the landmark outline and
            the skip-link target. */}
        <div className="relative flex-1 px-4 pt-4 pb-6 md:px-6 md:pt-6">
          {/* Decorative accent wash. `aria-hidden`, behind every sibling, and
              painted above the pane background — a negative z-index would put
              it underneath SidebarInset's own background and hide it. */}
          <div
            aria-hidden="true"
            className="app-aurora pointer-events-none absolute inset-x-0 top-0 z-0 h-[26rem] overflow-hidden"
          />
          <div className="relative z-10">{children}</div>
        </div>
      </SidebarInset>
      <MobileBottomNav />
      <CommandPalette />
    </SidebarProvider>
  );
}