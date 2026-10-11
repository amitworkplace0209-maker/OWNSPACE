# Phase 3 — Projects

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The projects feature already existed with a solid foundation (status tabs,
tag filters, search, grid cards, create/edit dialog, rich detail page with
overview / tasks / phases / files / wiki / activity tabs). This phase filled
the remaining spec gaps — grid/list switching, per-status counts, and sorting —
and refactored the card's duplicated action menu.

## Changes

### Grid ↔ list view toggle (`src/components/projects/projects-workspace.tsx`)
- New toolbar toggle (`LayoutGrid` / `List` icon buttons) switches between the
  existing 3-column grid and a new compact **list view**.
- The chosen view is persisted to `localStorage` (`ownspece:projects:view`) and
  restored on next visit. Restoration is applied via `requestAnimationFrame`
  inside the mount effect — satisfies the repo's
  `react-hooks/set-state-in-effect` lint rule and avoids hydration mismatch.
- List rows show: project icon + name + description, tags (desktop), a mini
  progress bar, status/priority badges, due-date (with "Overdue" state), and
  the same action menu.

### Sort control
- Native select added to the toolbar: **Recent / Name / Due date / Priority**.
  Sorting is client-side against the full project list (`recent` = default
  `created_at desc` order from the DAL).

### Status count badges
- Every status tab now shows a live count (e.g. "Active 12"), computed from the
  project list. To keep counts accurate, `ProjectsPage` now fetches all
  projects (`getProjects()`) and filtering happens client-side — the `status`
  search param still drives the initial tab selection via `initialStatus`.

### Refactor: shared action menu
- Extracted the per-card dropdown (edit / status transitions / delete) into a
  reusable `ProjectActions` component used by both the grid card and the list
  row. Added a `ProjectIcon` and `DueLabel` helper for consistent rendering.
- List-view overdue detection reuses the existing "Overdue"/"Due" convention
  already used elsewhere.

## Housekeeping

- `ProjectsPage` no longer double-filters server-side + client-side; the page
  is a single source of truth (fetch all → workspace filters/sorts).

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Open items carried forward

- Per-project task/phase progress syncing is handled by existing actions; the
  project's `progress` value is recomputed server-side when tasks/phases
  change (unchanged this phase).
- Archived projects remain hidden from selectors (existing `getActiveProjects`
  behavior) while still browsable via the Archived tab.