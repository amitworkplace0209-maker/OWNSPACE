# Ownspece — Offline Sync & Notifications

## The two caches, and why there are two

| Cache | Holds | Gives you |
| ----- | ----- | --------- |
| **Shell** — `public/sw.js` | Rendered HTML + RSC payload, per account | The app **opens and navigates** with no connection |
| **Rows** — `src/lib/offline/*.client.ts` | Structured rows, per account | Data that can be **edited** offline and replayed |

Earlier versions had only the second. Opening the installed app with no
connection failed at the very first navigation — there was no shell to serve, so
the browser showed its own **"this page could not load"** error. No amount of row
caching fixes that: the request never reached the app.

## Status

| Surface | Offline read | Offline write | Replay |
| ------- | ------------ | ------------- | ------ |
| **Every route** | yes (shell cache) | no | — |
| Tasks | yes | yes | yes |
| Reminders | yes | yes | yes |
| Notes | yes | pin, favourite, delete | yes |
| Everything else | read only | no | — |

## Two kinds of row cache

Tasks and reminders have their own, and they stay that way. A task's optimistic
edit is one of three fixed fields and a reminder's carries a whole row — their
shapes are narrow enough that a specific implementation is simpler than a
general one, and the tests read better for it.

Everything else shares `row-cache.ts`: one merge/prune/replay implementation,
many entities. What differs between entities is only *which server action* to
call, and that lives in one registry.

| Piece | File |
| ----- | ---- |
| Pure rules — merge, prune, settle, validate | `src/lib/offline/row-cache.ts` |
| IndexedDB plumbing, one DB for all entities | `src/lib/offline/row-cache.client.ts` |
| Which action replays an operation | `src/lib/offline/row-replay.ts` |
| The hook a workspace calls | `src/hooks/use-offline-rows.ts` |

Adding an entity is one registry entry plus a prop on the workspace. It is *not*
one copy of the queueing machinery per entity.

### The rule that decides what can go offline

**A replayed operation must converge.**

Notes are wired to pin, favourite and delete, and pointedly not to the note body.
`toggleNotePinAction` inverts whatever the server holds — correct when the user
is looking at the server's value, wrong when a queue drains hours later and the
row was toggled elsewhere in between. So offline pin goes through
`setNoteFlagsAction`, which writes an **absolute value** and converges whatever
happened meanwhile.

The form-driven editors — note body, wiki body, calendar event fields — take a
whole `FormData` and validate every field. Replaying a partial through them would
be rejected for a field the user never touched. Wiring them means writing a
patch-shaped action for each, not rebuilding a form inside the replay.

An operation with no registry entry returns an *error* rather than being retried
forever: a write the app has no way to perform will never become performable.

## Files

### Shell (opens offline)

- `src/lib/offline/shell-cache.ts` — pure rules: route list, cache keys, warm plan
- `src/lib/offline/shell-client.ts` — page half: tells the worker who is signed in, requests warms
- `src/components/providers/offline-shell.tsx` — mounted once in the app layout
- `public/sw.js` — the worker itself

The pure module is unit tested; `public/sw.js` is a plain script that cannot
import from `src`, so the rules are mirrored there. **The two must change
together.**

### Rows (editable offline)

- `src/lib/offline/task-cache.ts` / `.client.ts` — tasks
- `src/lib/offline/reminder-cache.ts` / `.client.ts` — reminders + their projects
- `src/hooks/use-tasks-live.ts` — tasks realtime + queue replay
- `src/hooks/use-reminders-live.ts` — reminders realtime + queue replay

Each `.ts` file is pure logic (unit tested); each `.client.ts` file is the
IndexedDB plumbing (best-effort, never throws).

## Shell caching

### Strategy

**Network first with a 3.5 s deadline, then the cache, then `/offline`.**

Network-first because the data is live and RLS-protected — a dashboard from
yesterday is worse than a wait. The deadline because a phone on a dead
connection can leave a `fetch` open for thirty seconds, and thirty seconds of
blank screen is exactly the failure this removes.

### Cache keys

Two entries per route, never one:

- `document` — the HTML
- `rsc` — the Flight payload the router fetches on a soft navigation

They are **not interchangeable**: handing the router an HTML body where it
expects a Flight payload renders a blank page with no error. A response is only
stored under the kind its `content-type` actually matches.

