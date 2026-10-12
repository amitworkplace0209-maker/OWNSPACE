import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { OfflineBanner } from "@/components/layout/offline-banner";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { CommandPalette } from "@/components/layout/command-palette";
import { ReminderNotifier } from "@/components/reminders/reminder-notifier";
import { LockedApp } from "@/components/security/locked-app";
import { AppearanceManager } from "@/components/providers/appearance-manager";
import { requireUser, getProfile, getPreferences } from "@/lib/dal";
import { getNotificationCenterData } from "@/lib/dal/notifications";
import { getFireableReminders } from "@/lib/dal/reminders";
import { getAppLockState } from "@/lib/dal/security";
import { lockDurationMs } from "@/lib/security/mpin";
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

  // Both in flight together: three sequential awaits would make every navigation
  // in the app pay for three round trips in series.
  const [notificationData, fireableReminders, security] = await Promise.all([
    getNotificationCenterData({ limit: 5 }),
    getFireableReminders(),
    getAppLockState(),
  ]);

  // The lock state, read once here rather than inside the client gate: the very
  // first paint already knows whether a lock exists, so the app never flashes
  // its contents before the lock screen covers them.
  const lockEnabled = security.is_lock_enabled;
  const biometricEnabled = security.biometric_enabled;
  const setupRequired = security.setup_required;

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
    <LockedApp
      lockEnabled={lockEnabled}
      setupRequired={setupRequired}
      biometricEnabled={biometricEnabled}
      durationMs={lockDurationMs(prefs?.lock_duration)}
    >
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
        {/* Above the content, below the topbar: an offline user should never
            have to be on the dashboard to find out they are offline. */}
        <OfflineBanner />
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
      {/* Mounted here, not on the reminders page, because a reminder that only
          alerts you while you are already looking at reminders is not a
          reminder. Renders nothing; it owns the tick and the toast. */}
      <ReminderNotifier reminders={fireableReminders} userId={user.id} />
    </SidebarProvider>
    </LockedApp>
  );
}