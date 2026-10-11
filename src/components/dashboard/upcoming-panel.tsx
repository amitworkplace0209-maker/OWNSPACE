import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Flag,
  Gem,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { ToneBadge, toneBg } from "@/components/dashboard/tone";
import {
  AGENDA_STATE_LABEL,
  AGENDA_STATE_TONE,
} from "@/lib/dashboard-logic";
import { getUpcomingAgenda, type AgendaItem, type AgendaKind } from "@/lib/dal/calendar";
import { formatDateShort, formatTime } from "@/lib/format";

const KIND_ICON: Record<AgendaKind, LucideIcon> = {
  reminder: Bell,
  event: CalendarDays,
  deadline: Flag,
  milestone: Gem,
};

const KIND_LABEL: Record<AgendaKind, string> = {
  reminder: "Reminder",
  event: "Event",
  deadline: "Task due",
  milestone: "Milestone",
};

function agendaHref(item: AgendaItem): string {
  switch (item.kind) {
    case "reminder":
      return "/reminders";
    case "event":
      return "/calendar";
    case "deadline":
      return `/tasks/${item.id}`;
    case "milestone":
      // Milestones have no route of their own — they live inside a project.
      return item.projectId ? `/projects/${item.projectId}` : "/calendar";
  }
}

function timeLabel(item: AgendaItem): string {
  if (item.allDay) return formatDateShort(item.at);
  return formatTime(item.at);
}

/**
 * Upcoming: reminders, calendar events, task deadlines and milestones merged
 * into one chronological list so the panel answers "what's next?" in a single
 * glance instead of four of them.
 */
export function UpcomingPanel({ items }: { items: AgendaItem[] }) {
  return (
    <SectionShell
      title="Upcoming"
      icon={CalendarDays}
      description={
        items.length > 0
          ? "Reminders, events, deadlines and milestones"
          : "Nothing on the horizon"
      }
      action="Calendar"
      actionHref="/calendar"
      badge={
        items.length > 0 ? (
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {items.length}
          </span>
        ) : null
      }
      interactive
    >
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nothing scheduled"
          description="Add a calendar event or a reminder."
          className="py-8"
          action={
            <Button render={<Link href="/calendar?new=1" />}>
              <CalendarDays /> Add event
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            const tone = AGENDA_STATE_TONE[item.state];
            const urgent = item.state === "overdue" || item.state === "due_soon";

            return (
              <li key={`${item.kind}-${item.id}`}>
                <Link
                  href={agendaHref(item)}
                  className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 transition hover:border-border hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      toneBg[tone]
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium group-hover:underline">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {KIND_LABEL[item.kind]}
                      {item.projectName ? ` · ${item.projectName}` : ""}
                    </span>
                  </span>

                  {urgent || item.state === "snoozed" ? (
                    <ToneBadge tone={tone} dot className="shrink-0">
                      {AGENDA_STATE_LABEL[item.state]}
                    </ToneBadge>
                  ) : (
                    <span
                      className={cn(
                        "shrink-0 text-xs font-medium tabular-nums",
                        urgent ? "text-danger" : "text-muted-foreground"
                      )}
                    >
                      {timeLabel(item)}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionShell>
  );
}

/** Fetches the merged agenda and renders the panel. */
export async function UpcomingSection({ limit = 8 }: { limit?: number }) {
  const items = await getUpcomingAgenda(limit);
  return <UpcomingPanel items={items} />;
}
