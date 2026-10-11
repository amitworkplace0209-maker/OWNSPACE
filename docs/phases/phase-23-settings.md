# Phase 23 — Settings

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Settings handled profile, appearance, preferences, pomodoro, export, and account. Four correctness issues remained: `daily_note_time: ""` broke preferences updates, export missed tables and filtered `user_preferences` by the wrong column, avatar upload triggered an unnecessary mount refresh, and saves gave no success feedback.

## Fixes

### `daily_note_time: ""` coerced to `null`
- `updatePreferencesAction` (`src/lib/actions/profile.ts`) now coerces an empty-string `daily_note_time` to `null` before writing to `user_preferences`. The `time` column rejects `""`, so empty inputs correctly clear the field instead of returning a DB error.
- `appearance-settings.tsx` and `preferences-settings.tsx` pass the raw value (including `""` when cleared); the action normalizes it.

### Export fixes (`src/lib/actions/export.ts`)
- `user_preferences` is now filtered by `user_id` instead of the non-existent `id` column. Previously this silently omitted `user_preferences` from exports (the PostgREST error matched the "42" skip condition).
- Added missing tables to the export list: `note_versions`, `wiki_versions`, `finance_categories`, `finance_transactions`, `gdrive_file_refs`.
- `gdrive_connections` is exported with OAuth tokens **redacted** (`select("user_id, email, scope, connected_at, updated_at")`) — `refresh_token` and `access_token` are excluded to prevent leaking plaintext secrets in the export JSON.

### Removed unnecessary mount refresh
- `profile-settings.tsx` replaced the `useEffect` that refreshed on every `avatarState` change (including the initial render) with a ref-based identity check (`avatarStateRef`). Refresh only fires when the `avatarState` object identity actually changes after an upload.

### Success feedback after save
- Added `data?: { id: string }` to `ProfileFormState`, `PomodoroSettingsFormState`, and `PrefsState` so actions signal success distinctly from the initial state.
- Client components (`profile-settings.tsx`, `preferences-settings.tsx`, `appearance-settings.tsx`, `pomodoro-settings.tsx`) now call `toast.success(...)` when `state.data` is set, using the existing `sonner` `<Toaster>` infrastructure.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- `src/lib/actions/settings.ts` does not exist; settings actions live in `profile.ts` and `time.ts`. Consider splitting if the settings surface grows.
- Export still uses `select("*")` — columns for newly-added tables are included automatically.
- Plaintext Google OAuth tokens remain a known concern in `gdrive_connections` (see carry-forward from earlier phases); this phase only redacted them in export.
