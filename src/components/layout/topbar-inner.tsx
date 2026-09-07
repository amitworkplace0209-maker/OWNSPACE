"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Search, Plus, Bell, FolderKanban, CheckSquare, CalendarDays, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
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
  const [query, setQuery] = useState("");

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    setQuery("");
  }

  async function markAllRead() {
    await markAllNotificationsReadAction();
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger />
      <form onSubmit={handleSearch} className="hidden w-full max-w-sm flex-1 items-center sm:flex">
        <div className="relative w-full">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            aria-label="Search"
            className="h-8 pl-7 pr-14"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground lg:inline-flex">
            Ctrl K
          </kbd>
        </div>
      </form>
      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" aria-label="Quick create">
                <Plus className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Quick create</DropdownMenuLabel>
              <DropdownMenuItem render={<Link href="/projects?new=1" />}>
                <FolderKanban className="size-4" /> New project
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/tasks?new=1" />}>
                <CheckSquare className="size-4" /> New task
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/notes?new=1" />}>
                <NotebookPen className="size-4" /> New note
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/calendar?new=1" />}>
                <CalendarDays className="size-4" /> New event
              </DropdownMenuItem>
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
                aria-label="Notifications"
              >
                <Bell className="size-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <div className="flex items-center justify-between px-1.5 py-1">
                <DropdownMenuLabel className="px-0">Notifications</DropdownMenuLabel>
                {unreadCount > 0 ? (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={markAllRead}>
                    Mark all read
                  </Button>
                ) : null}
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              <ul className="max-h-80 overflow-y-auto">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "flex flex-col gap-0.5 border-b border-border/50 px-2 py-2 last:border-0",
                      n.read_at === null && "bg-accent/30"
                    )}
                  >
                    <p className="text-sm font-medium leading-none">{n.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <ThemeToggle />
        <div className="hidden md:block">
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}