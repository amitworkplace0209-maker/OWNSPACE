# Ownspece — Offline Sync & Notifications

## Status: implemented for Tasks and Reminders

### What works today

| Surface        | Realtime | Offline read | Offline write | Queue |
| -------------- | -------- | ------------ | ------------- | ----- |
| Tasks          | yes      | yes          | yes           | yes   |
| Reminders      | yes      | yes          | yes           | yes   |
| Everything else| server-rendered per navigation | — | — | — |

**Realtime** is a Supabase Postgres-changes channel per surface. The event
patches local state immediately (so a checkbox feels instant) and also schedules
a debounced `router.refresh()` so the server's aggregates catch up. The patch is
what makes it feel fast; the refresh is what keeps the numbers honest.

**Offline read** comes from an IndexedDB snapshot written on every server
payload. Namespaces are keyed by user id, so a shared device cannot serve one
account's rows to the next.

**Offline write** applies the change locally, marks the row `pending`, and queues
a mutation. On reconnect the queue is replayed in order against the server
actions.

### Files

- `src/lib/offline/task-cache.ts` / `.client.ts` — tasks
- `src/lib/offline/reminder-cache.ts` / `.client.ts` — reminders + their projects
- `src/hooks/use-tasks-live.ts` — tasks realtime + queue replay
- `src/hooks/use-reminders-live.ts` — reminders realtime + queue replay
- `public/sw.js` — static precache, background-sync signalling, push

Each `.ts` file is pure logic (unit tested); each `.client.ts` file is the
IndexedDB plumbing (best-effort, never throws).

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
- Every read is namespaced by user id and the caches are cleared on sign-out.
- Snapshots older than 7 days are rejected at read time.
- Corrupted or hand-edited records are rejected by a structural guard
  (`isValidSnapshot`) rather than being trusted into the UI.
- All writes still go through server actions, so RLS remains the authority.

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

## Testing checklist

- [x] Offline: create, edit, complete, snooze, mute and delete a reminder
- [x] Offline: create and edit a task
- [x] Online: queued changes replay and the row leaves `pending`
- [x] Conflict: a server row newer than the queued edit wins
- [x] Conflict: a create is never pruned as stale
- [x] Reconnection: replay runs on mount and on every `online` event
- [x] Quiet hours wrap correctly across midnight
- [x] Digest batches, and flushes once its window elapses
- [x] A muted reminder does not alert, and is not retried all day
- [x] Firing is suppressed after a reload

## PWA surface in the UI

| Where | What it does |
| ----- | ------------ |
| `Settings → App & offline` (`#pwa`) | Install state, offline-cache contents + clear, notification settings, app shortcuts |
| Dashboard `InstallPrompt` | One-time install banner, with real iOS steps (no programmatic prompt exists there) |
| Topbar | Install button once the browser offers a prompt |
| `OfflineBanner` (app layout) | Global "you're offline" state on every page |
| `/offline` | Static fallback served by the service worker on a failed navigation |

The install banner is deliberately **dismissable and remembered**. A prompt that
reappears on every navigation is a prompt people dismiss reflexively without
reading.

`OfflineBanner` says *what still works* rather than just announcing a problem —
Tasks and Reminders are editable offline; other pages need a connection. It also
fires a "Back online" toast once per transition so a returning user knows their
queued changes are syncing.

### Sign-out

Both caches are cleared on sign-out. Missing the reminder cache there would
leave the previous account's reminder titles readable to the next person to sign
in on a shared machine.

## Not yet implemented

The same cache-and-replay treatment for notes, daily notes, calendar, wiki,
finance and resources. Each would follow the existing pattern: a pure
`<entity>-cache.ts`, an IndexedDB `.client.ts`, and a `use-<entity>-live.ts`
hook.

## Testing

```
npm test        # unit tests, including every offline and notification rule
npm run typecheck
npm run lint
```