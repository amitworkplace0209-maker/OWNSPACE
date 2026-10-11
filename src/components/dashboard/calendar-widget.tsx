import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { cn } from "cn";
import { SectionShell } from "@/components/dashboard/section-shell";
import { getCalendarEvents } from "@/lib/dal/calendar";
import { todayIsoDate } from "@/lib/dashboard-logic";
import type { CalendarEvent } from "@/types";

const WEEKDAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const key = event.starts_at.slice(0, 10);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return map;
}

/**
 * Month-at-a-glance calendar.
 *
 * The widget is read-only on purpose: month navigation and event editing live
 * one click away on /calendar, which already supports `?month=YYYY-MM`, so the
 * dashboard does not carry a second half-implemented calendar control.
 */
export async function CalendarWidget() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const monthId = monthKey(now);
  const todayStr = todayIsoDate(now);

  const from = new Date(Date.UTC(year, month, 1 - 7)).toISOString();
  const to = new Date(Date.UTC(year, month + 1, 7, 23, 59, 59)).toISOString();
  const events = await getCalendarEvents(from, to);

  const byDay = groupByDay(events);
  const monthEvents = events.filter((e) => e.starts_at.slice(0, 7) === monthId);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Monday-first grid, matching the headers below.
  const leadingBlanks = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;

  const cells: Array<{ day: number; date: string }> = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({
      day,
      date: `${monthId}-${String(day).padStart(2, "0")}`,
    });
  }

  const monthLabel = now.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <SectionShell
      title="Calendar"
      icon={CalendarDays}
      description={monthLabel}
      action="Open calendar"
      actionHref={`/calendar?month=${monthId}`}
      interactive
    >
      <div
        className="grid grid-cols-7 gap-1"
        role="grid"
        aria-label={monthLabel}
      >
        {WEEKDAY_HEADERS.map((label, index) => (
          <div
            key={`${label}-${index}`}
            role="columnheader"
            className="pb-1 text-center text-[10px] font-medium text-muted-foreground"
          >
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">
              {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][index]}
            </span>
          </div>
        ))}

        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} aria-hidden="true" />
        ))}

        {cells.map((cell) => {
          const dayEvents = byDay.get(cell.date) ?? [];
          const isToday = cell.date === todayStr;
          const isWeekend = (new Date(`${cell.date}T00:00:00Z`).getUTCDay() + 6) % 7 >= 5;

          return (
            <Link
              key={cell.date}
              href={`/calendar?month=${monthId}`}
              aria-label={`${cell.date}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}` : ""}`}
              className={cn(
                "flex h-9 flex-col items-center justify-center rounded-lg border text-xs transition focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                isToday
                  ? "border-primary bg-primary text-primary-foreground font-semibold"
                  : dayEvents.length > 0
                    ? "border-border bg-accent/50 font-medium hover:border-primary/40 hover:bg-accent"
                    : "border-transparent text-muted-foreground hover:bg-accent/60",
                !isToday && isWeekend && dayEvents.length === 0 && "text-muted-foreground/60"
              )}
            >
              <span className="leading-none tabular-nums">{cell.day}</span>
              <span className="mt-1 flex h-1 items-center gap-0.5" aria-hidden="true">
                {dayEvents.slice(0, 3).map((event) => (
                  <span
                    key={event.id}
                    className="size-1 rounded-full"
                    style={{ background: event.color ?? "var(--primary)" }}
                  />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        {monthEvents.length === 0
          ? "No events this month"
          : `${monthEvents.length} event${monthEvents.length === 1 ? "" : "s"} this month`}
      </p>
    </SectionShell>
  );
}
