import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Per-section loading states.
 *
 * The dashboard streams each section inside its own <Suspense>, so a slow
 * query only ever shows the skeleton for that one card — the rest of the
 * dashboard is already on screen.
 */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <Card aria-busy="true">
      <CardHeader className="grid-cols-[1fr_auto]">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-5 w-14 justify-self-end" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function HeaderSkeleton() {
  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-40" />
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-24 rounded-full" />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-8 w-24" />
      </div>
    </div>
  );
}

export function QuickActionsSkeleton() {
  return (
    <div className="flex gap-2 overflow-hidden" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-28 shrink-0 rounded-xl" />
      ))}
    </div>
  );
}

export function KpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Shell>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Skeleton className="size-4 rounded" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </Shell>
  );
}

export function ProjectCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <Skeleton className="mt-4 h-1.5 w-full" />
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-4 w-16 rounded-full" />
            <Skeleton className="h-4 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Shell>
      <ol className="flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="timeline-item flex gap-3">
            <span className="timeline-dot" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </li>
        ))}
      </ol>
    </Shell>
  );
}

export function ChartSkeleton() {
  return (
    <Shell>
      <Skeleton className="h-40 w-full" />
    </Shell>
  );
}

export function StorageSkeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    </Shell>
  );
}

export function CalendarSkeleton() {
  return (
    <Shell>
      <div className="grid grid-cols-7 gap-1" aria-busy="true">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-lg" />
        ))}
      </div>
    </Shell>
  );
}

export function PanelSkeleton() {
  return (
    <Shell>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </Shell>
  );
}
