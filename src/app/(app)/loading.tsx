import { Skeleton } from "@/components/ui/skeleton";

/**
 * Route-level fallback for every page under /(app).
 *
 * Deliberately neutral: it must not pretend to know the shape of the route it
 * is standing in for, because this same boundary serves /tasks, /notes,
 * /analytics and everything else. The dashboard ships its own layout-accurate
 * loading.tsx; other routes get this generic shell.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-36" />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
