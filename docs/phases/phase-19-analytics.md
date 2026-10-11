# Phase 19 — Analytics

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Analytics displayed aggregated counts and trends. Several NaN/infinite-value bugs and layout issues remained.

## Fixes

### NaN guards (`?? 0`)
- Aggregation computations that could produce `NaN` (e.g. empty data) now fall back to `?? 0`, preventing `NaN` from propagating into charts and counters.

### Empty-state on By-project table
- The "By-project" breakdown table now shows an empty state when no projects exist, instead of a broken table.

### Local `todayStr` in DAL
- The DAL now computes `todayStr` in local time instead of UTC, so daily aggregations align with the user's local date.

### Local day buckets in trend
- Trend day buckets are now computed in local time, matching `todayStr`.

### Grid fix (2→1→4 cols)
- Responsive grid corrected from a broken 2-column layout to a proper 1-column on mobile → 4-column on desktop progression.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Trend data is capped at the most recent N days; no historical range selector.
