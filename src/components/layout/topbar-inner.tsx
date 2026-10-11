"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Bell,
  FolderKanban,
  CheckSquare,
  CalendarDays,
  NotebookPen,
  AlarmClock,
  Download,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { BrandMark } from "@/components/layout/brand-mark";
import { allNavItems } from "@/config/navigation";
import { openCommandPalette } from "@/components/layout/command-palette";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import type { AppUser, AppNotification } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";
import { cn } from "cn";

/**
 * Matches the current path against the navigation table, preferring the deepest
 * match so `/projects/abc/tasks` reports "Tasks", not "Projects".
 */
function currentNavItem(pathname: string) {
  const exact = allNavItems.find((item) => pathname === item.href);
  if (exact) return exact;
  return (
    allNavItems
      .filter((item) => item.href !== "/dashboard" && pathname.startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

const QUICK_CREATE = [
  { title: "New project", href: "/projects?new=1", icon: FolderKanban },
  { title: "New task", href: "/tasks?new=1", icon: CheckSquare },
  { title: "New note", href: "/notes?new=1", icon: NotebookPen },
  { title: "New reminder", href: "/reminders?new=1", icon: AlarmClock },
  { title: "New event", href: "/calendar?new=1", icon: CalendarDays },
];

/**
 * Application topbar.
 *
 * Three things it deliberately does differently from a plain sticky header:
 *
 * - Frosted chrome plus an accent hairline, so the bar belongs to the theme
 *   instead of floating over it as a grey slab.
 * - `safe-t`, because `viewportFit: "cover"` lets the app run under the notch and
 *   the inset has to be added back here rather than by `body`.
 * - An inline install button that only appears once the browser has actually
 *   offered one, so it never dead-ends on a browser that would ignore it.
 */
export function TopbarInner({
  user,
  unreadCount,
  notifications,
}: {
  user: AppUser;
  unreadCount: number;
  notifications: AppNotification[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const { canInstall, promptInstall } = usePwaInstall();

  const navItem = currentNavItem(pathname);
  const PageIcon = navItem?.icon;

  function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    setQuery("");
  }

  async function markAllRead() {
    await markAllNotificationsReadAction();
    router.refresh();
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast.success("Ownspece installed.");
    }
  }

  return (
    <header className="chrome-blur chrome-hairline sticky top-0 z-30 shrink-0 border-b">
      <div className="safe-t">
        <div className="flex h-14 items-center gap-1.5 px-2 sm:gap-2 sm:px-3">
          <SidebarTrigger className="-ml-0.5" />

          {/* Mobile gets the brand; desktop gets the section it is in. */}
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <BrandMark size="sm" />
            <span className="truncate text-sm font-semibold tracking-tight">
              {navItem?.title ?? "Ownspece"}
            </span>
          </div>
          <div className="hidden min-w-0 items-center gap-2 md:flex">
            {PageIcon ? (
              <span className="icon-tile size-6 shrink-0">
                <PageIcon aria-hidden="true" className="size-3.5" />
              </span>
            ) : null}
            <span className="truncate text-sm font-semibold tracking-tight">
              {navItem?.title ?? "Ownspece"}
            </span>
          </div>

          <form
            onSubmit={handleSearch}
            role="search"
            className="hidden min-w-0 flex-1 items-center md:flex lg:ml-4"
          >
            <div className="relative w-full lg:max-w-md">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search projects, tasks, notes…"
                aria-label="Search"
                className="h-8 bg-muted/50 pl-8 pr-14 transition focus-visible:bg-background"
              />
              <button
                type="button"
                onClick={openCommandPalette}
                aria-label="Open command palette"
                className="pointer-events-auto absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground transition hover:text-foreground lg:inline-flex"
              >
                <kbd>Ctrl</kbd>
                <kbd>K</kbd>
              </button>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            {canInstall ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void install()}
                aria-label="Install Ownspece as an app"
                title="Install app"
                className="text-primary md:hidden"
              >
                <Download className="size-4" />
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              aria-label="Search"
              onClick={openCommandPalette}
            >
              <Search className="size-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="brand-gradient hidden gap-1.5 text-white hover:opacity-90 md:inline-flex"
                  >
                    <Plus className="size-4" />
                    Create
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Quick create</DropdownMenuLabel>
                  {QUICK_CREATE.map((item) => (
                    <DropdownMenuItem
                      key={item.href}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="size-4" /> {item.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="md:hidden"
                    aria-label="Quick create"
                  >
                    <Plus className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Quick create</DropdownMenuLabel>
                  {QUICK_CREATE.map((item) => (
                    <DropdownMenuItem
                      key={item.href}
                      render={<Link href={item.href} />}
                    >
                      <item.icon className="size-4" /> {item.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="relative"
                    aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
                  >
                    <Bell className="size-4" />
                    {unreadCount > 0 ? (
                      <span
                        aria-hidden="true"
                        className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground ring-2 ring-background"
                      >
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-80">
                <div className="flex items-center justify-between px-1.5 py-1">
                  <DropdownMenuLabel className="px-0">
                    Notifications
                  </DropdownMenuLabel>
                  {unreadCount > 0 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => void markAllRead()}
                    >
                      Mark all read
                    </Button>
                  ) : null}
                </div>
                <DropdownMenuSeparator />
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 py-6 text-center">
                    <Sparkles
                      aria-hidden="true"
                      className="size-5 text-muted-foreground/50"
                    />
                    <p className="text-sm text-muted-foreground">
                      You&apos;re all caught up
                    </p>
                  </div>
                ) : (
                  <ul className="max-h-80 overflow-y-auto">
                    {notifications.map((notification) => (
                      <li
                        key={notification.id}
                        className={cn(
                          "border-b border-border/50 px-2 py-2 last:border-0",
                          notification.read_at === null && "bg-accent/30"
                        )}
                      >
                        <p className="text-sm leading-tight font-medium">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(notification.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <DropdownMenuSeparator />
                <div className="p-1">
                  <Link href="/notifications" className="block">
                    <Button variant="ghost" size="sm" className="w-full">
                      View all notifications
                    </Button>
                  </Link>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <ThemeToggle />

            {canInstall ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void install()}
                className="hidden gap-1.5 border-primary/40 text-primary hover:bg-primary/10 md:inline-flex"
              >
                <Download className="size-3.5" />
                Install
              </Button>
            ) : null}

            <UserMenu user={user} compact />
          </div>
        </div>
      </div>
    </header>
  );
}