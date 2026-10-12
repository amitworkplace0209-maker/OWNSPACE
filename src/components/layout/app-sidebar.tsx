"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  ChevronDown,
  Command,
  FolderKanban,
  CheckSquare,
  NotebookPen,
  CalendarDays,
  AlarmClock,
  Plus,
} from "lucide-react";
import { primaryNav, secondaryNav, type NavItem } from "@/config/navigation";
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
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserMenu } from "@/components/layout/user-menu";
import { cn } from "cn";
import type { AppUser } from "@/types";

const quickCreateLinks = [
  { label: "New project", href: "/projects?new=1", icon: FolderKanban },
  { label: "New task", href: "/tasks?new=1", icon: CheckSquare },
  { label: "New note", href: "/notes?new=1", icon: NotebookPen },
  { label: "New event", href: "/calendar?new=1", icon: CalendarDays },
  { label: "New reminder", href: "/reminders?new=1", icon: AlarmClock },
];

function isActivePath(pathname: string, href: string) {
  // Dashboard is an exact match: "/dashboard/anything" is not the dashboard, and
  // highlighting it as such puts two items lit at once.
  if (href === "/dashboard") return pathname === href;
  return pathname.startsWith(href);
}

/** Where a buried item sits inside "More", so the section can reveal itself. */
function indexInSecondary(href: string): number {
  return secondaryNav.items.findIndex((item) => item.href === href);
}

export function AppSidebar({
  user,
  unreadCount = 0,
}: {
  user: AppUser;
  unreadCount?: number;
}) {
  const pathname = usePathname();

  // Open by default on desktop, closed by default on a phone — which is the
  // whole reason the section exists. Twenty items visible on a 390px screen is
  // what made the sidebar feel like too much; a folded section is not.
  const [toggledOpen, setToggledOpen] = React.useState(false);

  const activeInMore = indexInSecondary(pathname);
  const moreActive = activeInMore >= 0;

  // Derived, not synced: if the current page lives in the folded list the section
  // shows itself, so landing on /analytics from a deep link does not reveal a
  // closed section with the highlighted item invisibly inside it. Deriving beats
  // an effect that would set state on every navigation and re-render the sidebar
  // to say what a `||` could have said for free.
  const moreOpen = toggledOpen || moreActive;

  return (
    <Sidebar collapsible="icon" className="group/sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={<Link href="/dashboard" />}
              tooltip="Ownspece"
              className="gap-2.5 px-2 py-2 transition-colors hover:bg-sidebar-accent"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_20%)] text-primary-foreground shadow-sm transition-transform duration-200 group-hover/sidebar:scale-105">
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

        {/* No search box here. There is one search in this app — the command
            palette, on ⌘K and on the topbar's field — and a second trigger above
            the list was one more thing to reach past on a phone. The palette
            still lists every page, so nothing became unreachable. */}
        <div className="px-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label="Quick add"
                  className={cn(
                    "group/add flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border/60 bg-sidebar-accent/30 text-xs font-medium text-sidebar-foreground/70",
                    "transition-all duration-200 hover:border-primary/40 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    "hover:shadow-sm active:scale-[0.98]"
                  )}
                >
                  <Plus className="size-3.5 transition-transform duration-200 group-hover/add:rotate-90" />
                  <span className="lg:hidden xl:inline">Quick add</span>
                </button>
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
        <SidebarGroup>
          <SidebarGroupLabel>{primaryNav.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.items.map((item) => (
                <NavRow
                  key={item.href}
                  item={item}
                  active={isActivePath(pathname, item.href)}
                  badge={
                    item.href === "/notifications" && unreadCount > 0 ? unreadCount : null
                  }
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="p-0">
            <button
              type="button"
              onClick={() => setToggledOpen((open) => !open)}
              aria-expanded={moreOpen}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-md px-2 py-1",
                "text-xs font-medium uppercase tracking-wide",
                "transition-colors hover:text-sidebar-foreground",
                moreActive && !moreOpen ? "text-primary" : ""
              )}
            >
              <span className="flex-1 text-left">{secondaryNav.label}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  moreOpen ? "rotate-180" : ""
                )}
              />
            </button>
          </SidebarGroupLabel>

          <SidebarGroupContent
            // Kept mounted but hidden so the scroll position inside survives a
            // collapse, and so the highlighted item is not re-mounted (losing
            // its transition) every time the section opens.
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-200",
              moreOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            )}
          >
            <div className="overflow-hidden">
              <SidebarMenu>
                {secondaryNav.items.map((item) => (
                  <NavRow
                    key={item.href}
                    item={item}
                    active={isActivePath(pathname, item.href)}
                  />
                ))}
              </SidebarMenu>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/**
 * One navigation row.
 *
 * The active state is a filled pill that slides in from the left rather than a
 * flat colour change, because a colour shift on a list this dense is easy to
 * miss while moving; a shape that moves is not.
 */
function NavRow({
  item,
  active,
  badge = null,
}: {
  item: NavItem;
  active: boolean;
  badge?: number | null;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link href={item.href} />}
        isActive={active}
        tooltip={item.title}
        className={cn(
          "group/nav relative transition-all duration-200",
          "hover:translate-x-0.5 hover:bg-sidebar-accent",
          active && "hover:translate-x-0"
        )}
      >
        {/* The active marker. `scale-y-0` when off, so it animates rather than
            appearing, and it is `aria-hidden` because `isActive` on the button
            already conveys the state to a screen reader. */}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 -left-1 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary",
            "transition-transform duration-200 ease-out",
            active ? "scale-y-100" : "scale-y-0"
          )}
        />
        <item.icon
          className={cn(
            "transition-transform duration-200",
            "group-hover/nav:scale-110",
            active && "text-primary"
          )}
        />
        <span>{item.title}</span>
        {badge !== null ? (
          <SidebarMenuBadge className="rounded-full bg-destructive text-destructive-foreground transition-transform duration-200 group-hover/nav:scale-105">
            {badge > 9 ? "9+" : badge}
          </SidebarMenuBadge>
        ) : null}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