`?_rsc=<hash>`, `?t`, `?ts` and `?dpl` are stripped from keys. `_rsc` and `dpl`
are per-build, so leaving them in would store a second full copy of every page
on every deploy and orphan the first. Query params are **sorted**, so
`?a=1&b=2` and `?b=2&a=1` are one entry rather than two copies of one page —
one of which is always the stale one.

Keys are stored and matched as **headerless URLs**. A `Vary` response only
matches against the headers stored with it, so storing with a real request and
matching with a synthesised one would never hit.

### Prefetches are never cached

A `<Link>` prefetch returns a *partial* payload — the shell without the data
behind its Suspense boundaries — keyed by the router state tree. The same URL
legitimately produces different bytes depending on where the user came from.
Caching one under the payload's key would let an offline navigation render a
page that never finishes loading.

### Warming

`SHELL_ROUTES` is fetched on an idle callback after load: one HTML and one RSC
payload per route. This is what makes it "open once and it is all there" rather
than "one page per visit".

- Sequential, not parallel — twenty simultaneous server renders while the
  dashboard is still loading is how an offline feature becomes the reason the
  dashboard is slow.
- Refreshed at most every 6 hours, and only from an idle moment. A background
  task that fires on its own runs on someone's phone bill.
- Skipped entirely under `navigator.connection.saveData`, on `2g`, and while
  offline.
- A **partial** pass does not move the clock, so a dropped connection mid-warm
  finishes the job on the next visit rather than being marked done.
- Turn it off, or force it, in **Settings → App & offline**.

### Why cached HTML is acceptable here

A rendered page contains the user's own data, and a shared browser's Cache
Storage is readable by the next person. So:

- every entry lives in a bucket named for one account (`ownspece-v5-shell-<id>`);
- the worker **only** serves a cached page when the page has told it who is
  signed in — it cannot guess, and cannot read Supabase's cookie;
- the whole bucket is deleted on sign-out, and on a change of account;
- a **redirected** response is never stored. This is the one that matters most:
  an expired session answers a navigation with a 307 to `/login`, `fetch`
  follows it, and the result is the login page body under the app's URL. Cached,
  it would greet the next person fully signed in as nobody.

`/login`, `/signup`, `/auth/*`, `/forgot-password`, `/offline` and `/api` are
never cached at any layer.

## Row caching

### Conflict handling

`updated_at` drives everything:

- Server rows are authoritative, **except** rows with a queued edit the server
  has not acknowledged yet — those keep the optimistic value so a row does not
  flicker between the server response and the replay.
- A queued mutation the server has since overtaken is **dropped, not replayed**.
  An offline edit must never clobber a newer edit made on another device.
- An **exactly equal** timestamp is treated as a tie and the mutation is kept —
  dropping a user's intent on an ambiguous timestamp is the worse failure.
- A queued `create` is never stale; there is no server row to overtake it.
- Anything older than 7 days is discarded rather than silently applied later.

### Sync status indicators

Surfaced by `SyncStrip` on the reminders page and by the existing task banner.
Shown only when there is something to report — a permanently visible "connected"
badge is noise that trains people to stop reading status indicators.

- **Live** — realtime channel subscribed, queue empty (nothing rendered)
- **Connecting / error** — channel not yet subscribed
- **Offline** — no connection; reads come from IndexedDB
- **N changes waiting** — queued and not yet replayed

### Security notes

- Auth tokens are never written to IndexedDB; Supabase keeps its own session.
- Every read is namespaced by user id, and the caches are cleared on sign-out.
- Snapshots older than 7 days are rejected at read time.
- Corrupted or hand-edited records are rejected by a structural guard
  (`isValidSnapshot`) rather than being trusted into the UI.
- All writes still go through server actions, so RLS remains the authority.

## The app lock works offline

`src/lib/security/local-mpin.client.ts` derives the **same MPIN** on the device
with PBKDF2-SHA-256 (210k iterations) and keeps it in `localStorage`, keyed by
account. The lock screen checks that copy first, so an unlock needs no network
at all.

The account row stays authoritative and keeps the lockout counter, which a purely
local check could not. The server is still consulted when it can be:

1. **Local copy exists** → verify locally. Right PIN: the app opens, and the
   server is told afterwards so its counters stay honest. Wrong PIN: fall
   through to the server anyway, so a device that *is* locked out still is.
2. **No local copy** — new phone, cleared storage, private browsing → the server
   decides, and the typed PIN is then copied to this device, so the next unlock
   is local.
3. **No local copy and no network** → say so plainly. Reporting a wrong MPIN for
   a network failure locks someone out of their own workspace over a dead
   connection.

