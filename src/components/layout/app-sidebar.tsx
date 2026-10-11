"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Command, FolderKanban, CheckSquare, NotebookPen, CalendarDays, AlarmClock, Plus } from "lucide-react";
import { sidebarNav } from "@/config/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { openCommandPalette } from "@/components/layout/command-palette";
import type { AppUser } from "@/types";

const quickCreateLinks = [
  { label: "New project", href: "/projects?new=1", icon: FolderKanban },
  { label: "New task", href: "/tasks?new=1", icon: CheckSquare },
  { label: "New note", href: "/notes?new=1", icon: NotebookPen },
  { label: "New event", href: "/calendar?new=1", icon: CalendarDays },
  { label: "New reminder", href: "/reminders?new=1", icon: AlarmClock },
];

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname.startsWith(href);
}

export function AppSidebar({
  user,
  unreadCount = 0,
}: {
  user: AppUser;
  unreadCount?: number;
}) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              tooltip="Ownspece"
              className="gap-2.5 px-2 py-2"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_20%)] text-primary-foreground shadow-sm">
                <Command className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="text-base font-semibold tracking-tight">Ownspece</span>
                <span className="hidden text-[10px] font-medium lowercase tracking-wide text-sidebar-foreground/60 lg:block">
                  Personal OS
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-1.5 px-1">
          <Button
            variant="outline"
            size="sm"
            onClick={openCommandPalette}
            className="h-8 flex-1 justify-start gap-2 border-border/70 bg-sidebar-accent/40 px-2 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <Command className="size-3.5" />
            <span className="flex-1 truncate text-left text-xs">Search…</span>
            <kbd className="hidden rounded border bg-background px-1 font-mono text-[10px] text-muted-foreground lg:inline-flex">
              Ctrl K
            </kbd>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Quick add"
                  className="border-border/70 bg-sidebar-accent/40 text-muted-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-foreground"
                >
                  <Plus className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Quick create</DropdownMenuLabel>
                {quickCreateLinks.map((action) => (
                  <DropdownMenuItem key={action.href} render={<Link href={action.href} />}>
                    <action.icon className="size-4" /> {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {sidebarNav.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const showBadge = item.href === "/notifications" && unreadCount > 0;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={item.href} />}
                        isActive={active}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                        {showBadge ? (
                          <SidebarMenuBadge className="rounded-full bg-destructive text-destructive-foreground">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </SidebarMenuBadge>
                        ) : null}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarSeparator />
        <UserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}