# Phase 22 — Archive

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Archive provided restore and delete for archived items. Error surfacing and race conditions remained.

## Fixes

### Restore/delete error surfacing
- Archive restore and delete operations now surface server errors in the UI (inline banners / toasts) instead of failing silently.

### Delete button disabled={pending}
- The delete button is disabled while the delete action is pending, preventing double-submits and race conditions.

### `startTransition` for delete
- The delete action now wraps state updates in `startTransition` so the UI stays responsive during the server action, and pending states are managed correctly.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Archive list is capped at a fixed number of rows; no pagination.
