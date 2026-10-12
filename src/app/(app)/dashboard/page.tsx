import { Suspense, type ReactNode } from "react";
import { getProfile, requireUser } from "@/lib/dal";
import { getProjectSummary } from "@/lib/dal/projects";
import { getTaskSummary, getTodayWork, getTasks } from "@/lib/dal/tasks";
import { getAnalyticsSnapshot } from "@/lib/dal/analytics";
import { InstallPrompt } from "@/components/layout/install-prompt";
import {
  DashboardHeader,
  type HeaderChip,
} from "@/components/dashboard/dashboard-header";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TodaysWork } from "@/components/dashboard/todays-work";
import { UpcomingSection } from "@/components/dashboard/upcoming-panel";
import { ActiveProjectsSection } from "@/components/dashboard/active-projects";
import { FocusCard, type FocusTask } from "@/components/dashboard/focus-card";
import { ProductivityCard } from "@/components/dashboard/productivity-card";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { RecentNotes } from "@/components/dashboard/recent-notes";
import { StorageOverview } from "@/components/dashboard/storage-overview";
import { SystemStatus } from "@/components/dashboard/system-status";
import { SectionErrorBoundary } from "@/components/dashboard/dashboard-error";
import {
  CalendarSkeleton,
  ChartSkeleton,
  HeaderSkeleton,
  KpiSkeleton,
  ListSkeleton,
  PanelSkeleton,
  ProjectCardsSkeleton,
  StorageSkeleton,
  TimelineSkeleton,
} from "@/components/dashboard/dashboard-skeletons";
import { dueTodayTone, greetingFor, overdueTone } from "@/lib/dashboard-logic";
import { cn } from "cn";

export const metadata = {
  title: "Dashboard",
};

/**
 * Grid placement.
 *
 * The dashboard is one flat 3-column grid rather than two nested columns so a
 * section's mobile rank and its desktop slot can be chosen independently.
 * `order-*`/`lg:order-*` are written out as literal class names because
 * Tailwind only generates utilities it can see in source.
 *
 * On desktop, each wide (col-span-2) section is followed by a narrow one, so
 * auto-placement fills every row: the wide card takes the left two columns and
 * the narrow card the right rail. On mobile the same classes collapse to a
 * single column ranked 1→10.
 */
const SLOT = {
  todayWork: "order-1 lg:order-1 lg:col-span-2",
  focus: "order-3 lg:order-2",
  upcoming: "order-2 lg:order-3 lg:col-span-2",
  projects: "order-4 lg:order-4",
  activity: "order-6 lg:order-5 lg:col-span-2",
  productivity: "order-5 lg:order-6",
  notes: "order-8 lg:order-7 lg:col-span-2",
  calendar: "order-7 lg:order-8",
  storage: "order-9 lg:order-9 lg:col-span-2",
  system: "order-10 lg:order-10",
} as const;

// ---------------------------------------------------------------------------
// Section components
//
// Each one owns its own data fetch, so each <Suspense> above it streams only
// that card's skeleton while the rest of the dashboard is already interactive.
// ---------------------------------------------------------------------------

async function HeaderSection() {
  const user = await requireUser();
  const [profile, taskSummary, projectSummary, snapshot] = await Promise.all([
    getProfile(user.id),
    getTaskSummary(),
    getProjectSummary(),
    getAnalyticsSnapshot(),
  ]);

  const chips: HeaderChip[] = [];
  if (taskSummary.overdue > 0) {
    chips.push({
      id: "overdue",
      label: `${taskSummary.overdue} overdue`,
      tone: overdueTone(taskSummary.overdue),
      href: "/tasks?due=overdue",
    });
  }
  chips.push({
    id: "today",
    label: `${taskSummary.today} due today`,
    tone: dueTodayTone(taskSummary.today),
    href: "/tasks?due=today",
  });
  chips.push({
    id: "projects",
    label: `${projectSummary.active} active projects`,
    tone: "info",
    href: "/projects",
  });
  if (snapshot.pomodoro.running) {
    chips.push({
      id: "focus",
      label: "Focus running",
      tone: "success",
      href: "/time",
    });
  }

  const now = new Date();
  return (
    <DashboardHeader
      name={profile?.display_name?.split(" ")[0] ?? ""}
      chips={chips}
      serverGreeting={greetingFor(now)}
      serverDate={now.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
      serverTime={now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })}
    />
  );
}

