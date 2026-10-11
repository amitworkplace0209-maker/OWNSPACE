# Phase 0 — Full Project Audit

Date: 2026-09-18
Scope: `C:\OWNSPACE` — run against commit `81ccf88` + current working tree.

## Summary

Ownspece is a **substantially built** Next.js 16 + Supabase personal project
operating system, not an empty scaffold. The app is feature-rich, compiles,
typechecks, lints, passes its 28 unit tests, and produces a clean production
build. The audit below documents exactly what exists, what is broken, and what
is missing so the remaining phases build on the working foundation instead of
replacing it.

## 1. Current architecture

| Layer | Technology | Status |
| --- | --- | --- |
| Framework | Next.js **16.3.4** (App Router, Turbopack) | Working |
| Language | TypeScript 5 | Working |
| UI | Tailwind CSS **v4** + `@base-ui/react` + shadcn-style block CSS | Working |
| Icons | lucide-react | Working |
| State | Server actions (`"use server"`) + `next/headers` | Working |
| Backend | Supabase (PostgreSQL, Auth, Realtime-in-range) | Working |
| DB access | `@supabase/ssr` server client (anon key + RLS), `cache()`d DALs | Working |
| Admin client | `@supabase/supabase-js` service role (`src/lib/supabase/admin.ts`) | **Dead code — no callers** |
| Storage | Supabase Storage, private bucket `ownspece-files`, per-user folders | Working |
| Proxy | `src/proxy.ts` (Next 16 renamed middleware) | Working |
| PWA | `manifest.ts` + `public/sw.js` + icons | Partial (see §7) |
| Feature folders | `src/components/*` (functional) + `src/features/*` (17 empty dirs) | Duplicate scaffolding |
| Docs | `README.md`, `ARCHITECTURE.md`, `ENVIRONMENT.md`, `CLAUDE.md`, root `*.md` | Stale; **no `docs/` tree** |

## 2. Current routes

| Route | Kind | Data | Status |
| --- | --- | --- | --- |
| `/` | marketing landing | none | Working |
| `/login` `/signup` | auth | auth actions | Working |
| `/auth/callback` | PKCE callback | auth | Working |
| `/auth/gdrive/callback` | OAuth callback | gdrive | Working |
| `/api/gdrive/download` | route handler | gdrive | Working |
| `/dashboard` | server page | DAL | Working (2 bugs, §5) |
| `/projects` `/projects/[id]` + `/phases` `/tasks` `/files` `/wiki` `/activity` | server pages | DAL | Working |
| `/tasks` `/tasks/[id]` | server pages | DAL | Working |
| `/notes` `/notes/[id]` | server pages | DAL | Working |
| `/calendar` `/reminders` `/notifications` | server pages | DAL | Working |
| `/daily` | server page | DAL | Working (timezone note, §5) |
| `/finance` `/gdrive` `/storage` `/lab` | server pages | DAL | Working (new, uncommitted) |
| `/files` `/wiki` `/tags` `/timeline` `/time` `/analytics` `/activity` `/archive` `/search` | server pages | DAL | Working |
| `/settings` `/profile` | server pages | DAL | Working, `force-dynamic` |
| `manifest.webmanifest`, `icon*`, `apple-icon` | metadata | — | Working |

Every workspace page calls `requireUser()` and DAL getters wrapped in `cache()`.
**No stub routes exist.**

## 3. Current features (functional)

- Auth: email/password sign in/up/out, PKCE callback, profile + preferences
  auto-seeding, `next`-param sanitization (open-redirect safe).
- Design: centralized tokens (`background`…`info` incl. `surface`/
  `surface-muted`), 3 themes, 9 accent presets, 7 background presets,
  6 card styles, 2 densities; persisted to `user_preferences` via
  `AppearanceManager`.
- App shell: collapsible icon-mode sidebar (tooltips only when collapsed),
  sticky topbar with global search + quick-create + notifications + theme,
  mobile bottom nav + sheet drawer, Ctrl+K command palette, Ctrl/Cmd+B
  sidebar toggle.
