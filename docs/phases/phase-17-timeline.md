# Phase 17 — Timeline

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Timeline rendered task items sorted by date. This phase fixed mutating sort behavior, corrected date handling to local time, bounded navigation, and exported a label helper.

## Fixes

### Non-mutating sort
- Sorting no longer mutates the original data array. A new sorted array is derived, preserving the source order.

### Local dates (`localDateStr`)
- Date strings now use `localDateStr` to format dates in the user's local timezone instead of UTC, preventing off-by-one shifts for users not on UTC.

### Bounded navigation (prev/next disabled at data edges)
- The prev/next navigation buttons are disabled when at the first or last item, preventing empty-page navigation.

### `statusLabelOf` for raw enums
- Exported `statusLabelOf` so raw status enums (e.g. task status) are mapped to human-readable labels consistently across the app.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Timeline items are loaded in fixed pages (no cursor-based pagination).
