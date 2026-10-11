# Phase 2 — Dashboard

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The dashboard already existed with the core Phase 2 content (greeting + live
date, stat cards, due-today / overdue lists, upcoming events & reminders,
recent activity, active-project progress, recent notes). This phase closed the
gaps against the Overview spec and reused existing DALs rather than duplicating
data fetching.

## Changes

### Stats row (`src/app/(app)/dashboard/page.tsx`)
- The 4th card "Upcoming events" was replaced with **"Time tracked today"**
  (links to `/time`) using `getAnalyticsSnapshot().time.todayMinutes`. The
  events count is still visible via the badge added to the events card header.
- Cards now include a **count badge** on "Upcoming events & reminders"
  (`events.length + reminders.length`).

### Activity overview graph
- Added an **"Activity overview" card** rendering the existing
  `ActivityTrendChart` (recharts) with `getActivityTrend(14)` — the same trend
  shown on the Analytics page, now a 14-day default on the dashboard. Shows an
  `EmptyState` when the last 14 days are empty. Links through to `/analytics`.

### Focus-mode shortcut
- Added a **Focus card** in the right rail:
  - **"Start focus"** button → `/time` (one-click deep-work entry).
  - "Focus sessions today" and "Total focus time" mini-stats pulled from
    `getAnalyticsSnapshot().pomodoro`.
  - A "timer already running" callout when `time.onRunningTask` is true, and a
    hint that switches to "focus session in progress" when a pomodoro is live.

### Analytics snapshot
- `AnalyticsSnapshot.pomodoro` gained a `running: boolean` field (computed from
  `pomodoro_sessions` where `status = 'running'`) so the dashboard focus card
  can reflect an in-progress session without an extra query.

## Reused existing machinery (not rebuilt)
- `getAnalyticsSnapshot`, `getActivityTrend` (`src/lib/dal/analytics.ts`).
- `ActivityTrendChart` (`src/components/analytics/activity-trend-chart.tsx`).
- `ReminderSweep` (fires due reminders client-side), `ProjectsProgress`, the
  due-task rows, and all DALs from Phase 0's working implementation.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Notes / carry-forward
- The dashboard ties into the existing server-side `ReminderSweep`; no new
  client state added beyond the pre-existing components.
- Live-clock refresh on the dashboard intentionally remains server-rendered
  (accurate at request time) to avoid extra client timers; the /time workspace
  already provides a 1s live ticker where needed.