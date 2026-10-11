# Phase 5 — Tasks

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

Tasks were already extensively implemented: list with status/due filters and
search, quick done-toggle, create/edit dialog, and a rich detail page with
comments, checklists, tags, dependencies (with cycle protection), subtasks,
priority and progress controls, plus file attachments. This phase added the
remaining spec items — a **priority filter** and a **Kanban view** — and
completed the status filter set.

## Changes

### Priority filter
- New segmented control on the tasks toolbar (Priority / None / Low / Medium /
  High / Urgent). It round-trips through the URL (`?priority=…`), composes with
  the existing status / due / project filters, and is applied both server-side
  in `getTasks` (`PRIORITIES` validation in `TasksPage`) and client-side in the
  workspace so the visible list stays consistent.
- `TasksPage` now validates a `priority` search param and passes it through as
  `initialPriority`.

### Kanban view (`src/components/tasks/tasks-workspace.tsx`)
- New list ↔ kanban toggle (persisted to `localStorage` under
  `ownspece:tasks:view`, restored via `requestAnimationFrame` in the mount
  effect to satisfy the repo lint rule and avoid hydration mismatch).
- Kanban renders five columns by status (Backlog / To do / In progress / Done /
  Cancelled), each with a live count. Cards show title (strikethrough when
  done), project, priority badge and due date, a quick complete toggle, and a
  per-card **status select** for moving tasks between columns
  (`setTaskStatusAction` + `router.refresh`). Read-only (project context)
  hides the move control.

### Status filter completeness
- Backlog was missing from the list-view status filter tabs; it's now included
  alongside the existing All / To do / In progress / Done / Cancelled tabs, so
  the status tabs and the Kanban columns have identical statuses.

## Reused existing machinery
- `setTaskStatusAction` / `deleteTaskAction` (`src/lib/actions/tasks.ts`),
  `getTasks` priority/due/status options (`src/lib/dal/tasks.ts`),
  `isOverdueDate` / `formatDateShort`, and the shared badge components.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Kanban is deliberately drag-and-drop-free (column moves go through the status
  select) to avoid a new DnD dependency; a dnd-kit upgrade can layer on top of
  this view later if desired.