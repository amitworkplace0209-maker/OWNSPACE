# Phase 10 — Daily Notes

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The Daily planner already supported per-project daily notes (upsert/delete) and
time-block planning entries (create/delete) for a single selected date, with
prev/next/Today date navigation. This phase added week context, day stats, and
note editing.

## Changes

### Data window (`src/app/(app)/daily/page.tsx`)
- The page now fetches the **whole week** containing the selected date (Sunday
  start) instead of a single day, so the workspace can show which days have
  content. Display still filters to the selected date.
- Added a local `ymd()` formatter to avoid UTC day-shift when computing week
  boundaries.

### Week strip (`src/components/daily/daily-planner-workspace.tsx`)
- Full-width 7-day strip above the planner: clicking a day selects it; prev/next
  arrows move a week at a time; today is highlighted and the selected day is
  ringed.
- Each day shows a primary dot when a daily note exists and a sky dot when
  planning entries exist.

### Day stats
- The Plan header shows the number of blocks and total planned duration
  (derived from `start_time`/`end_time`).

### Edit daily note
- Each note row gains an **Edit** action that loads the note's project (locked)
  and content into the existing form; saving upserts on the
  `(user_id, project_id, note_date)` key, so it updates in place. A Cancel
  button exits edit mode.

No DAL/action/schema changes were required — the existing upsert and
`getDailyNotes`/`getPlanningEntries(from,to)` signatures already covered this.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- `updatePlanningEntryAction` exists but is still unwired; planning entries are
  currently create/delete only (tracked).
- Week/day math uses browser-local dates, consistent with the rest of the app;
  the timezone item in the Phase 0 audit remains open.