- Projects: CRUD, search/filter/sort, archive/restore, duplicate, grid/list/
  table views, project workspace with phases, tasks, files, wiki, activity.
- Tasks: CRUD, subtasks, dependencies (add/remove), comments, checklist
  system, tags, priorities, statuses, list/kanban/calendar views.
- Notes: CRUD, pin, tags, versions (snapshot on every update), rich editor.
- Daily notes + planning entries per project.
- Calendar: month/week/day/agenda views, events + reminders integrated,
  drag-on-agenda reschedule.
- Reminders: create/snooze/mark-dismissed; reminder sweep on dashboard
  (fires `notifications` rows when `remind_at` passes — idempotent).
- Notifications: read/unread center, mark-all-read, unread badge in sidebar/
  topbar.
- Files: upload to private storage via server action, preview, download
  (signed URL), delete, category breakdown, storage stats.
- Wiki: tree, page CRUD, versions, tags.
- Timeline (project + global), Time tracking (running timer, entries,
  manual entry), Pomodoro timer (focus/break counts stored), Analytics
  (snapshot + trend + per-project), Activity feed, Archive, Tags manager,
  Global search (projects/tasks/notes/files/reminders/wiki/activity).
- Finance (new): categories, transactions, overview, monthly breakdown,
  spending-by-category charts (recharts).
- G Drive (new): OAuth connect flow (server-side secrets, PKCE-style state
  cookie, token refresh), file listing/search/sign-out, attach-file refs to
  project/task/note, download proxy. **Disabled until `GOOGLE_CLIENT_ID` +
  `GOOGLE_CLIENT_SECRET` are set** — correctly gated.
- Storage (new): Supabase Storage usage dashboards + category filters.
- Lab (new): only working tools exposed (word/char counter, bullets↔tasks,
  hash, base64, JSON formatter, math, percent).
- PWA: manifest, icons, service worker with offline shell fallback.

## 4. Database (Supabase)

12 migrations (`001`–`012`). Tables: `profiles`, `user_preferences`, `tags`,
`projects`, `project_tags`, `project_phases`, `milestones`, `tasks`,
`task_dependencies`, `task_tags`, `task_comments`, `checklists`,
`checklist_items`, `notes`, `note_versions`, `note_tags`, `daily_notes`,
`planning_entries`, `calendar_events`, `reminders`, `notifications`,
`activities`, `wiki_pages`, `wiki_versions`, `wiki_tags`, `time_entries`,
`pomodoro_sessions`, `files`, `finance_categories`, `finance_transactions`,
`gdrive_connections`, `gdrive_file_refs`. Check constraints gate every enum.

RLS: enabled on **all** user tables. Helper functions `user_owns_project/phase/
task/checklist/note/wiki/tag` (security invoker) enforce parent ownership on
every child table and both sides of junction tables. Storage bucket
`ownspece-files` is private with per-user-folder select/insert/update/delete
policies (`ownspece_files_owner_*`). Gaps: see §6.

## 5. Existing problems (verified)

### Confirmed bugs
1. **`getProjectAnalytics` Promise.all misalignment** —
   `src/lib/dal/analytics.ts:211-220`. Seven queries are fired but only six
   results destructured; query 5 duplicates the tasks fetch, the `notes`
   count becomes `wikiRes`, and the real `wiki_pages` count is discarded.
   Result: per-project `notes` is always `0`, and `wikiPages` reports the
   **note** count. (Double tasks query cost too.)
2. **Unscoped count query** — `src/lib/dal/analytics.ts:49` `notesWeek` lacks
   `.eq("user_id", user.id)` (safe via RLS only; inconsistent with house rule).
3. **Wrong revalidation path** — `src/lib/actions/tasks.ts:331`
   `removeTaskDependencyAction` revalidates `/projects/${dependsOnTaskId}`
   (a task id in the project slot). The owning project is never revalidated.
4. **Dashboard due-task links point at the projects list** —
   `src/app/(app)/dashboard/page.tsx:37`. `DueTask` (`src/lib/dal/tasks.ts`)
   lacks `project_id`, so rows cannot link to the task or its project.
