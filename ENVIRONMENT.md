# Environment Variables

All environment variables are documented in `.env.example`. Copy it to
`.env.local` and fill in real values locally. Never commit `.env.local`.

## Required variables

| Variable                       | Public | Client-safe | Source                                             |
| ------------------------------ | ------ | ----------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`     | Yes    | Yes         | Supabase Dashboard -> Project Settings -> API -> Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes   | Yes         | Supabase Dashboard -> Project Settings -> API -> anon public key |
| `SUPABASE_SERVICE_ROLE_KEY`    | No     | No          | Supabase Dashboard -> Project Settings -> API -> service_role key |

## Rules

- `NEXT_PUBLIC_*` variables are embedded into the browser bundle. Only public
  values may use this prefix.
- `SUPABASE_SERVICE_ROLE_KEY` must only be referenced in server-only modules
  (`src/lib/supabase/admin.ts`). It bypasses Row Level Security and must never
  be exposed to the browser.
- Never hard-code secrets anywhere.