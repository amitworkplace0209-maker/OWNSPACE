# Dashboard

`/dashboard` is the app's command center. It answers four questions on sight —
*what do I do next*, *what's happening today*, *how are my projects*, *am I
keeping up* — and every value it shows is read from your own Supabase rows at
request time. There is no seeded, cached or illustrative data anywhere on this
page.

---

## Layout

The page is a single flat 3-column grid (`src/app/(app)/dashboard/page.tsx`),
not two nested columns. Each section carries a pair of `order-*` / `lg:order-*`
classes so its **mobile rank** and its **desktop slot** can be chosen
independently. The class names are written out literally because Tailwind only
generates utilities it can see in source.

### Desktop (≥1024px)

Wide sections declare `lg:col-span-2` and are interleaved with narrow ones in
`lg:order-*` sequence, so grid auto-placement fills every row: wide card on the
left two columns, narrow card in the right rail.

```
┌────────────────────────────────┬──────────┐
│ Today's work                   │ Focus    │
├────────────────────────────────┼──────────┤
│ Upcoming                       │ Projects │
├────────────────────────────────┼──────────┤
│ Recent activity                │ Product. │
├────────────────────────────────┼──────────┤
│ Recent notes                   │ Calendar │
├────────────────────────────────┼──────────┤
│ Storage                        │ System   │
└────────────────────────────────┴──────────┘
```

Above the grid: **header** (greeting, live clock, status chips, search, quick
add), **KPI row** (4 cards), **quick actions** (6 workflows).

### Tablet & mobile

Everything collapses to one column ranked 1→10:

header → KPIs → quick actions → Today's work → Upcoming → Focus → Active
projects → Productivity → Recent activity → Calendar → Recent notes → Storage →
System.

---

## Sections

| Section | Component | Data source |
| --- | --- | --- |
| Header | `dashboard/dashboard-header.tsx` | `getProfile`, `getTaskSummary`, `getProjectSummary`, `getAnalyticsSnapshot` |
| Quick actions | `dashboard/quick-actions.tsx` | static links (each targets a real `?new=1` workflow) |
| KPI row | `dashboard/kpi-cards.tsx` | `getProjectSummary`, `getAnalyticsSnapshot` |
| Today's work | `dashboard/todays-work.tsx` | `getTodayWork` |
| Upcoming | `dashboard/upcoming-panel.tsx` | `getUpcomingAgenda` |
| Focus | `dashboard/focus-card.tsx` | `getTasks({ completed: false })`, `getAnalyticsSnapshot` |
| Active projects | `dashboard/active-projects.tsx` | `getProjectHealthSummaries`, `getProjectSummary` |
| Productivity | `dashboard/productivity-card.tsx` | `getActivityTrend(14)` |
| Recent activity | `dashboard/activity-feed.tsx` | `getRecentActivity` |
| Recent notes | `dashboard/recent-notes.tsx` | `getRecentNotes` |
| Calendar | `dashboard/calendar-widget.tsx` | `getCalendarEvents` |
| Storage | `dashboard/storage-overview.tsx` | `getStorageStats`, `getGDriveStatus` |
| System | `dashboard/system-status.tsx` | browser + realtime channel |

### Today's work

The primary section (`lg:col-span-2`, accent edge). Four filter segments —
**Due today / Overdue / In progress / High priority** — backed by
`getTodayWork()`. Each row is a real task with an inline checkbox that calls
`setTaskStatusAction` (which revalidates `/dashboard`), a link to the task, a
priority badge, a due label and a More menu (open / edit / open project).

A completion bar above the list shows `computeTodayProgress` —
`{completed} / {total} tasks completed · {percent}%` — counted across every task
due today, completed ones included.

### Upcoming

Reminders, calendar events, task deadlines and milestones merged into one
chronological list by `getUpcomingAgenda`. Four bounded parallel queries, sorted
in memory, no per-item fetches. Items that are overdue, due soon or snoozed get
a tone badge; everything else shows its time.

### Active projects

Health chips come from `computeProjectHealth`, whose seven rules are documented
in `src/lib/dashboard-logic.ts`. Cards also show the current phase, a progress
bar, `{done}/{total} tasks`, a due countdown and an overdue count.

### Storage

Byte totals are computed from the `files` table by category, with a stacked bar
and a top-4 legend. The Google Drive line states the real connection state —
including when it is **not configured**.

### System

