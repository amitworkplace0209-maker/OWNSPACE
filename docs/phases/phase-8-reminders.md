# Phase 8 — Reminders

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The Reminders workspace already supported creating/editing reminders (title,
remind time, project, task, note), deleting them, and snoozing/dismissing
pending ones. This phase added scoping, richer snooze options, restore, and
overdue emphasis.

## Changes (`src/components/reminders/reminders-workspace.tsx`)

### Scope tabs
- Segmented tabs **Upcoming / Overdue / Done / All** with live counts.
- `upcoming` = pending or snoozed with `remind_at >= now`; `overdue` = pending
  or snoozed in the past; `done` = triggered or dismissed.
- Empty states are scope-aware.

### Overdue emphasis
- Overdue reminders get a destructive border, destructive bell chip, and an
  explicit "Overdue" label.
- `now` is resolved in a mount effect via `requestAnimationFrame` so the server
  and first client render agree (no hydration mismatch) and the repo
  `react-hooks/set-state-in-effect` rule is satisfied.

### Snooze & restore
- Pending reminders offer **Snooze 10m**, **1h**, and **Tomorrow (9am)**
  (computed client-side into minutes for the existing
  `setReminderStatusAction`).
- Done reminders offer **Restore** (back to `pending`).

No DAL/action changes were required — `getReminders` already returns all
statuses and `setReminderStatusAction` already validates the four statuses.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Reminders are surfaced on the dashboard via `getUpcomingReminders`; client-side
  scoping here does not affect that query.
- Push/OS notifications for reminders remain out of scope (the service worker
  still lacks `push`/`notificationclick` handlers — tracked from Phase 0).