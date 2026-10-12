"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckSquare,
  FolderPlus,
  NotebookPen,
  Bell,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openCommandPalette } from "@/components/layout/command-palette";
import { StatusDot } from "@/components/dashboard/tone";
import { greetingFor, type SemanticTone } from "@/lib/dashboard-logic";

export type HeaderChip = {
  id: string;
  label: string;
  tone: SemanticTone;
  href?: string;
};

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});

const QUICK_CREATE = [
  { title: "New project", href: "/projects?new=1", icon: FolderPlus },
  { title: "New task", href: "/tasks?new=1", icon: CheckSquare },
  { title: "New note", href: "/notes?new=1", icon: NotebookPen },
  { title: "New reminder", href: "/reminders?new=1", icon: Bell },
  { title: "New event", href: "/calendar?new=1", icon: CalendarDays },
];

/**
 * Dashboard header.
 *
 * The hero is the one surface allowed to be loud: an accent wash behind the
 * greeting, the user's name set in the accent gradient, and status chips that
 * colour-code by tone. Everything it shows is real — greeting, clock and time
 * zone come from the viewer's own `Date`, replaced in a layout effect *before*
 * first paint so there is no flash of server (UTC) time.
 */
export function DashboardHeader({
  name,
  chips,
  serverGreeting,
  serverDate,
  serverTime,
}: {
  name: string;
  chips: HeaderChip[];
  serverGreeting: string;
  serverDate: string;
  serverTime: string;
}) {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useLayoutEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, []);

  const greeting = now ? greetingFor(now) : serverGreeting;
  const dateLabel = now ? dateFormatter.format(now) : serverDate;
  const timeLabel = now ? timeFormatter.format(now) : serverTime;
  const timezone = now
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : null;

  return (
    <section className="dash-hero rounded-2xl border bg-card p-4 ring-1 ring-(--card-ring-color) shadow-(--card-shadow) sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {greeting}
            </p>
            <h1
              suppressHydrationWarning
              className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              {name ? (
                <span className="brand-text">{name}</span>
              ) : (
                <span>Welcome back</span>
              )}
            </h1>
            <p
              suppressHydrationWarning
              title={timezone ?? undefined}
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground"
            >
              <span>{dateLabel}</span>
              <span aria-hidden="true" className="text-border">
                ·
              </span>
              <span className="tabular-nums text-foreground/80">{timeLabel}</span>
              {timezone ? (
                <span className="text-xs text-muted-foreground/70">{timezone}</span>
              ) : null}
            </p>
          </div>

          {chips.length > 0 ? (
            <ul className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => {
                const inner = (
                  <>
                    <StatusDot tone={chip.tone} />
                    <span>{chip.label}</span>
                  </>
                );
                const className =
                  "inline-flex h-6 items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur transition hover:border-primary/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

                return (
                  <li key={chip.id}>
                    {chip.href ? (
                      <Link href={chip.href} className={className}>
                        {inner}
                      </Link>
                    ) : (
                      <span className={className}>{inner}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            // Wrapped rather than passed directly: `openCommandPalette` takes an
            // optional query, and handing it the click event would set the search
            // box's value to a MouseEvent.
            onClick={() => openCommandPalette()}
            className="text-muted-foreground"
          >
            <Search />
            Search
            <kbd className="ml-1 hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium sm:inline">
              Ctrl K
            </kbd>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" aria-label="Quick add">
                  <Plus />
                  <span className="hidden sm:inline">Quick add</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Create</DropdownMenuLabel>
                {QUICK_CREATE.map((item) => (
                  <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
                    <item.icon /> {item.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button render={<Link href="/projects?new=1" />}>
            <FolderPlus />
            <span className="hidden sm:inline">New project</span>
            <span className="sr-only sm:hidden">New project</span>
          </Button>
        </div>
      </div>
    </section>
  );
}