**What the local copy gives up.** A server-approved unlock honours the account's
lockout. A local one cannot — the device decides on its own, because that is the
entire point of unlocking without a network. In practice this costs nothing:
the lockout exists to make brute-forcing a six-digit PIN slow, and someone
holding the correct MPIN was never slowed by it. What it does mean is that a
device with a *correct* local copy is not blocked by an active lockout, so the
lockout protects against wrong guesses and nothing more.

The PIN is never written anywhere. What is stored is a salted, 210k-iteration
digest — the same class of secret as the server's scrypt hash, and an
offline-cracking problem rather than a "log in as this user" problem. It is
deleted on sign-out.

## Reminder notifications

Delivered from the client, because only the page knows the device's own
permission state, quiet hours and digest preference. The server sweep still
owns the in-app feed row.

- `src/lib/reminder-notify.ts` — the policy (pure, unit tested)
- `src/components/reminders/reminder-notifier.tsx` — the scheduler
- `src/components/reminders/notification-settings.tsx` — the per-device panel

Delivery rules, in the order they are applied (`planDelivery`):

1. **Device off** → nothing is raised
2. **No channel enabled** → nothing is raised
3. **Muted reminder** → skipped, reported as *muted*
4. **Quiet hours** → skipped, reported as *quiet*
5. **Below the priority floor** → skipped
6. **Digest on** → held and merged into one alert
7. otherwise → raised individually

A reminder that went past while muted or during quiet hours is recorded as
handled. Otherwise it would alert the instant the window closed — hours later,
and more intrusive than the silence the setting was meant to provide.

**Never fires twice.** Fired ids are kept in `localStorage`, namespaced by user.
Without that, a reload re-alerts everything that came due while the tab was
closed.

**Per device, never synced.** Quiet hours and permission are properties of the
device in front of you; a phone and a laptop do not have to agree, and treating
them as account data would mean one device silently muting another's alerts.

## Not yet implemented

Offline **writes** for wiki, calendar events, finance, daily notes, tags and
resources. They are all readable offline through the shell cache today.

Each needs a **converging** server action — one that writes absolute values, not
a toggle and not a whole-form validator — before it can be added to
`row-replay.ts`. See the rule above; that action is the work, not the queueing,
which is already built and tested.

## Testing checklist

- [x] Reopen the installed app offline: it loads, no browser error page
- [x] Navigate between pages offline: instant, no failed tap
- [x] A page that was never visited offline: shows `/offline`, links onward
- [x] Expired session online: the login page is never cached under an app URL
- [x] Sign out: the next person sees nothing of the previous account
- [x] Warm pass: partial on a dropped connection, completed on the next visit
- [x] Offline: create, edit, complete, snooze, mute and delete a reminder
- [x] Offline: create and edit a task
- [x] Offline: pin, star and delete a note, replayed on reconnect
- [x] Offline: a note pinned offline stays pinned if it was unpinned elsewhere first
- [x] Online: queued changes replay and the row leaves `pending`
- [x] Conflict: a server row newer than the queued edit wins
- [x] Conflict: a create is never pruned as stale
- [x] Reconnection: replay runs on mount and on every `online` event
- [x] MPIN: correct PIN unlocks with no network
- [x] MPIN: a wrong PIN falls through to the server, so a lockout still applies
- [x] MPIN: a new device unlocks online once, then offline
- [x] Quiet hours wrap correctly across midnight
- [x] Digest batches, and flushes once its window elapses
- [x] A muted reminder does not alert, and is not retried all day
- [x] Firing is suppressed after a reload

> Offline behaviour must be tested with `npm run build && npm start`. Dev mode
> registers a worker for push but caches nothing, by design — Turbopack rewrites
> its output on every save.

## PWA surface in the UI

| Where | What it does |
| ----- | ------------ |
| `Settings → App & offline` (`#pwa`) | Install state, whole-app offline copy + refresh + clear, row cache, notifications, shortcuts |
| Dashboard `InstallPrompt` | One-time install banner, with real iOS steps (no programmatic prompt exists there) |
| Topbar | Install button once the browser offers a prompt |
| `OfflineBanner` (app layout) | Global offline state; says what is being served rather than claiming a page is unavailable |
| `/offline` | Last-resort fallback, only when a page was never stored |

The install banner is deliberately **dismissable and remembered**. A prompt that
reappears on every navigation is a prompt people dismiss reflexively without
reading.

## Testing

```
npm test        # unit tests, including every offline, lock and notification rule
npm run typecheck
npm run lint
```