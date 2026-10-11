# Phase 6 — Calendar

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The calendar already had a full month grid with prev/next/today navigation,
day selection, an agenda list for the selected day, and create/edit/delete
event dialogs (title, start/end, type, project, location, color, all-day,
description) with color-coded event types. This phase added a **week view**,
honored per-event custom colors, and widened the data window.

## Changes

### Week view (`src/components/calendar/calendar-workspace.tsx`)
- New **month ↔ week** toggle (persisted to `localStorage` under
  `ownspece:calendar:view`, restored via `requestAnimationFrame` to satisfy the
  repo lint rule and avoid hydration mismatch).
- Week view renders 7 day columns (Sun–Sat) for the week containing the
  selected date. Each column lists that day's events with a colored dot, title
  and time (or "All day"), highlights "today", and supports selecting the day
  (drives the agenda list below).
- Prev/next navigation now branches on the view: months in month view, ±7 days
  in week view; "Today" resets both. The header label reflects the range
  ("Feb 9 – Feb 15, 2026") in week view and the month otherwise.
- Per-day **Add** still opens the event dialog prefilled with the selected date.

### Custom event colors
- Event dots (month + week) and the agenda's vertical color bar now use the
  event's own `color` when set, falling back to the event-type color. The
  `eventStyle` helper centralizes this.

### Data window
- `CalendarPage` now pads the fetched range by one week on each side
  (`month-1-7` → `month+1-7`) so weeks that straddle a month boundary render
  completely without a second fetch. The month grid still filters to the
  displayed month via `relevant`.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Calendar continues to use local-time day bucketing via
  `toISOString().slice(0,10)` (pre-existing pattern); the timezone-skew item
  from the Phase 0 audit remains tracked for a later cross-cutting pass.
- Reminders remain their own workspace (linked from the dashboard); calendar
  events are intentionally separate objects.