Connectivity (`useOnlineStatus`), realtime channel state
(`useDashboardRealtime`) and the PWA install button (`usePwaInstall`). Offline
is reported as a state, not as an error.

---

## Streaming & failure isolation

The page component is synchronous — it returns its skeleton tree immediately.
Each section is wrapped by a `Section` helper that stacks two boundaries:

- **`<Suspense>`** with a matching fallback from
  `dashboard/dashboard-skeletons.tsx`, so one slow query only ever delays that
  one card.
- **`<SectionErrorBoundary>`** (`dashboard/dashboard-error.tsx`), so one failing
  query degrades to a single broken card with a Retry instead of taking the page
  down. Retry calls `router.refresh()` because resetting a boundary alone would
  only replay the same failed RSC payload.

`dashboard/loading.tsx` covers the first paint of the route; the generic
`(app)/loading.tsx` is deliberately route-neutral because it serves every other
page.

---

## Themes

Light, Dark and AMOLED are first-class. AMOLED is a persisted fourth value in
`user_preferences.theme` (migration `013_amoled_theme.sql`), offered by both the
top-bar toggle and Settings → Appearance, and applied as a class on `<html>` by
next-themes (`themes={["light","dark","amoled"]}`).

All dashboard colours route through the `--success / --warning / --danger /
--info` semantic tokens (`src/components/dashboard/tone.tsx`), so indicators,
badges and status dots follow the active theme without a hardcoded colour ever
entering a component.

---

## Live updates

Migration `014_realtime_publication.sql` opts `tasks` and `notifications` into
the `supabase_realtime` publication. `useDashboardRealtime` subscribes to both
and calls `router.refresh()` with a 350 ms debounce, so a task completed in
another tab or a notification raised by a reminder sweep appears without a
manual reload. Delivery is best-effort: if realtime is unavailable the dashboard
behaves exactly as before, and the System card says so.

---

## Status

### Implemented

- Header with greeting, date, live clock, timezone and real status chips
- KPI row (active projects, due today, overdue, time tracked today)
- Quick actions — all six navigate to real create workflows (`?new=1`)
- Today's work with four segments, inline completion and real progress
- Merged Upcoming (reminders + events + deadlines + milestones)
- Focus card with a real task picker and `startPomodoroAction`
- Active projects with health, phase, countdown and task counts
- Productivity (14-day trend + summed totals)
- Recent activity, Recent notes, Calendar month grid, Storage, System status
- Per-section streaming with layout-accurate skeletons
- Light / Dark / AMOLED, all three verified against every dashboard token
- Realtime refresh for `tasks` and `notifications`

### Not implemented

| Item | Why |
| --- | --- |
| Pomodoro pause / resume | `pomodoro_sessions.status` is constrained to `running \| completed \| cancelled`; there is no paused state to resume into. The Focus card offers Start and links to `/time` for complete/cancel. |
| Offline **data** caching | Deliberate scope decision. The service worker caches the app shell and navigations only — there is no IndexedDB or SW data cache, so the System card says "changes can't be saved" rather than implying a sync queue. Offline is an indicator, not a sync engine. |
| Note categories | The `notes` table has no `category` column. Recent notes shows project + tags instead of inventing a taxonomy. |

### Requires configuration

| Item | Requirement |
| --- | --- |
| Google Drive status | `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Unconfigured, the Storage card states the gap inline instead of hiding it. |
| Realtime | Tables must be in the `supabase_realtime` publication — migration `014_realtime_publication.sql`, already applied to this database. |
| PWA install button | Only appears once the browser emits `beforeinstallprompt` (HTTPS or localhost, Chromium browsers, app not already installed). |
| Service worker | Registered by `components/providers/service-worker-register.tsx`; requires a production/HTTPS origin to control a scope. |

---

## Conventions

- **Dates are UTC.** `todayIsoDate()` returns `now.toISOString().slice(0, 10)`,
  matching every other `due_date` filter in the app (`getTasksDueToday`,
  `/tasks?due=today`, the analytics snapshot), so dashboard counts always agree
  with the pages they link to.
- **No invented trends.** `StatCard` only renders a `trend` when a genuine
  historical comparison exists; otherwise it takes `secondary` and `status`,
  which are derived from the current snapshot.
- **Pure logic lives in `src/lib/dashboard-logic.ts`** so it can be unit tested
  (`src/lib/dashboard-logic.test.ts`, 44 tests).

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (72 tests) |
| `npm run build` | PASS |