async function TodaysWorkSection() {
  const work = await getTodayWork();
  return (
    <TodaysWork
      dueToday={work.dueToday}
      overdue={work.overdue}
      inProgress={work.inProgress}
      highPriority={work.highPriority}
      progress={work.progress}
    />
  );
}

async function FocusSection() {
  const [openTasks, snapshot] = await Promise.all([
    getTasks({ completed: false, limit: 25 }),
    getAnalyticsSnapshot(),
  ]);

  const tasks: FocusTask[] = openTasks.map((task) => ({
    id: task.id,
    title: task.title,
  }));

  return (
    <FocusCard
      tasks={tasks}
      todaySessions={snapshot.pomodoro.todaySessions}
      focusMinutes={snapshot.pomodoro.totalFocusMinutes}
      sessionRunning={snapshot.pomodoro.running}
      timerRunning={snapshot.time.onRunningTask}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * One dashboard section: grid placement, its own streaming boundary, and its
 * own error boundary.
 *
 * Error boundaries do not retry on their own — resetting one would just replay
 * the same failed RSC payload — so the fallback offers a Retry that calls
 * `router.refresh()` and re-runs the section's server-side query.
 */
function Section({
  title,
  slot = "",
  fallback,
  children,
}: {
  title: string;
  slot?: string;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return (
    // `dashboard-slot` makes this a flex column whose single child fills the
    // height. A grid row is as tall as its tallest card, so a short card beside
    // a tall one left the wrapper stretched with empty space under the card —
    // which reads as a hole punched in the layout rather than as breathing room.
    <div className={cn("dashboard-slot", slot)}>
      <SectionErrorBoundary title={title}>
        <Suspense fallback={fallback}>{children}</Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="page-grid">
      {/* No ReminderSweep here: the app-wide notifier already runs it, on every
          page. Leaving a second one on the dashboard would sweep the same rows
          twice and, on a shared reminder, fire the same alert twice. */}

      <InstallPrompt />

      <Section title="Greeting" fallback={<HeaderSkeleton />}>
        <HeaderSection />
      </Section>

      <Section title="Key numbers" fallback={<KpiSkeleton />}>
        <KpiCards />
      </Section>

      <QuickActions />

      <div className="grid gap-3 lg:grid-cols-3">
        <Section
          title="Today's work"
          slot={SLOT.todayWork}
          fallback={<ListSkeleton rows={4} />}
        >
          <TodaysWorkSection />
        </Section>

        <Section title="Focus" slot={SLOT.focus} fallback={<PanelSkeleton />}>
          <FocusSection />
        </Section>

        <Section
          title="Upcoming"
          slot={SLOT.upcoming}
          fallback={<ListSkeleton rows={5} />}
        >
          <UpcomingSection />
        </Section>

        <Section
          title="Active projects"
          slot={SLOT.projects}
          fallback={<ProjectCardsSkeleton count={4} />}
        >
          <ActiveProjectsSection />
        </Section>

        <Section
          title="Recent activity"
          slot={SLOT.activity}
          fallback={<TimelineSkeleton rows={5} />}
        >
          <ActivityFeed />
        </Section>

        <Section
          title="Productivity"
          slot={SLOT.productivity}
          fallback={<ChartSkeleton />}
        >
          <ProductivityCard />
        </Section>

        <Section
          title="Recent notes"
          slot={SLOT.notes}
          fallback={<ListSkeleton rows={5} />}
        >
          <RecentNotes />
        </Section>

        <Section
          title="Calendar"
          slot={SLOT.calendar}
          fallback={<CalendarSkeleton />}
        >
          <CalendarWidget />
        </Section>

        <Section
          title="Storage"
          slot={SLOT.storage}
          fallback={<StorageSkeleton />}
        >
          <StorageOverview />
        </Section>

        <Section
          title="System"
          slot={SLOT.system}
          fallback={<PanelSkeleton />}
        >
          <SystemStatus />
        </Section>
      </div>
    </div>
  );
}
