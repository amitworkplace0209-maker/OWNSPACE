# Phase 24 — MPIN sign-in, device unlock, native notifications

## What was asked for

1. Fix the login system, and make sure one user only ever sees their own data.
2. A new account needs an email, a name, a password **and** an MPIN.
3. Signing in needs an email and an MPIN — and nothing else.
4. The MPIN is asked for every time the app is closed.
5. On a device where the app is installed, the MPIN can be replaced by a
   device PIN or by a fingerprint.
6. Notifications on that device arrive like a normal app's notifications.

## What changed

### The sign-in is now an MPIN sign-in

`supabase/migrations/030_login_mpin.sql` adds `user_security.email`, the
account's login identifier, denormalised from `auth.users`. It exists because
PostgREST cannot read the auth schema and the admin API can only list users a
page at a time, and a sign-in needs *one* indexed lookup on every attempt.

The MPIN is checked by the app, not by Supabase Auth — Auth's door is email
plus password, and the password is hashed where the app cannot read it. So:

- `src/lib/auth/mpin-signin.ts` finds the account by email, checks the MPIN
  against the scrypt hash in constant time, and then opens a session with an
  admin-generated magic-link token, exchanged through the same code path the
  emailed link uses. **No email is sent and the token never leaves the
  server.**
- The rules — the lockout, the countdown, the one message for every wrong
  credential — live in `src/lib/auth/signin-rules.ts`, pure and unit tested.

Three properties the sign-in has to have, and why:

- **One message for every wrong answer.** An address that does not exist, an
  account with no MPIN and a wrong MPIN all read the same, so the form cannot
  be used to find out who has an account here.
- **The same time for every wrong answer.** A missing account is not rejected
  instantly; it spends the same scrypt time a real check would
  (`burnVerificationTime`). A fast rejection is a free test.
- **A lockout after six tries**, and the counter lives on the account, so
  cycling devices does not buy fresh guesses.

An MPIN sign-in skips the emailed confirmation link, so an account whose email
has never been confirmed is refused. Otherwise anybody who guessed a six-digit
MPIN would own an account without ever seeing an email.

The account password is not gone: it is the recovery secret, the reset email
changes it, and the login form keeps it one tap away for the person who has
forgotten their MPIN.

### The security row belongs to the server

`user_security` was writable by the account's own session, through the RLS
owner policy. It no longer is: the policy is read-only, and every write goes
out from a server action holding the service role.

That is what makes an MPIN sign-up possible at all — at sign-up there may be
no session, so the row has to be written by a privileged server — and once it
can be written that way it should *only* be written that way. A browser that
merely holds a session can no longer set its own MPIN hash, clear its own
lockout counter or turn its own lock off.

### One user, one set of data

Row Level Security was already on every table, but it was a promise in a
migration rather than a rule. Migration 030 now **fails** if any table with a
foreign key into `auth.users` has RLS disabled, so a future migration that
creates a table and forgets the policy cannot slip through unnoticed.

Two real leaks were closed on the way:

- **Sign-out did not clean the device.** The offline caches, the derived MPIN
  and the device secrets live in IndexedDB and localStorage, and the cleanup
  was written inside a server action — where neither exists. It deleted
  nothing, and a shared machine showed the previous account's task titles to
  the next one. The wipe now happens in the browser, in the tab that is
  signing out (`src/lib/auth/sign-out.client.ts`).
- **The unlock token was not scoped to an account.** It is keyed by user id
  now, so an unlock left over from one account can never open another's
  workspace in the same tab.

### The app locks when it is closed

The lock duration list lost "until I sign out" — the one setting that made the
lock decorative, since the workspace stayed open for as long as the tab lived —
and gained "when the app is closed", which is now the default. The re-lock on
`visibilitychange` is unconditional: the app locks the moment it is backgrounded
or closed, whatever the duration says, and a page restored from the
back/forward cache is locked too.

Signing in no longer asks for the MPIN twice. The sign-in writes a one-shot
ticket, the app layout reads it on the server so the first paint is already
right, and the lock gate swaps it for the ordinary unlock token and deletes
it. The ticket's lifetime is the whole point: it is gone a moment after it is
used, so closing the app locks it even if you open it again five seconds
later.

#### Two bugs the lock had, and what they were

