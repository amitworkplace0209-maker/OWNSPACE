# Architecture

## Overview

Ownspece is a personal project operating system implemented as a Next.js
Progressive Web App backed by Supabase.

```
User -> Browser (PWA) -> Next.js App Router -> Supabase
                                                 |-- PostgreSQL (RLS enforced)
                                                 |-- Auth (JWT sessions)
                                                 |-- Storage
```

## Guiding Principles

- Server Components by default; Client Components only where interactivity
  requires them (see Next.js docs for the full guidance).
- Server Actions for mutations (no unnecessary API routes).
- All authorization enforced database-side via Supabase Row Level Security.
- Service role key used only in server-side code.
- Zero hardcoded data; all application data comes from Supabase.

## Rendering Strategy

| Layer         | Approach                                             |
| ------------- | ---------------------------------------------------- |
| Pages         | Server Components fetching from Supabase               |
| Interactive UI | Client Components (forms, menus, toggles)            |
| Mutations     | Server Actions with validated input (Zod)            |
| Auth state    | Supabase session cookies, middleware route guards    |

## Data Layer

- Single source of truth: Supabase PostgreSQL database.
- The `profiles` table links to `auth.users`.
- Every owned table carries `user_id` and enforces ownership via RLS.
- Projects are the central entity; most features hang off a `project_id`.

## Routing

```
/                        Landing (redirects when authed)
/(auth)/login            Authentication
/(app)/...               Application shell (sidebar + topbar + bottom nav)
  /dashboard
  /projects              (+ /projects/[projectId] and sub-tabs)
  /tasks, /notes, /calendar, /reminders, /wiki
  /analytics, /activity, /archive, /settings
```

## PWA

- Installable web app manifest + service worker (Phase 19).
- Secure caching strategy: app shell cached; private data never cached
  unconditionally.

## Future Extensibility

- AI features, integrations (GitHub, Google Calendar, etc.), and additional
  modules (habit/finance trackers) can be added without restructuring the
  core data or security model.