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

## Authentication

Signing in is an **MPIN sign-in**: an email address and the number the app
asks for every time it opens. The account password still exists — it is the
recovery secret, the reset email changes it — but it is not what the door
asks for, and the login form keeps it one tap away for whoever has forgotten
their MPIN.

Supabase Auth has no "log this person in" call that takes a secret of the
app's own choosing, so the flow is:

1. The email is looked up in `user_security` (one indexed read, with the
   service role — nobody is signed in yet).
2. The MPIN is checked against the account's scrypt hash, in constant time.
3. A session is opened with an admin-generated magic-link token, exchanged
   through the same code path the emailed link uses. No email is sent, and
   the token never leaves the server.

Three properties the flow has to keep, and where they live:

- **One message for every wrong answer** — an unknown address, a wrong MPIN
  and an account with no MPIN all read the same (`signin-rules.ts`).
- **The same time for every wrong answer** — a missing account spends the
  same scrypt time a real check would (`burnVerificationTime`).
- **A lockout after six tries**, counted on the account so that cycling
  devices does not buy fresh guesses.

`user_security` is **read-only for its owner**: every write goes out from a
server action holding the service role. A browser that merely holds a session
cannot set its own MPIN hash, clear its own lockout counter or turn its own
lock off.

### Data isolation

Row Level Security is on every table, and a migration fails if any table with
a foreign key into `auth.users` has it disabled — so "one user sees only
their own data" is a property of the schema rather than a promise in a
comment. The application's own reads are scoped by `user_id` as well, so the
isolation does not depend on the database being the only line of defence.

### The app lock

The app is behind an MPIN, and it locks **whenever it is closed** — closed, sent
to the background, or restored from the back/forward cache. Moving between
pages does not count: a full page load hides the old document exactly like
switching apps does, so the lock is told apart from a navigation by `pagehide`,
which means the document is on its way out.

The unlock token lives in `sessionStorage`, keyed by account, so it outlives a
reload but not the tab, and it can never open another account's workspace.

A session that has just signed in is not asked for the MPIN twice: the sign-in
writes a one-shot ticket that the app layout reads on the server, and the lock
gate swaps it for the ordinary unlock token and deletes it.

On a device, the MPIN can be replaced by the device's own **fingerprint**
(a WebAuthn platform credential — the key never leaves the secure hardware,
and the server is not involved) or by a **device PIN** kept on that machine
alone. Both are scoped to one account and both are wiped on sign-out.

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

- Installable web app manifest + service worker.
- Secure caching strategy: app shell cached per account; private data never
  cached unconditionally.
- Notifications are raised through the service worker, never through the
  `Notification` constructor, which does not work on Android — where an
  installed app actually lives. Alerts carry action buttons, and an intent
  raised while the app was closed is replayed on the next launch.
- The app lock, the device PIN and the fingerprint enrolment are secrets of
  the *device*, and are wiped when the account signs out.

## Future Extensibility

- AI features, integrations (GitHub, Google Calendar, etc.), and additional
  modules (habit/finance trackers) can be added without restructuring the
  core data or security model.