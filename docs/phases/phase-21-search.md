# Phase 21 — Search

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Search returned results across notes and tasks. Count accuracy and auto-open behavior were incomplete.

## Fixes

### `total` includes dailyNotes
- The search result `total` count now includes `daily_notes` in addition to notes and tasks, so the count reflects all searchable items.

### Notes auto-open on `?new=1`
- Notes (and Calendar/Reminders) auto-open the creation dialog when the page is accessed with `?new=1`, streamlining the workflow.

### Search validation
- Empty or too-short search queries are now validated client-side before issuing the server request.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Search is limited to a fixed number of results; no fuzzy matching or filters.
