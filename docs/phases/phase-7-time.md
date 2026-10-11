# Phase 7 — Time

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The Time workspace already provided a live timer (start/stop with elapsed
readout), manual time logging, pomodoro sessions (start/complete/cancel with
recent history), and a recent-entries list with delete. This phase added
accurate aggregate totals and filtering over entries.

## Changes

### Summary strip (`src/lib/dal/time-files.ts`, `src/app/(app)/time/page.tsx`)
- New `getTimeSummary()` DAL helper: server-side aggregation of
  `duration_minutes` into **today**, **this week** (Sunday-start) and **this
  month** totals. It fetches only entries since the earliest of the week/month
  boundaries and sums in JS, avoiding an unbounded scan.
- `TimePage` fetches the summary in parallel with the rest and passes it down.

### Workspace (`src/components/time/time-workspace.tsx`)
- Three summary cards (Today / This week / This month) render above the
  timer/pomodoro grid.
- **Project filter** on the Time entries card: filters the visible list and
  recomputes the "logged in view" total for the selected project.

Note: the summary totals are exact even when the visible list is capped at the
50 most recent entries; the in-view total reflects the filtered list.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Running timers contribute 0 to the summary until stopped (their
  `duration_minutes` is finalized on stop); the live elapsed time is shown in
  the Timer card.
- Week boundaries use the server/browser local time (Sunday start), consistent
  with the rest of the app; the timezone item in the Phase 0 audit remains
  open for a later cross-cutting pass.