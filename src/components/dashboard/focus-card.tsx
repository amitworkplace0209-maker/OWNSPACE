"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CirclePlay, Clock, Hourglass, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionShell } from "@/components/dashboard/section-shell";
import { ToneBadge } from "@/components/dashboard/tone";
import { startPomodoroAction } from "@/lib/actions/time";
import { formatDurationMinutes } from "@/lib/format";

export type FocusTask = { id: string; title: string };

const FOCUS_OPTIONS = [15, 25, 50] as const;
const BREAK_MINUTES = 5;

export function FocusCard({
  tasks,
  todaySessions,
  focusMinutes,
  sessionRunning,
  timerRunning,
}: {
  tasks: FocusTask[];
  todaySessions: number;
  focusMinutes: number;
  sessionRunning: boolean;
  timerRunning: boolean;
}) {
  const router = useRouter();
  const [taskId, setTaskId] = React.useState<string>("");
  const [focus, setFocus] = React.useState<number>(25);
  const [starting, setStarting] = React.useState(false);

  async function start() {
    if (!taskId || starting) return;
    setStarting(true);
    try {
      const res = await startPomodoroAction(taskId, focus, BREAK_MINUTES);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`${focus}-minute focus started`);
        router.refresh();
      }
    } catch {
      toast.error("Could not start the focus session.");
    } finally {
      setStarting(false);
    }
  }

  const busy = sessionRunning || timerRunning;

  return (
    <SectionShell
      title="Focus"
      icon={Hourglass}
      description={`${formatDurationMinutes(focusMinutes)} of focus logged today`}
      action="Time & focus"
      actionHref="/time"
      accentEdge
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center">
            <p className="text-[11px] text-muted-foreground">Sessions today</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {todaySessions}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-center">
            <p className="text-[11px] text-muted-foreground">Focus time</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums">
              {formatDurationMinutes(focusMinutes)}
            </p>
          </div>
        </div>

        {busy ? (
          <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5 text-sm">
            <Clock aria-hidden="true" className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">
              {sessionRunning
                ? "A focus session is running"
                : "A time timer is running"}
            </span>
            <ToneBadge tone="info" className="shrink-0">
              Live
            </ToneBadge>
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={CirclePlay}
            title="Nothing to focus on yet"
            description="Focus sessions are always attached to a real task."
            className="py-6"
            action={
              <Button render={<Link href="/tasks?new=1" />}>
                <Plus /> Create task
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Task
              </span>
              <Select value={taskId} onValueChange={(v) => setTaskId(v ?? "")}>
                <SelectTrigger className="w-full" aria-label="Task to focus on">
                  <SelectValue placeholder="Choose a task" />
                </SelectTrigger>
                <SelectContent>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Length
                </span>
                <Select
                  value={String(focus)}
                  onValueChange={(v) => setFocus(Number(v))}
                >
                  <SelectTrigger className="w-full" aria-label="Focus length">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOCUS_OPTIONS.map((minutes) => (
                      <SelectItem key={minutes} value={String(minutes)}>
                        {minutes} min
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <Button
                onClick={() => void start()}
                disabled={!taskId || starting}
                className="shrink-0"
              >
                <CirclePlay /> {starting ? "Starting…" : "Start focus"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionShell>
  );
}
