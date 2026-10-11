# Phase 14 — Files

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

The files workspace handled uploads, downloads, deletes, and a metadata list, but several error paths were silent and the list had no client-side search/filter. This phase hardened error surfacing and added local filtering.

## Fixes

### Download/delete error surfacing
- Download and delete failures now surface in the UI (inline banner / toast) instead of failing silently. The `friendlyError` helper is used consistently.

### Upload input reset
- After a successful upload, the file input is reset so re-selecting the same file triggers `onChange` again.

### Client-side search/filter
- Added a name-filter input; the list filters locally by file name. The header reflects the active filter.

### 200-row limit
- The metadata list is capped at 200 rows to avoid unbounded client rendering.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- No server-side pagination — list remains capped at the most recent 200 matched rows.
