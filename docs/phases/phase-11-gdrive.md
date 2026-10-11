# Phase 11 — Google Drive

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

The G Drive page had a real OAuth connect/disconnect flow, real
`gdrive_file_refs` storage/removal, and a server-side download proxy — but the
browse/attach feature the copy promised was completely unwired, and the OAuth
flow could persist a permanently-broken connection.

## Fixes

### OAuth correctness (`src/app/auth/gdrive/callback/route.ts`, `src/lib/dal/gdrive.ts`)
- The callback no longer upserts a connection when Google returns **no refresh
  token**; it redirects with `?error=no_refresh` without persisting a row that
  could never mint tokens.
- Upsert failures now surface as `?error=store_failed`.
- `getGDriveStatus` reports `connected: false` when the server is not
  configured, so a stale row can no longer show a misleading "Connected" state.

### Feedback (`src/app/(app)/gdrive/page.tsx`, `gdrive-workspace.tsx`)
- The page now reads the OAuth `?connected`/`?error` outcome and shows a
  success or (friendly-mapped) error banner.
- All action failures (disconnect, remove ref, list, attach) are surfaced
  instead of being swallowed.

### Browse & link (new UI in `gdrive-workspace.tsx`)
- Wired the previously dead actions `listGDriveFilesAction`,
  `attachDriveFileAction`, and the `/api/gdrive/download` proxy.
- A Drive browser lists files/folders, supports folder navigation, a search
  box, root jump, and refresh.
- Each file can be opened in Drive, downloaded via the token-safe proxy, or
  **linked to a selected project**.

Remaining dead helpers (`resolveGDriveDownloadAction`, `getDriveFileDownloadUrl`,
`driveDownloadUrl`) are left in place as they are harmless; the browser uses the
proxy route directly.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Google OAuth tokens remain stored plaintext in `gdrive_connections`
  (Phase 0 audit item) — encrypting them is a later cross-cutting task.
- `getGDriveFileRefs` stays capped at 100 with no pagination.
- Attaching to tasks/notes is supported by the action but the UI currently
  targets projects.