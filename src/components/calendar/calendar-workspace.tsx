"use client";

import { useRouter, usePathname } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/shared/form-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { createEventAction, updateEventAction, deleteEventAction } from "@/lib/actions/calendar";
import { EVENT_TYPES } from "@/types";
import { formatTime, toIsoSubmit } from "@/lib/format";
import { cn } from "cn";
import type { CalendarEvent, Project } from "@/types";

type EventFormState = { error?: string; data?: { id: string } };

const eventTypeLabels: Record<string, string> = {
  event: "Event",
  meeting: "Meeting",
  appointment: "Appointment",
  personal: "Personal",
};

const eventColors: Record<string, string> = {
  event: "bg-sky-500",
  meeting: "bg-violet-500",
  appointment: "bg-amber-500",
  personal: "bg-emerald-500",
};

function monthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const next = new Date(y, m - 1 + delta, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

export function CalendarWorkspace({
  events,
  projects,
  initialMonth,
}: {
  events: CalendarEvent[];
  projects: Project[];
  initialMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [month, setMonth] = useState(initialMonth);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const [y, m] = initialMonth.split("-").map(Number);
    const now = new Date();
    if (now.getFullYear() === y && now.getMonth() === m - 1) {
      return now.toISOString().slice(0, 10);
    }
    return `${initialMonth}-01`;
  });
  const [eventOpen, setEventOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);

  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;

  function navigate(newMonth: string) {
    setMonth(newMonth);
    router.push(`${pathname}?month=${newMonth}`);
  }

  const relevant = useMemo(
    () =>
      events.filter((e) => {
        const d = new Date(e.starts_at);
        return d.getMonth() === monthIndex && d.getFullYear() === year;
      }),
    [events, monthIndex, year]
  );

  const firstDay = monthStart(year, monthIndex).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, monthIndex, i + 1)),
  ];

  function prevMonth() { navigate(shiftMonth(month, -1)); }
  function nextMonth() { navigate(shiftMonth(month, 1)); }
  function today() {
    const now = new Date();
    const m = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    setMonth(m);
    setSelectedDate(now.toISOString().slice(0, 10));
    router.push(`${pathname}?month=${m}`);
  }

  const dayEvents = relevant
    .filter((e) => e.starts_at.slice(0, 10) === selectedDate)
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));

  function openCreate(date: string) {
    setEditing(null);
    setSelectedDate(date);
    setEventOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} aria-label="Previous month" className="rounded-lg border p-2 hover:bg-accent"><ChevronLeft className="size-4" /></button>
          <button onClick={nextMonth} aria-label="Next month" className="rounded-lg border p-2 hover:bg-accent"><ChevronRight className="size-4" /></button>
          <button onClick={today} aria-label="Go to today" className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">Today</button>
          <h2 className="ml-1 text-lg font-semibold">
            {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </h2>
        </div>
        <Button onClick={() => openCreate(selectedDate)}><Plus /> New event</Button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-xl border bg-card text-center text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="border-b border-border/60 py-2">{d}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} className="min-h-20 border-r border-b border-border/40" />;
          const ds = date.toISOString().slice(0, 10);
          const dayEvents = relevant.filter((e) => e.starts_at.slice(0, 10) === ds);
          const today = ds === new Date().toISOString().slice(0, 10);
          return (
            <button
              key={ds}
              onClick={() => setSelectedDate(ds)}
              className={cn(
                "flex min-h-20 flex-col items-start gap-1 border-r border-b border-border/40 p-1 text-left transition hover:bg-accent/50",
                selectedDate === ds && "bg-accent/60 ring-1 ring-inset ring-ring"
              )}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full", today && "bg-primary font-semibold text-primary-foreground")}>
                {date.getDate()}
              </span>
              {dayEvents.slice(0, 2).map((e) => (
                <span key={e.id} className="flex w-full max-w-full items-center gap-1 text-[10px] leading-none">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", eventColors[e.event_type] ?? "bg-sky-500")} />
                  <span className="truncate">{e.title}</span>
                </span>
              ))}
              {dayEvents.length > 2 ? <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 2} more</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">
            {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <Button variant="outline" size="sm" onClick={() => openCreate(selectedDate)}><Plus /> Add</Button>
        </div>
        {dayEvents.length === 0 ? (
          <EmptyState title="No events that day" description="Click “Add” to schedule something." />
        ) : (
          <ul className="flex flex-col gap-2">
            {dayEvents.map((e) => (
              <li key={e.id} className="group flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                <span className={cn("h-8 w-1 rounded-full", eventColors[e.event_type] ?? "bg-sky-500")} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.all_day ? "All day" : formatTime(e.starts_at)}
                    {e.ends_at && !e.all_day ? <>–{formatTime(e.ends_at)}</> : null}
                    {e.project_id ? <> · {projects.find((p) => p.id === e.project_id)?.name ?? ""}</> : null}
                  </p>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.title}`} onClick={() => { setEditing(e); setEventOpen(true); }}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <DeleteEventButton event={e} onDone={() => router.refresh()} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <EventFormDialog
        open={eventOpen}
        onOpenChange={(open) => { setEventOpen(open); if (!open) setEditing(null); }}
        projects={projects}
        event={editing}
        defaultStartsAt={selectedDate}
      />
    </div>
  );
}

function DeleteEventButton({ event, onDone }: { event: CalendarEvent; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${event.title}`} onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete this event?"
        description={event.title}
        confirmLabel="Delete event"
        onConfirm={async () => {
          await deleteEventAction(event.id);
          setOpen(false);
          onDone();
        }}
      />
    </>
  );
}

function EventFormDialog({
  open,
  onOpenChange,
  projects,
  event,
  defaultStartsAt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  event: CalendarEvent | null;
  defaultStartsAt: string;
}) {
  const router = useRouter();
  const action = event ? updateEventAction.bind(null, event.id) : createEventAction;
  const [state, formAction, pending] = useActionState<EventFormState, FormData>(action, { error: undefined });

  useEffect(() => {
    if (state.data && !pending) {
      onOpenChange(false);
      router.refresh();
    }
  }, [state.data, pending, onOpenChange, router]);

  const defaultStartIso = event?.starts_at ?? `${defaultStartsAt}T09:00`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{event ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Schedule a calendar event.</DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            const normalized = new FormData();
            for (const [key, value] of fd.entries()) normalized.append(key, value);
            normalized.set("starts_at", toIsoSubmit(String(fd.get("starts_at") ?? "")));
            normalized.set("ends_at", toIsoSubmit(String(fd.get("ends_at") ?? "")));
            formAction(normalized);
          }}
          className="flex flex-col gap-4"
        >
          <FormField label="Title" htmlFor="event-title" error={state.error}>
            <Input id="event-title" name="title" defaultValue={event?.title ?? ""} placeholder="e.g. Design review" required />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Starts">
              <Input type="datetime-local" name="starts_at" defaultValue={toLocalInput(defaultStartIso) || defaultStartIso} required />
            </FormField>
            <FormField label="Ends">
              <Input type="datetime-local" name="ends_at" defaultValue={toLocalInput(event?.ends_at ?? "")} />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Type">
              <select name="event_type" defaultValue={event?.event_type ?? "event"} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                {EVENT_TYPES.map((t) => (<option key={t} value={t}>{eventTypeLabels[t]}</option>))}
              </select>
            </FormField>
            <FormField label="Project">
              <select name="project_id" defaultValue={event?.project_id ?? ""} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none dark:bg-input/30">
                <option value="">No project</option>
                {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Location">
              <Input name="location" defaultValue={event?.location ?? ""} placeholder="Where?" />
            </FormField>
            <FormField label="Color" hint="CSS color, e.g. #ff0000">
              <Input name="color" defaultValue={event?.color ?? ""} placeholder="#10b981" />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="all_day" defaultChecked={event?.all_day ?? false} className="accent-primary" />
            All-day event
          </label>
          <FormField label="Description">
            <Textarea name="description" defaultValue={event?.description ?? ""} rows={2} />
          </FormField>
          {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : event ? "Save changes" : "Create event"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}