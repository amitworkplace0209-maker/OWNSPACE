# Ownspece UI/UX Redesign — Phase 0: Full Audit

## Project Overview

**Ownspece** — Personal Project Operating System
- **Frontend**: Next.js 16.3.4 + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui
- **Backend**: Supabase PostgreSQL
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage + Google Drive integration
- **PWA**: Service worker + manifest, standalone mode
- **Charts**: Recharts + custom finance charts
- **Date handling**: date-fns

---

## 1. Existing Pages Inventory

| Route | File | Group | Status |
|------|------|-------|--------|
| `/` | `src/app/page.tsx` | — | Home/unauthenticated |
| `/dashboard` | `src/app/(app)/dashboard/page.tsx` | Main | Working |
| `/projects` | `src/app/(app)/projects/page.tsx` | Workspace | Working |
| `/tasks` | `src/app/(app)/tasks/page.tsx` | Workspace | Working |
| `/calendar` | `src/app/(app)/calendar/page.tsx` | Main | Working |
| `/reminders` | `src/app/(app)/reminders/page.tsx` | Main | Working |
| `/notifications` | `src/app/(app)/notifications/page.tsx` | Main | Working |
| `/notes` | `src/app/(app)/notes/page.tsx` | Workspace | Working |
| `/daily` | `src/app/(app)/daily/page.tsx` | Workspace | Working |
| `/gdrive` | `src/app/(app)/gdrive/page.tsx` | Workspace | Partially working (requires env vars) |
| `/storage` | `src/app/(app)/storage/page.tsx` | Workspace | Working |
| `/finance` | `src/app/(app)/finance/page.tsx` | Workspace | Working |
| `/files` | `src/app/(app)/files/page.tsx` | Workspace | Working |
| `/wiki` | `src/app/(app)/wiki/page.tsx` | Workspace | Working |
| `/tags` | `src/app/(app)/tags/page.tsx` | Workspace | Working |
| `/timeline` | `src/app/(app)/timeline/page.tsx` | Workspace | Working |
| `/lab` | `src/app/(app)/lab/page.tsx` | Tools | Working |
| `/time` | `src/app/(app)/time/page.tsx` | Tools | Working |
| `/analytics` | `src/app/(app)/analytics/page.tsx` | Tools | Working |
| `/activity` | `src/app/(app)/activity/page.tsx` | Tools | Working |
| `/search` | `src/app/(app)/search/page.tsx` | Tools | Working |
| `/archive` | `src/app/(app)/archive/page.tsx` | System | Working |
| `/settings` | `src/app/(app)/settings/page.tsx` | System | Working |

---

## 2. Existing Components

### Layout
- `src/components/layout/app-sidebar.tsx` — Collapsible sidebar with navigation groups
- `src/components/layout/topbar.tsx` — Topbar wrapper (currently minimal)
- `src/components/layout/topbar-inner.tsx` — Not fully read, needs inspection
- `src/components/layout/mobile-bottom-nav.tsx` — Bottom nav with "More" drawer
- `src/components/layout/user-menu.tsx` — User profile dropdown
- `src/components/layout/command-palette.tsx` — Quick create/search

### Pages / Workspaces
- `src/components/dashboard/reminder-sweep.tsx` — Runs once on dashboard mount
- `src/components/dashboard/projects-progress.tsx` — Dashboard stat visualization
- `src/components/analytics/activity-trend-chart.tsx` — Recharts activity trend
- `src/components/gdrive/gdrive-workspace.tsx` — Full Google Drive browser/manager
- `src/components/notifications/notifications-workspace.tsx` — Notification center
- `src/components/reminders/reminders-workspace.tsx` — Reminder management
- `src/components/settings/appearance-settings.tsx` — Theme/customization panel
- `src/components/settings/profile-settings.tsx` — Profile editor
- `src/components/settings/export-data.tsx` — Data export

### Shared
- `src/components/shared/page-header.tsx` — Page title + description + actions
- `src/components/shared/empty-state.tsx` — Empty state UI
- `src/components/shared/form-field.tsx` — Form label + input wrapper
- `src/components/shared/confirm-dialog.tsx` — Confirmation dialog

### UI Components (shadcn/ui)
- Buttons, cards, inputs, dialogs, dropdown menus, badges, avatars, sidebars, etc.

---

## 3. Existing Theme System

