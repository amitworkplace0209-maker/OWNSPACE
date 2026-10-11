# Phase 13 — Finance

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Finance already tracked real, user-scoped categories and transactions with
overview aggregates, a 6-month income/expense chart, and a spending-by-category
breakdown. This phase fixed correctness bugs and closed create/edit gaps.

## Fixes

### Stale category on type toggle (`finance-workspace.tsx`)
- The category selector was uncontrolled and filtered by the income/expense
  toggle, so switching type could submit a category id belonging to the other
  type. It is now a **controlled native `<select>`** that resets whenever the
  type changes, so a mismatched id can never be submitted.

### Transaction editing + project/tags
- Wired the previously dead `updateFinanceTransactionAction` (now returns the
  saved id so the dialog can close) via an **Edit** action on each row.
- The dialog now has a **Project** picker and a **Tags** input, both already
  supported by `financeTransactionSchema` but previously unreachable.
- Default date now uses local time (`ymd(new Date())`) instead of UTC, so users
  behind UTC no longer default to tomorrow.

### Safe deletes
- Transaction and category deletes go through a **confirm dialog** and surface
  server errors (e.g. deleting a category still in use) in a banner instead of
  failing silently.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- `updateFinanceCategoryAction` still does not exist; categories remain
  create/delete only.
- The transaction list is still the most recent 60 with no in-UI filters
  (`getTransactions` supports them server-side).
- Finance still lacks `user_owns_project` enforcement at the RLS layer (Phase 0
  audit item).