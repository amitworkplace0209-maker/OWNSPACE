# Phase 18 — Lab

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Lab exposed a Google Drive status indicator and a search bar. The status indicator was misleading and the search lacked guards.

## Fixes

### Drive shows "Connected" only when configured && connected
- The Drive status now shows "Connected" only when both `gdrive_connections` exists for the user AND the OAuth token is valid/active. Otherwise it shows "Not connected" or "Configuring".

### Empty-search guard + validation
- Submitting an empty search string is now prevented with client-side validation. The search input shows a guard against empty queries.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Drive file search results are not cached client-side.