### Configuration (`src/config/appearance.ts`)
- **Accent colors**: indigo, violet, blue, cyan, emerald, teal, rose, orange, amber
- **Card styles**: default, elevated, soft, outline, glass, compact
- **Density**: comfortable, compact
- **Light backgrounds**: clean, soft, tinted, contrast
- **Dark backgrounds**: deep, slate, charcoal

### User Preferences (`user_preferences` table)
- `theme`: light | dark | system (default: system)
- `default_view`: dashboard | projects | tasks | calendar | wiki (default: dashboard)
- `accent_color`: one of 9 colors (default: indigo)
- `card_style`: one of 6 styles (default: default)
- `density`: comfortable | compact (default: comfortable)
- `background_preset`: light/dark variants (default: clean)

### Theme Application
- `AppearanceManager` applies data attributes to `<html>`:
  - `data-accent`, `data-card-style`, `data-density`, `data-background`
- `next-themes` handles the `class` attribute for light/dark/css custom properties
- CSS in `globals.css` maps data attributes to design tokens

**Current issue**: The theme system exists but the visual execution is basic — cards all look similar, no real depth variation, accent color only affects a few elements.

---

## 4. Existing Problems

### Visual/UI
1. **Too black/plain** — Dark mode uses pure black backgrounds everywhere
2. **Cards look identical** — No hierarchy (stat card vs project card vs task card)
3. **Basic admin-screen layout** — Pages lack modern premium productivity app feel
4. **Inconsistent spacing** — No unified spacing scale
5. **Excessive white/black contrast** — Harsh contrasts in dark mode
6. **Random colors/borders** — No semantic color usage

### Functionality
7. **Google Drive not working** — Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars; currently shows "Not configured" state
8. **Multiple Google accounts** — Code structure supports it but not tested/verified
9. **Local/offline data** — No IndexedDB implementation; data only exists in Supabase
10. **Supabase ↔ local sync** — No sync architecture; offline changes would be lost
11. **Reminders** — Functional but basic; no real notification engine, just in-app
12. **Notifications** — Database-backed but no browser push integration
13. **Charts** — Recharts uses CSS vars but theme doesn't fully cascade; dark mode readability issues
14. **Loading states** — Inconsistent; some pages block until all data loads
15. **Empty/loading/error states** — Present but basic, not designed as part of unified system

### Architecture
16. **No offline capability** — No IndexedDB, no sync queue, data lost when offline
17. **No conflict handling** — No strategy for concurrent updates
18. **N+1 query risk** — Some pages fetch data independently without pagination
19. **Hydration mismatch risks** — Client-side effects depend on Supabase data that may not be ready
20. **Google OAuth secrets** — Code references client-side env vars; needs server-side secure storage

### Performance
21. **Dashboard blocks on all widgets** — `Promise.all` waits for everything before rendering
22. **No debounced search** — Search may fire on every keystroke
23. **Duplicate data fetching** — Multiple pages fetch similar data independently

---

## 5. Google Drive Status

### Current Implementation
- **OAuth flow**: `src/lib/gdrive.ts` — checks configured, builds auth URL, exchanges code, refreshes token
- **Token storage**: Supabase `gdrive_connections` table (refresh_token, access_token, email, scope, expires_at)
- **File browsing**: `src/components/gdrive/gdrive-workspace.tsx` — list files, search, filter, link to projects/tasks/notes
- **File referencing**: `gdrive_file_refs` table links Drive files to projects/tasks/notes
- **API endpoints**: `src/lib/actions/gdrive.ts` — server actions for auth, disconnect, list, attach

