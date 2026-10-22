# Ownspece — PWA Documentation

## Current status: working

### What works

- **Web App Manifest** — `/manifest.webmanifest`, generated from
  `src/app/manifest.ts`: name, icons (regular *and* maskable), theme and
  background colours, `display: standalone`, long-press shortcuts, and an
  `id` so the installed app keeps one identity across updates.
- **Service Worker** — `/sw.js`. Network-first for navigations with a short
  deadline, cache-first for content-addressed assets, a per-account cache for
  rendered pages, background sync for queued edits, and push handling.
- **Install prompt** — `usePwaInstall` captures `beforeinstallprompt` and
  shows the manual steps on iOS, which has no programmatic prompt at all.
- **Web push** — VAPID keys on the server, one subscription row per device,
  and a fan-out that prunes dead endpoints.
- **System notifications** — raised through the service worker, with action
  buttons, a badge, and a buzz.
- **Offline** — the app shell, and the task, reminder and note rows, are
  stored on the device and replayed when the connection comes back.

### The two things that make it feel like an app

**Notifications.** Raised through `registration.showNotification`, never
through the `Notification` constructor: on Android — where an installed app
lives — the constructor throws and the alert silently never appears. Alerts
carry "Done" and "Snooze" buttons, an intent raised while the app was closed
is parked in IndexedDB and replayed on the next launch, and the unread count
is drawn on the app icon by the operating system.

**The lock.** Installed on a phone, the app is behind an MPIN — or the
device's own fingerprint, or a PIN that never leaves the machine. The lock
comes back the moment the app is closed or sent to the background.

### Service worker (`public/sw.js`)

| | |
| --- | --- |
| Version | `ownspece-v6` (`ownspece-dev` on localhost) |
| Caches | `-static`, `-runtime`, `-meta`, and one `-shell-<user>` per account |
| Precache | `/offline`, the manifest, the icons |
| Navigations | network first with a 3.5 s deadline, then the account's cache, then `/offline` |
| Assets | cache first, with a background refresh |
| Never cached | `/login`, `/signup`, `/auth`, `/forgot-password`, `/offline`, `/api` |

The per-account shell cache is the answer to "a shared device shows the last
person's dashboard": a cached page is only ever served to the account it was
rendered for, and the whole bucket is deleted when that account signs out.

### Web manifest (`src/app/manifest.ts`)

- **Name**: "Ownspece — Personal Project Operating System"
- **Short name**: "Ownspece"
- **Start URL**: `/dashboard`
- **Display**: `standalone` (with `window-controls-overlay` as an override)
- **Theme / background**: `#0a0c11`
- **Icons**: 192×192 and 512×512, regular and maskable
- **Shortcuts**: New task, New note, New project, New reminder, Focus timer

### Proxy protection (`src/proxy.ts`)

Accessible without a session: `/manifest.webmanifest`, `/sw.js`, the icons,
`/offline`, and `/api/push/public-key` — the VAPID *public* key, which
identifies the application and carries no secret. Exempting it means a
signed-out or expired session gets the route's own JSON error instead of an
HTML redirect the caller cannot parse.

### Installation requirements

1. A valid manifest served at `/manifest.webmanifest`
2. The service worker registered at scope `/`
3. HTTPS (localhost counts)
4. Icons at 192 and 512, plus a maskable one
5. `display: standalone`

### Testing it

1. Chrome DevTools → Application → Manifest: every field populated.
2. Application → Service Workers: the worker is active and controls the page.
3. Application → Manifest → Install: Ownspece installs and opens in its own
   window.
4. On the installed app, turn notifications on in Settings → App & offline,
   then send yourself a reminder: it arrives as a system notification with
   "Done" and "Snooze" on it, and the icon carries the unread count.
5. Close the app and open it again: it asks for the MPIN — or the
   fingerprint, if one is enrolled.