5. **Self-referential font token** — `src/app/globals.css:12`
   `--font-sans: var(--font-sans);` is circular; Geist is silently not applied
   (browser default fonts render). `--font-heading` inherits the broken value.
6. **Missing `--destructive-foreground` token** — used at
   `app-sidebar.tsx:139` and `topbar-inner.tsx:144`; the Tailwind class is a
   no-op → unread-count badges lose contrast (near-invisible in dark mode).
7. **Light background presets leak into dark mode** —
   `src/app/globals.css:393-409`. `:root[data-background=…]` overrides `.dark`
   when a dark-mode user has a light preset (reachable: single combined
   dropdown). Result: unreadable near-white-on-near-white UI.
8. **Stale theme clobber** — `appearance-settings.tsx` `persistAppearance`
   writes the *prop* `currentTheme`, so changing accent/card/density/background
   after a theme change reverts the stored theme to the stale value.
9. **Sonner Toaster theme** — `src/app/layout.tsx:62` renders `<Toaster>`
   outside `<ThemeProvider>` with no `theme` prop → always light toasts in
   dark mode.

### Latent / hardening issues
10. **Server-action body limits vs advertised upload sizes** —
    `actions/files.ts MAX_FILE_SIZE = 100 MB` and `profile.ts` 2 MB avatar
    exceed the 1 MB default server-action body limit and the ~10 MB proxy
    buffer (no `serverActions.bodySizeLimit` / `proxyClientMaxBodySize` set).
    Large uploads will be dropped before the action runs.
11. **Google OAuth tokens stored plaintext** — `gdrive_connections` keeps
    `refresh_token`/`access_token` at rest (RLS-scoped but unencrypted). A DB
    dump leaks long-lived refresh tokens. `GDriveConnection` type also omits
    `access_token` while DAL selects `*`.
12. **G Drive unavailable locally** — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
    not set in `.env.local` and not documented in `.env.example`. Gated
    correctly; UI shows a clean "not configured" state. **Not a fake feature.**
13. **No route-level `loading.tsx`, `error.tsx`, or `not-found.tsx`** — pages
    block on DAL queries with no skeleton; any unhandled Supabase error falls
    to the default Next error screen. `skeletons.tsx` + `PlaceholderPage`
    exist but are unused (dead code).
14. **Timezone skew** — "today"/overdue boundaries use UTC
    `toISOString().slice(0,10)` in `dal/tasks.ts:280,298`,
    `dal/analytics.ts:35`, `daily/page.tsx:18`, while pomodoro/analytics snap
    to local midnight elsewhere. Due-today/overdue buckets shift a day in
    non-UTC zones.
15. **`getSiteUrl()` trusts `x-forwarded-proto`/`x-forwarded-host`** for the
    signup email redirect URL (`auth/actions.ts:26-31`) — spoofable; prefer a
    fixed `APP_ORIGIN`/`SITE_URL` env.
16. **`proxy.ts` returns HTML redirects for unauthenticated `/api/*`** — API
    consumers get 307 → `/login` instead of JSON 401.
17. **Finance transaction RLS omits project ownership** —
    `finance_transactions_owner_all` checks `user_id` only, not
    `user_owns_project(project_id)` (all other project-scoped tables do).
18. **Timer/pomodoro action inputs not schema-validated** (`actions/time.ts`;
    project/task ids raw) and `setReminderStatusAction` snooze unbounded —
    contained by RLS, but inconsistent with the zod discipline used elsewhere.
19. **Unbounded aggregations** — `getProjectSummary`, `getWorkspaceStats`,
    `getFinanceOverview`, `getTaskSummary`, `getTasks` date filters fetch full
    rows and aggregate in JS instead of `head:true` counts / DB grouping.
20. **Activity gaps** — comment and checklist mutations never log activity;
    `createNoteAction` drops `project_id` from its activity row; finance logs
    use `entityType: "notification"` (should be its own facet).
21. **Manifest/viewport theme-color drift** — three different dark values
    (`#18181b` vs `#0a0a0a` vs `oklch(0.145…)`); `background_color` fixed
    light → white splash on dark installs; no `id` in manifest; no iOS meta
    tags; no push/notificationclick in `sw.js`; offline shell precaches the
    logged-out landing page.
