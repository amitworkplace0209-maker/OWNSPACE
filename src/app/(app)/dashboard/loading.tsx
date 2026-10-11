import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarSkeleton,
  HeaderSkeleton,
  KpiSkeleton,
  ListSkeleton,
  PanelSkeleton,
  ProjectCardsSkeleton,
} from "@/components/dashboard/dashboard-skeletons";

/**
 * Route-level fallback for /dashboard.
 *
 * The page itself streams each card inside its own <Suspense>, so this only
 * covers the moment between navigating and the page component first rendering
 * (including the session lookup in the (app) layout). It mirrors the real
 * dashboard layout — header, quick actions, then the wide column beside the
 * right rail — so nothing jumps when content arrives.
 */
export default function DashboardLoading() {
  return (
    <div className="page-grid" aria-busy="true" aria-label="Loading dashboard">
      <HeaderSkeleton />

      <KpiSkeleton />

      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-32 shrink-0 rounded-xl" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ListSkeleton rows={4} />
          <ListSkeleton rows={5} />
        </div>
        <div className="flex flex-col gap-4">
          <PanelSkeleton />
          <ProjectCardsSkeleton count={4} />
          <CalendarSkeleton />
        </div>
      </div>
    </div>
  );
}
