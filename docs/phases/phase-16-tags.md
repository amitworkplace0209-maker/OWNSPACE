# Phase 16 — Tags

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Tags supported create, edit, and delete. Two correctness issues remained: the edit dialog did not close after saving, and the color picker accepted invalid values.

## Fixes

### Dialog closes on save
- `updateTagAction` now returns `{ data: { id } }` on success (previously returned `{}`). The `useEffect` watching `state.data` in `tags-workspace.tsx` detects this and calls `onDone()`, closing the dialog.

### Hex-only color input
- The color picker now enforces hex-only input via validation, preventing invalid color strings from being persisted.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Tag usage counts are computed client-side; a server-side aggregation endpoint exists but is not wired to the UI.
