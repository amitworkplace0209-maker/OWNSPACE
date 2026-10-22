# Environment Variables

All environment variables are documented in `.env.example`. Copy it to
`.env.local` and fill in real values locally. Never commit `.env.local`.

## Required variables

| Variable                       | Public | Client-safe | Source                                             |
| ------------------------------ | ------ | ----------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Yes    | Yes         | Supabase Dashboard -> Project Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes   | Yes         | Supabase Dashboard -> Project Settings -> API -> anon public key |
| `SUPABASE_SERVICE_ROLE_KEY`    | No     | No          | Supabase Dashboard -> Project Settings -> API -> service_role key |

The service role key is not optional. The MPIN sign-in looks the account up
in `user_security` and opens a session with it, and the sign-up writes the
MPIN's hash with it — both happen before anybody is signed in, so neither can
go through the row-level-security policies. Without the key the app still runs,
but signing in with an MPIN does not, and the login form says so.

## Optional variables

| Variable              | Public | Client-safe | What it does                                     |
| --------------------- | ------ | ----------- | ------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL` | Yes   | Yes         | The origin used in the links Supabase emails. Falls back to the host the request arrived on, so it is only needed when that host is not the public one. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Yes | Yes     | The public half of the web-push key pair. Without it, reminders still arrive in the app and by system notification, but not on a device with the app closed. |
| `VAPID_PRIVATE_KEY`   | No     | No          | The signing half of the key pair. Never leaves the server. |
| `VAPID_SUBJECT`       | Yes    | Yes         | The contact the push services use. `mailto:` or `https:`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | No | No | The Drive integration. The Drive pages say "not configured" without them. |

## Rules

- `NEXT_PUBLIC_*` variables are embedded into the browser bundle. Only public
  values may use this prefix.
- `SUPABASE_SERVICE_ROLE_KEY` must only be referenced in server-only modules
  (`src/lib/supabase/admin.ts`). It bypasses Row Level Security and must never
  be exposed to the browser.
- Never hard-code secrets anywhere.