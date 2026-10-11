"use client";

import Link from "next/link";
import { cn } from "cn";
import { CalendarClock, CheckCircle2, Flag, ListTodo, TriangleAlert } from "lucide-react";
import {
  DENSITY_CLASSES,
  SOURCE_STYLES,
  WEEKDAY_LABELS,
  dayDensity,
  densityStep,
  formatMinutes,
  itemColor,
  monthGrid,
  toIsoDate,
  type CalendarFilterState,
} from "@/lib/calendar-logic";
import { applyCalendarFilters } from "@/lib/calendar-logic";
import type { CalendarItem } from "@/lib/dal/calendar-bundle";

/**
 * The four calendar views.
 *
 * They all read the same filtered list and the same helpers, so an item cannot
 * appear on the agenda but be missing from the month grid — which is exactly
 * the bug that lived here before, when each view re-derived "what is on this
 * day" for itself.
 */

function ItemChip({
  item,
  onSelect,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
}) {
  const color = itemColor(item);
  const done = item.status === "done" || item.status === "completed";

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("size-1.5 shrink-0 rounded-full", !color && SOURCE_STYLES[item.source].dot)}
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className={cn("min-w-0 flex-1 truncate", done && "line-through opacity-60")}>
        {item.title}
      </span>
    </>
  );

  const className = cn(
    "flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition",
    item.source === "event"
      ? "bg-background/70 hover:bg-accent"
      : "bg-muted/40 hover:bg-muted"
  );

  return (
    <button type="button" onClick={() => onSelect(item)} className={className} title={item.title}>
      {body}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Month
// ---------------------------------------------------------------------------

export function MonthView({
  items,
  selectedDate,
  todayIso,
  filter,
  onSelectDate,
  onSelectItem,
}: {
  items: CalendarItem[];
  selectedDate: string;
  todayIso: string;
  filter: CalendarFilterState;
  onSelectDate: (date: string) => void;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const [year, monthIndex] = selectedDate.split("-").map(Number);
  const grid = monthGrid(year, monthIndex - 1);
  const visible = applyCalendarFilters(items, filter);
  const byDate = groupItems(visible);
  const density = dayDensity(visible);

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={cn(
              "py-2 text-center text-[11px] font-medium tracking-wide uppercase",
              index === 0 || index === 6 ? "text-muted-foreground/70" : "text-muted-foreground"
            )}
          >
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((date) => {
          const dateStr = toIsoDate(date);
          const dayItems = byDate.get(dateStr) ?? [];
          const inMonth = date.getMonth() === monthIndex - 1;
          const isToday = dateStr === todayIso;
          const isSelected = dateStr === selectedDate;
          const step = densityStep(density.get(dateStr) ?? 0);

          return (
            // A plain container, not a button: the chips inside are real
            // buttons, and nesting interactive elements makes clicking an item
            // also "select the day". The date number carries the selection.
            <div
              key={dateStr}
              aria-current={isToday ? "date" : undefined}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-0.5 border-r border-b border-border/40 p-1 text-left transition last:border-r-0 sm:min-h-24",
                "hover:bg-accent/40",
                !inMonth && "bg-muted/20 text-muted-foreground/50",
                DENSITY_CLASSES[step],
                isSelected && "ring-2 ring-inset ring-primary"
              )}
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onSelectDate(dateStr)}
                  aria-label={date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                  className="flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full",
                      isToday && "bg-primary font-semibold text-primary-foreground"
                    )}
                  >
                    {date.getDate()}
                  </span>
                </button>
                {dayItems.length > 3 ? (
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">
                    {dayItems.length}
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-col gap-0.5">
                {dayItems.slice(0, 3).map((item) => (
                  <ItemChip key={item.key} item={item} onSelect={onSelectItem} />
                ))}
                {dayItems.length > 3 ? (
                  <span className="px-1 text-[10px] text-muted-foreground sm:hidden">
                    +{dayItems.length - 3}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------------

export function WeekView({
  items,
  selectedDate,
  todayIso,
  filter,
  onSelectDate,
  onSelectItem,
}: {
  items: CalendarItem[];
  selectedDate: string;
  todayIso: string;
  filter: CalendarFilterState;
  onSelectDate: (date: string) => void;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(selectedDate, i - weekStartIndex(selectedDate)));
  const visible = applyCalendarFilters(items, filter);
  const byDate = groupItems(visible);
  const allDayByDate = new Map(
    week.map((date) => [date, (byDate.get(date) ?? []).filter((item) => item.allDay)])
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {week.map((date, index) => {
          const allDay = allDayByDate.get(date) ?? [];
          return (
            <button
              key={`allday-${date}`}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                "flex min-h-14 flex-col gap-0.5 rounded-lg border p-1 text-left transition",
                date === todayIso ? "border-primary/50 bg-primary/5" : "bg-card",
                date === selectedDate && "ring-2 ring-inset ring-primary"
              )}
            >
              <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
                {WEEKDAY_LABELS[index]}
              </span>
              {allDay.length > 0 ? (
                <span className="flex flex-col gap-0.5">
                  {allDay.slice(0, 2).map((item) => (
                    <ItemChip key={item.key} item={item} onSelect={onSelectItem} />
                  ))}
                  {allDay.length > 2 ? (
                    <span className="px-1 text-[10px] text-muted-foreground">
                      +{allDay.length - 2}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {week.map((date, index) => {
          const dayItems = (byDate.get(date) ?? []).filter((item) => !item.allDay);

          return (
            <button
              key={`col-${date}`}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                "flex min-h-56 flex-col gap-1 rounded-lg border p-1 text-left transition",
                "hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                date === todayIso ? "border-primary/40 bg-primary/5" : "bg-card",
                date === selectedDate && "ring-2 ring-inset ring-primary"
              )}
            >
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                    date === todayIso && "bg-primary font-semibold text-primary-foreground"
                  )}
                >
                  {Number(date.slice(8, 10))}
                </span>
                <span className="text-[10px] text-muted-foreground sm:hidden">
                  {WEEKDAY_LABELS[index][0]}
                </span>
              </span>

              {dayItems.length === 0 ? (
                <span className="px-1 py-3 text-center text-[10px] text-muted-foreground/60">
                  —
                </span>
              ) : (
                dayItems.map((item) => (
                  <span
                    key={item.key}
                    className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-background/70 p-1"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          !itemColor(item) && SOURCE_STYLES[item.source].dot
                        )}
                        style={itemColor(item) ? { backgroundColor: itemColor(item)! } : undefined}
                      />
                      <span className="min-w-0 flex-1 truncate text-[11px]">
                        {item.title}
                      </span>
                    </span>
                    <span className="pl-2.5 text-[10px] text-muted-foreground">
                      {formatMinutes(item.startMinutes)}
                    </span>
                  </span>
                ))
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

export function DayView({
  items,
  selectedDate,
  todayIso,
  filter,
  onSelectItem,
}: {
  items: CalendarItem[];
  selectedDate: string;
  todayIso: string;
  filter: CalendarFilterState;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const visible = applyCalendarFilters(items, filter);
  const dayItems = visible.filter((item) => item.date === selectedDate);
  const timed = dayItems.filter((item) => !item.allDay);
  const allDay = dayItems.filter((item) => item.allDay);

  return (
    <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">
          {new Date(`${selectedDate}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            selectedDate === todayIso
              ? "bg-primary/12 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {selectedDate === todayIso ? "Today" : dayItems.length + " items"}
        </span>
      </header>

      {dayItems.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing scheduled for this day.
        </p>
      ) : (
        <>
          {allDay.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                All day
              </p>
              {allDay.map((item) => (
                <DayRow key={item.key} item={item} onSelect={onSelectItem} />
              ))}
            </section>
          ) : null}

          {timed.length > 0 ? (
            <section className="flex flex-col gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Timed
              </p>
              {timed.map((item) => (
                <DayRow key={item.key} item={item} onSelect={onSelectItem} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function DayRow({
  item,
  onSelect,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
}) {
  const color = itemColor(item);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group flex items-center gap-3 rounded-lg border p-2.5 text-left transition hover:border-primary/40 hover:bg-accent/30"
    >
      <span
        aria-hidden="true"
        className={cn("h-9 w-1 shrink-0 rounded-full", !color && SOURCE_STYLES[item.source].dot)}
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">
        {formatMinutes(item.startMinutes)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              SOURCE_STYLES[item.source].badge
            )}
          >
            {SOURCE_STYLES[item.source].label}
          </span>
          {item.projectName ? <span className="truncate">{item.projectName}</span> : null}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export function AgendaView({
  items,
  todayIso,
  filter,
  limit = 60,
  onSelectItem,
}: {
  items: CalendarItem[];
  todayIso: string;
  filter: CalendarFilterState;
  limit?: number;
  onSelectItem: (item: CalendarItem) => void;
}) {
  const visible = applyCalendarFilters(items, filter)
    .filter((item) => item.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  const byDate = groupItems(visible);

  const days = [...byDate.entries()].slice(0, limit);

  if (days.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-12 text-center">
        <p className="text-sm font-medium">Nothing coming up</p>
        <p className="text-xs text-muted-foreground">
          No events, tasks, reminders or milestones from today onward.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map(([date, dayItems]) => (
        <section key={date} className="flex flex-col gap-1.5">
          <header className="flex items-center gap-2 px-1">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold tabular-nums",
                date === todayIso
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              )}
            >
              {Number(date.slice(8, 10))}
            </span>
            <span className="text-sm font-medium">
              {date === todayIso
                ? "Today"
                : new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
            </span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
              {dayItems.length}
            </span>
          </header>
          <ul className="flex flex-col gap-1.5">
            {dayItems.map((item) => (
              <li key={item.key}>
                <AgendaRow item={item} onSelect={onSelectItem} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AgendaRow({
  item,
  onSelect,
}: {
  item: CalendarItem;
  onSelect: (item: CalendarItem) => void;
}) {
  const Icon =
    item.source === "task"
      ? ListTodo
      : item.source === "reminder"
        ? CalendarClock
        : item.source === "milestone"
          ? Flag
          : CheckCircle2;

  const inner = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          SOURCE_STYLES[item.source].badge
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{item.allDay ? "All day" : formatMinutes(item.startMinutes)}</span>
          {item.projectName ? <span className="truncate">{item.projectName}</span> : null}
          {item.status && item.status !== "pending" ? (
            <span className="capitalize">{item.status.replace("_", " ")}</span>
          ) : null}
        </span>
      </span>
    </>
  );

  const className =
    "flex items-center gap-3 rounded-lg border bg-card p-2.5 text-left transition hover:border-primary/40 hover:shadow-sm";

  if (item.href) {
    return (
      <Link href={item.href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={() => onSelect(item)} className={className}>
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------------------

export const AGENDA_HINT = TriangleAlert;

function groupItems(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const grouped = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const list = grouped.get(item.date) ?? [];
    list.push(item);
    grouped.set(item.date, list);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.startMinutes ?? 0) - (b.startMinutes ?? 0);
    });
  }
  return grouped;
}

function weekStartIndex(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

function shiftDate(dateStr: string, delta: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}
