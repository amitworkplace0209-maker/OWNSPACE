"use client";

import { useOffline } from "next/offline";
import { CloudOff } from "lucide-react";
import { CachedTaskList, TasksSkeleton } from "@/components/tasks/tasks-skeleton";
import { useBakedTasksForLastUser } from "@/hooks/use-baked-tasks";

/**
 * Tasks route fallback — and the offline app shell for /tasks.
 *
 * Two jobs, and the second one is the important one.
 *
 * Normally it is just a layout-accurate skeleton. But `loading.tsx` is the shell
 * Next.js prefetches for a segment, so this file renders on a soft navigation
 * even when the RSC payload for the page behind it never arrives. With
 * `experimental.useOffline` that request is retried automatically once the
 * connection returns — but until then this screen is all the user would see.
 *
 * So while offline it renders the tasks snapshot the device already has. That
 * is what makes the page "baked": a cold launch, an airplane-mode reload, or a
 * navigation with no signal still shows real work instead of a spinner.
 */
export default function TasksLoading() {
  const offline = useOffline();
  const { tasks, cachedAt } = useBakedTasksForLastUser();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {offline ? (
            <>
              <CloudOff aria-hidden="true" className="size-3.5" />
              Waiting for a connection…
            </>
          ) : (
            "Every to-do across your projects."
          )}
        </p>
      </div>

      {offline ? (
        <CachedTaskList tasks={tasks} cachedAt={cachedAt} />
      ) : (
        <TasksSkeleton />
      )}
    </div>
  );
}