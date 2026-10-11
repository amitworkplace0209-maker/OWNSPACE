# Phase 12 — Storage

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Storage already computed real, user-scoped aggregates from the `files` table
(bytes, file count, per-category breakdown). The problem was a mismatch: the
category cards counted **all** files while the list only loaded the 60 most
recent, so a category could claim 500 files yet show almost none when selected.

## Changes

### Accurate category filtering (`src/lib/dal/storage.ts`)
- `getCategorizedFiles` now accepts an optional `category`. Because the category
  is derived in JS (mime/extension), a category request loads rows before
  filtering, then applies the limit to the matched set. Non-filtered requests
  keep the efficient DB-side limit.

### URL-driven filter + search (`src/app/(app)/storage/page.tsx`, `storage-workspace.tsx`)
- The selected category is now a `?category=` search param validated against
  `storageCategoryOrder`, fetched server-side, and shareable/bookmarkable.
- Added a **name filter** input; the list header reflects the active category.
- Empty states are category-aware.

This removes the misleading "count vs. list" discrepancy entirely.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- The list is capped at 200 matched rows; there is still no pagination.
- Per-row download/preview/delete is not offered here (use `/files`); tracked.