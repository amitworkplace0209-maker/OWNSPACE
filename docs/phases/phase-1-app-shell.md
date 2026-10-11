# Phase 1 — App Shell + Design System

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓, runtime smoke tests ✓).

## Scope

Phase 1 hardened the application shell and centralized design system. The
shell was already strong (collapsible icon sidebar, sticky topbar, mobile
bottom nav + drawer, Ctrl+K command palette, persisted appearance
preferences), so this phase fixed the verified defects from
[phase-0-audit.md](./phase-0-audit.md) rather than rewriting working code.

## Fixes applied

### Design tokens (`src/app/globals.css`)
- **Font** — `--font-sans` / `--font-heading` self-reference
  (`var(--font-sans)` → itself) fixed to resolve to `--font-geist-sans`. The
  Geist font now actually renders instead of silently falling back to browser
  defaults.
- **`--destructive-foreground`** — added to `:root` and `.dark` plus the
  `@theme inline` mapping (`--color-destructive-foreground`). Unread-count
  badges (`bg-destructive text-destructive-foreground` on the sidebar and
  topbar) now have proper contrast — previously invisible in dark mode.
- **Light background presets** (`soft`, `tinted`, `contrast`) are now guarded
  with `:root:not(.dark)[data-background=…]` so they can never bleed into dark
  mode (the dark presets are separately scoped to `.dark[…]`).

### Theming persistence & application
- **`AppearanceManager`** (`src/components/providers/appearance-manager.tsx`)
  now also syncs the persisted account `theme` into `next-themes` on mount, so
  returning users get their saved theme on any device (previously the DB value
  was only displayed in settings). Data attributes are applied in a layout
  effect to avoid a flash of the default accent.
- **`appearance-settings.tsx`** — stale-theme clobber fixed. The component now
  tracks the user's latest theme in local state (`selectedTheme`) instead of
  re-writing the stale `currentTheme` prop whenever accent/card/density/
  background is changed.
- **`updatePreferencesAction`** (`src/lib/actions/profile.ts`) — switched to
  **patch semantics**: only fields present in the form data are written.
  Partial updates can no longer clobber unrelated preferences.
- **`setThemeAction`** added and wired into the topbar **`ThemeToggle`** — the
  topbar switcher now persists to the account too, so a quick toggle survives
  reloads and matches the DB (no more local/DB drift).

### Toaster
- New `ThemedToaster` client component reads the resolved theme and renders
  Sonner with the right theme; it is now rendered **inside** `ThemeProvider`.
  Dark-mode users get dark toasts instead of always-light.

### PWA metadata alignment
- `src/app/layout.tsx` viewport dark themeColor changed `#0a0a0a` → `#18181b`
  to match `manifest.ts`. Manifest gained a stable `id: "ownspece"`.

### Route boundaries (loading / error / not-found)
- **`src/app/(app)/loading.tsx`** — skeleton for the authenticated shell:
  stat cards + two content cards, used automatically during navigation.
- **`src/app/(app)/error.tsx`** — client error boundary with a friendly
  "Something went wrong" state, a `Try again` (reset) action and a link back
  to the dashboard. The shell (sidebar/topbar) survives page-level errors.
- **`src/app/not-found.tsx`** — global 404 page consistent with the design.

### Data-layer bugs (found in Phase 0, fixed here)
- **`getProjectAnalytics`** (`src/lib/dal/analytics.ts`) — the 7-queries/
  6-destructure misalignment is fixed: the duplicate `tasks` query is removed,
  `notes` and `wiki_pages` head-counts are now destructured correctly.
  Per-project `notes` no longer always shows 0 and `wikiPages` no longer shows
  the note count.
- **`notesWeek` snapshot query** — now scoped with `.eq("user_id", user.id)`.
- **`removeTaskDependencyAction`** (`src/lib/actions/tasks.ts`) — resolves the
  owning project and revalidates it instead of revalidating
  `/projects/<task-id>`.
- **Dashboard due-task links** — `DueTask` now carries `project_id`;
  `getTasksDueToday` / `getTasksOverdue` / `getTasksDueInRange` select it, and
  the dashboard rows link to `/tasks/<id>` (with "Personal task" fallback for
  the display name) instead of the projects list.

### Dead scaffolding removed
- 17 empty `src/features/*` directories, empty `src/app/api/backup`,
  `src/app/api/cron`, `src/lib/db`, `src/utils` (nothing imported or tracked
  them; the real implementations live under `src/components`, `src/lib/actions`
  and `src/lib/dal`).

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |
| Runtime `/` `/login` | 200 |
| Runtime `/manifest.webmanifest` | 200, `application/manifest+json` (auth-free) |
| Runtime `/sw.js` | 200, `application/javascript` (auth-free) |
| Runtime `/dashboard` (unauth) | 307 → `/login` (proxy working) |

## Design system coverage after this phase

- Tokens: all required tokens present in light + dark (`background`,
  `foreground`, `surface`, `surface-muted`, `card`, `card-foreground`,
  `border`, `muted`, `muted-foreground`, `primary`, `primary-foreground`,
  `secondary`, `secondary-foreground`, `accent`, `accent-foreground`,
  `success`, `warning`, `danger`, `info`, plus `destructive-foreground`).
- Accents: indigo / violet / blue / cyan / emerald / teal / rose / orange /
  amber — applied to `--primary`, `--ring`, `--sidebar-primary`, chart colors.
- Backgrounds: `clean` / `soft` / `tinted` / `contrast` (light-gated) and
  `deep`/`slate`/`charcoal` equivalents (dark-gated).
- Cards: default / elevated / soft / outline / glass / compact via
  `[data-card-style]` + `Card` component variants.
- Density: comfortable / compact (`--card-spacing-var`).

## Open items carried forward

- Route-level skeletons now exist for the app group; per-page skeletons are
  optional refinements (existing pages block on DAL queries within the
  shell). Can be layered per page as needed.
- Avatar/upload server-action body limits and Google Drive configuration
  remain on the tracker (Phase 27 PWA / Settings phases).