### Status: **REQUIRES CONFIGURATION**
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` must be set in `.env.local`
- Without these: shows "Not configured" state, Drive browsing disabled
- With these: full functionality available

### Critical Requirements
- Never expose OAuth secrets to client
- Use server-side secure storage (already done via Supabase)
- Refresh token handling where supported
- Multiple account support structure exists

---

## 6. Local Storage Status

### Current
- `localStorage` used only for small preferences (via `user_preferences` table)
- No IndexedDB implementation
- No offline data persistence
- No sync architecture

### Required
- **IndexedDB** as primary offline persistence
- Local data: recent projects, tasks, notes, daily notes, calendar, reminders, settings, cached file metadata, recent search results
- Sync queue: LOCAL → SYNC QUEUE → SUPABASE → SYNC RESULT → LOCAL CACHE
- Offline capable: view cached data, create tasks, edit notes, create reminders, update checklists, view projects
- Show sync status: Online / Offline / Syncing / Synced / Sync Error

---

## 7. Supabase Status

### Schema: **12 migrations complete**
Tables: profiles, user_preferences, tags, projects, project_tags, project_phases, milestones, tasks, task_dependencies, task_tags, task_comments, checklists, checklist_items, notes, note_versions, note_tags, daily_notes, planning_entries, calendar_events, reminders, notifications, activities, wiki_pages, wiki_versions, wiki_tags, time_entries, pomodoro_sessions, files, gdrive_connections, gdrive_file_refs, finance_categories, finance_transactions

### RLS: **Enabled on all new tables**
- `user_owns_profiles()`, `user_owns_projects()`, `user_own_tasks()`, etc.
- Service-role access must remain server-only

### Issues
- Some tables may have RLS gaps (verify each)
- Finance and GDrive tables added in migration 012 — verify RLS policies
- `set_updated_at()` trigger handles auto-timestamps

---

## 8. PWA Status

### Service Worker (`public/sw.js`)
- Cache-first for assets, network-first for navigations
- Precaches: `/`, `/manifest.webmanifest`, `/icon-192x192.png`, `/icon-512x512.png`
- Install/activate cleanup of old caches

### Web Manifest (`src/app/manifest.ts`)
- Name, short name, description, start_url="/", display="standalone"
- Background color: `#ffffff`, theme color: `#18181b`
- Icons: 192x192 and 512x512 (regular and maskable)

### Assets: `/public/` has icons and sw.js

**Status: Partial working** — Manifest and service worker in place, but:
- No push notifications
- No notification click handling
- No offline fallback page
- Assets don't redirect to login (verified via `src/proxy.ts`)

---

## 9. Data Architecture

### Current Flow
- Server Components fetch from Supabase via DAL
- Client Components use hooks/state for local UI state
- No IndexedDB layer
- No sync queue
- No offline cache

### Required Architecture
```
LOCAL (IndexedDB)
  ↓ sync queue
SYNC QUEUE
  ↓
SUPABASE (cloud)
  ↓ sync result
LOCAL CACHE
```

---

## 10. Critical Root Causes to Fix

1. **Hydration mismatch** — Client-side effects depend on data that may hydrate differently
2. **Excessive `Promise.all` on dashboard** — Blocks rendering until all widgets load
3. **Google Drive requires env vars** — Must report "REQUIRES CONFIGURATION" clearly
4. **No semantic color system** — Colors used randomly instead of thematically
5. **Pure black dark mode** — Must use layered surfaces, not `#000000` everywhere
6. **Card hierarchy missing** — All cards look the same
7. **No conflict handling** — Concurrent updates can silently overwrite
8. **No offline support** — Data lost when connection drops

---

## 11. Recommended Implementation Order

1. **Phase 0 (complete)**: Audit — this document
2. **Phase 1**: Global design system — color tokens, theme architecture, card hierarchy
3. **Phase 2**: Topbar + Sidebar + Mobile navigation redesign
4. **Phase 3**: Dashboard — independent widget loading, premium stat cards
5. **Phase 4**: Projects + project workspace — banner cards, hover actions, contextual menus
6. **Phase 5**: Tasks + checklist — card redesign, Kanban view, hover actions
7. **Phase 6**: Notes + daily notes + planning — document editor UI, date navigation
8. **Phase 7**: Calendar + reminders + notifications — modern calendar, functional reminders
9. **Phase 8**: Storage + files — Supabase + Google Drive distinction, modern file browser
10. **Phase 9**: Google Drive real integration — OAuth flow, multiple accounts, file linking
11. **Phase 10**: Finance — modern dashboard, real charts
12. **Phase 11**: Wiki + tags + timeline — documentation UI, tag management, visual timeline
13. **Phase 12**: Time + analytics + activity — time tracking, productivity metrics
14. **Phase 13**: Search + archive — universal search, offline-capable
15. **Phase 14**: Advanced settings + appearance — LIVE PREVIEW, persist preferences
16. **Phase 15**: Local IndexedDB + offline sync — core offline architecture
17. **Phase 16**: PWA + push — offline fallback, push notifications
18. **Phase 17**: Performance optimization — lazy loading, code splitting, query optimization
19. **Phase 18**: Full responsive/mobile redesign — all breakpoints
20. **Phase 19**: Accessibility + security audit — a11y, RLS, secrets exposure
21. **Phase 20**: Full application testing — all pages, all modes, all devices

---

## 12. Files Created
- `docs/UI_REDESIGN_AUDIT.md` — This audit document

---

Next: Phase 1 — Redesign the global design system with semantic color tokens, proper theme architecture, and card hierarchy.