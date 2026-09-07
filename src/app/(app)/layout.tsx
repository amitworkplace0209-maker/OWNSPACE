import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { requireUser, getProfile } from "@/lib/dal";
import type { AppUser } from "@/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const profile = await getProfile(user.id);

  const sessionUser: AppUser = {
    id: user.id,
    email: user.email ?? "",
    displayName: profile?.display_name ?? null,
  };

  return (
    <SidebarProvider>
      <AppSidebar user={sessionUser} />
      <SidebarInset className="pb-14 md:pb-0">
        <Topbar user={sessionUser} />
        <main className="flex-1 px-4 py-4 md:px-6">{children}</main>
      </SidebarInset>
      <MobileBottomNav />
    </SidebarProvider>
  );
}