**The app locked on every navigation.** `visibilitychange` fires when a page is
hidden — and a full page load hides the old document exactly like switching
apps does. The gate was deleting the unlock token on every hide, so any
navigation that reloaded the page threw away the unlock and asked for the MPIN
again. The two are now told apart: the token is dropped a moment *after* the
app goes to the background, and `pagehide` — which means the document is on its
way out — cancels that. A link that reloads the page keeps the unlock; an app
that is put away loses it.

**The lock screen could not be opened.** `useNow` — the clock behind the
lockout countdown — took `Date.now()` as its `useSyncExternalStore` snapshot.
React compares a snapshot with the one from the last render, and a clock
reading is never the same number twice, so React re-rendered forever and
threw "Maximum update depth exceeded" the moment the lock screen appeared.
The clock now holds a value and only moves when it ticks.

Both were invisible to the console sweep, because the account it audits has no
MPIN and so never sees the lock screen. They were found by driving the lock
screen in a real browser: sign in, close the app, open it, type the MPIN.

### The device unlocks itself

Two new ways in, both entirely local (`src/lib/security/device-unlock.client.ts`):

- **A fingerprint.** A WebAuthn *platform* credential. The private key is
  generated inside the device's secure hardware and never leaves it; the
  public key that verifies the signature is kept in localStorage. The server
  is not involved at any point — this is a key for this machine, not a second
  way into the account.
- **A device PIN.** A number chosen on this machine, derived with PBKDF2 and
  kept here, exactly like the offline copy of the account MPIN.

Both are scoped to one account and both are wiped on sign-out: a machine
outlives an account, and leaving them behind would let the next person in
unlock the app with the last owner's finger.

The account MPIN stays the fallback, and stays the thing that signs in.

### Notifications that behave like the phone's own

Three fixes, all in the gap between "the browser can show a notification" and
"it feels like an app":

- **The `Notification` constructor does not work on Android**, which is where
  an installed app lives — Chrome there throws and the alert silently never
  appears. Alerts now go through the service worker registration
  (`src/lib/notifications/system.client.ts`), with the constructor only as a
  fallback.
- **The action buttons were never applied.** `useNotificationActions` existed
  but was mounted on the notifications page alone, so a "Done" tapped on the
  lock screen did nothing unless you happened to be on that page. It is now
  mounted app-wide, outside the app lock, in `NotificationBridge`.
- **The badge on the app icon was never set.** `useAppBadge` had the same
  problem and is now mounted too, with the unread count.

Alerts carry "Done" and "Snooze" buttons, a buzz pattern, and
`requireInteraction` for critical reminders. An alert acted on while the app
was closed is parked by the worker and replayed on the next launch.

## What a user does now

| | Before | Now |
| --- | --- | --- |
| New account | email, name, password | email, name, password, **MPIN** |
| Signing in | email, password | **email, MPIN** (password one tap away) |
| Opening the app | MPIN, if the lock was on | MPIN — **always**, once the app is closed |
| Moving between pages | sometimes asked for the MPIN | never — a page load is not a close |
| Opening the app on your phone | type the MPIN | **fingerprint**, or a device PIN, or the MPIN |
| A reminder while the app is closed | a push, sometimes | a push with **Done / Snooze** on it |
| The app icon | no badge | unread count on the icon |

## Tests

- `src/lib/auth/signin-rules.test.ts` — the lockout, the countdown and the
  one-message rule.
- `src/lib/security/device-unlock.test.ts` — the stored records on the device,
  and every malformed shape that has to read as absent.
- `src/lib/security/mpin.test.ts` — the new duration list, and the two
  settings that are gone.

## Files

| File | What it does |
| --- | --- |
| `supabase/migrations/030_login_mpin.sql` | The login identifier, the read-only security row, the new durations, the RLS guard |
| `src/lib/auth/mpin-signin.ts` | The MPIN sign-in: lookup, verify, open the session |
| `src/lib/auth/signin-rules.ts` | The rules of a sign-in, pure and tested |
| `src/lib/auth/unlock-grant.server.ts` | The one-shot ticket that stops the MPIN being asked for twice |
| `src/lib/auth/sign-out.client.ts` | The device wipe that has to happen in the browser |
| `src/lib/security/device-unlock.client.ts` | The fingerprint and the device PIN |
| `src/lib/notifications/system.client.ts` | Raising a system notification the way Android wants it |
| `src/components/providers/notification-bridge.tsx` | Applies notification actions, anywhere in the app |
