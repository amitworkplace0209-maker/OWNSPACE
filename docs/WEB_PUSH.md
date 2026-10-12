# Web Push & Native-Feeling Notifications

Web push is what makes a reminder reach the device with the app **closed**. Every
other delivery path in this app requires the app to be open.

## Setup

```bash
npm run push:keys      # generate a VAPID key pair
# paste the output into .env.local
npm run db:migrate     # creates push_subscriptions
```

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

Without these the app still works: reminders appear in the notification centre
and as in-app alerts. They just cannot reach a closed app. The notifications
page says *"Not configured"* rather than offering a toggle that cannot work.

**The private key never leaves the server** and must not be committed. Rotating
the pair invalidates every existing subscription, so each device has to turn
notifications on again.

## How a push is delivered

```
processDueRemindersAction        src/lib/actions/notifications.ts
  └─ pushToDevices               fan-out, never throws
       └─ sendPushToUser         src/lib/push/send.ts
            ├─ encryptPushPayload   src/lib/push/encrypt.ts   (RFC 8291)
            └─ vapidToken           src/lib/push/send.ts      (RFC 8292)
                 └─ POST → push service
                      └─ service worker `push`  public/sw.js
```

The server sweep still owns the in-app feed row. Push is additive: a delivery
failure is recorded and dropped, never thrown, so one bad subscription cannot
stop the remaining reminders from firing.

## Action buttons

What makes a web notification feel like a native one:

| Button | Handled by |
| ------ | ---------- |
| **Done** | `completeReminderAction` |
| **Snooze 10m** | `snoozeReminderAction` |
| swipe to dismiss | `completeReminderAction` |

The service worker **cannot** perform these itself — it has no Supabase session
and cannot call a server action. It posts the intent to any open client
(`useNotificationActions`); if none is open it parks the intent in IndexedDB and
replays it on the next launch. Tapping **Done** from a locked phone still
completes the reminder.

Capped at 3 actions — Chromium refuses a fourth.

## Native behaviours reproduced

| Behaviour | How |
| --------- | --- |
| One notification per reminder, not per fire | `tag: reminder-<id>` — a repeat replaces its own |
| A genuinely new push still alerts | `renotify` set alongside `tag` (without it the OS stays silent) |
| Unread count on the app icon | `setBadgeCount` (Chrome/Edge; ignored elsewhere) |
| Tap focuses the existing window | `notificationclick` reuses a client instead of opening a second app |
| Devices listed and revocable | `push_subscriptions`, one row per browser profile |

## Files

| File | Role |
| ---- | ---- |
| `src/lib/push/encrypt.ts` | RFC 8291 payload encryption + the receiver half for tests |
| `src/lib/push/send.ts` | RFC 8292 VAPID signing and delivery (`server-only`) |
| `src/lib/push/vapid.ts` | Key reading and base64url helpers |
| `src/lib/actions/push.ts` | Subscribe / unsubscribe / prune |
| `src/hooks/use-push-subscription.ts` | Per-device subscribe control |
| `src/hooks/use-notification-actions.ts` | Applies Done/Snoze; badge sync |
| `src/app/api/push/public-key/route.ts` | Serves the public key for subscribing |
| `supabase/migrations/025_push_subscriptions.sql` | Device table + RLS |
| `scripts/generate-vapid.cjs` | Key pair generator |

## Why the crypto is tested against a receiver

A web push whose RFC 8291 derivation is wrong is **accepted by the push service
and silently discarded by the browser** — no console error, no failed request.
`web-push-crypto.test.ts` therefore encrypts with the real sender and decrypts
with an independently written receiver, asserting the plaintext returns. This
caught a genuine bug: `PRK_key = HMAC(auth_secret, ecdh)`, which is easy to
write as a concatenation.

`encrypt.ts` is deliberately not `server-only` so the test can exercise it;
`send.ts` is.

## Testing

```bash
npm test             # crypto always; transport checks run only when keys exist
```

The transport tests `skipIf` no key pair, so a fresh clone stays green — and
runs in full once keys are configured. `vitest.config.mts` loads `.env.local`,
which Vite does not do on its own, and aliases `server-only` so a
`server-only` module can be imported at all.

## Not implemented

Background sync for *notifications* is not needed — a push arrives without any
client. Reminder *actions* taken with the app closed replay on next launch,
which is the correct trade: the alternative is a second push asking about the
first one.