22. **No CSP** for app pages (only `/sw.js`); missing `--danger-foreground`
    etc. (unused today); hardcoded `#000` logo gradient (`app-sidebar.tsx:69`).

### Duplicates / dead code
- `src/features/*` — 17 empty directories duplicating the
  `src/components/*` structure. Remove or wire.
- `src/lib/supabase/admin.ts` (`getAdminClient`) — no callers.
- `src/lib/supabase/client.ts` (browser client) — no importers.
- `src/lib/db`, `src/utils`, `src/app/api/backup`, `src/app/api/cron` —
  empty scaffolding.
- `PlaceholderPage`, `PageSkeleton`, `CardSkeleton` — unused.
- `SUPABASE_DB_URL` in `.env.local` — unused.

## 6. Security posture

- No client exposure of `SUPABASE_SERVICE_ROLE_KEY` (server-only, one file).
- Google OAuth secrets server-only; no `NEXT_PUBLIC_` variant.
- RLS strong (parent-ownership checks, junction both-sides), storage private.
- `next` param sanitized against open redirects; session cookie handling via
  `@supabase/ssr` with proxy refresh.
- Remaining: plaintext Drive tokens (§5.11), finance project-ownership RLS gap
  (§5.17), `getSiteUrl` trust of forwarded headers (§5.15), no CSP (§5.22),
  API auth returns redirect not 401 (§5.16).

## 7. PWA status

Manifest, icons (192/512 any+maskable), apple icon, production-only SW
registration, offline shell fallback, SW/manifest excluded from the auth proxy
(correct — installable for logged-out visitors). Gaps: no push/notification
support, offline shell is the marketing page (not the app), no data cache,
theme-color drift, missing iOS meta tags, unbounded navigation cache growth.

## 8. Missing features (vs. target)

- Route-level loading/error/not-found boundaries (biggest papercut).
- Browser/PWA push notification delivery (DB notifications exist; delivery
  layer does not — do not fake it; expose only implemented channels).
- Backups: JSON/CSV/ZIP export + restore (only a partial JSON export server
  action exists; no restore).
- Passkeys / WebAuthn foundation (sign in/up/out only; no reset-password
  flow at all).
- Email notification channel (not configured; must be gated).
- Google Calendar / GitHub integrations (future, per plan).
- Finance trading (explicitly future scope — correctly absent).

## 9. Recommended implementation order (real build plan)

1. **Phase 1 (shell + design)**: fix §5 bugs 5–9 (tokens, font, backgrounds,
   appearance persistence, toaster); add loading/error/not-found boundaries;
   add `--destructive-foreground`; align manifest/viewport theme colors;
   remove dead `src/features/*` dirs and dead code; optional typing of upload
   body limits (`next.config.ts` `serverActions.bodySizeLimit`).
2. **Phase 2 (dashboard)**: bug 4 (due-task links), add countdown widget +
   current time, storage/project/task health widgets using existing stats.
3. **Data-layer hardening across later phases**: bugs 1–3, 10, 12–14, 17–20
   (analytics destructure, scoping, revalidation, validation, timezone,
   finance ownership RLS, activity logging, aggregation).
4. **Security**: encrypt Drive refresh token at rest (or store a note + key
   rotation guidance), `APP_ORIGIN`, JSON 401 for `/api/*`, page CSP.
5. **PWA (phase 27)**: push/notificationclick, data cache, adaptive theme
   color, iOS meta.
6. **Settings**: backups/export(+/restore), WebAuthn foundation.
7. **Docs**: `docs/` tree — per-page, per-phase, architecture, UI.
8. **Testing**: load all routes, exercise CRUD, verify console clean.

## 10. Verification baseline

- `npm run typecheck` — PASS
- `npm run lint` — PASS
- `npm test` — 2 files, 28 tests PASS
- `npm run build` — PASS (33 routes, proxy active)
- Known runtime bugs at audit time: listed in §5 (verified by reading source).

The next phase (Phase 1) begins from this baseline: the shell and design
system are strong but have specific, verified defects that must be fixed
before feature work continues.