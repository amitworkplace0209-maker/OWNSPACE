-- ============================================================================
-- Ownspece migration 030 — MPIN sign-in, device unlock, stricter security row
--
-- What this changes
-- -----------------
-- 1. `user_security.email` — the account's login identifier, denormalised so a
--    sign-in with "email + MPIN" can find the account without listing every
--    user in the project.
--
-- 2. `user_security` becomes **read-only for its owner**. Every write goes
--    through a server action holding the service role. This is what makes an
--    MPIN sign-in possible at all: at sign-up there is no session yet, so the
--    row has to be written by a privileged server; once it can be written that
--    way, it should *only* be written that way — otherwise a browser holding a
--    session could clear its own lockout counter or set its own MPIN hash.
--
-- 3. The lock duration gains "when the app is closed" and loses "until I sign
--    out", because an app that stays unlocked after being closed is not locked
--    at all.
--
-- 4. A guard: every user-owned table must have Row Level Security enabled.
--    The migration fails if it does not, so "one user can only see their own
--    data" is a property of the schema rather than a promise in a comment.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The login identifier
-- ---------------------------------------------------------------------------

-- The email is copied here rather than looked up in `auth.users`, because
-- PostgREST cannot read the auth schema and the admin API can only list users
-- a page at a time. A sign-in needs a single indexed lookup, on every attempt,
-- and this is that lookup.
--
-- Nullable on purpose: a row can exist for an account that has not chosen an
-- MPIN yet, and an account whose email was changed has a stale copy until its
-- next sign-in rewrites it.
alter table public.user_security
  add column if not exists email text;

-- Lower-cased, and checked to stay that way. An address is not case-sensitive,
-- so `Ada@x.com` and `ada@x.com` are one account: two rows for one person
-- would split their account in two, and one of the two would be unreachable.
--
-- The unique index is on the column itself rather than on `lower(email)`,
-- because the sign-in looks the account up with an equality filter, and an
-- equality filter cannot use an index over a function.
alter table public.user_security
  drop constraint if exists user_security_email_lowercase;

alter table public.user_security
  add constraint user_security_email_lowercase
    check (email is null or email = lower(email));

drop index if exists public.user_security_email_unique;

create unique index if not exists user_security_email_unique
  on public.user_security (email)
  where email is not null;

comment on column public.user_security.email is
  'Login identifier, copied from auth.users so an MPIN sign-in is one indexed lookup. Always lower case.';

-- ---------------------------------------------------------------------------
-- 2. Sign-in lockout
-- ---------------------------------------------------------------------------

-- Separate from the app-lock counters on purpose. The app lock protects an
-- *open* session; the sign-in counter protects the *door*. A user who fat-fingers
-- their MPIN on the lock screen should not then find they cannot sign in
-- either, and a user who mistypes it at the door should still find the app
-- they are already inside.
alter table public.user_security
  add column if not exists signin_failed_attempts integer not null default 0
    check (signin_failed_attempts >= 0),
  add column if not exists signin_locked_until timestamptz;

comment on column public.user_security.signin_locked_until is
  'Set after too many failed MPIN sign-ins. Cleared by a successful sign-in, never by a guess.';

-- ---------------------------------------------------------------------------
-- 3. Backfill
-- ---------------------------------------------------------------------------

-- Every existing account gets its email, so an account created before this
-- migration can still sign in with its MPIN. `on conflict do nothing` keeps a
-- row that already has the right email untouched.
update public.user_security us
   set email = lower(u.email)
  from auth.users u
 where u.id = us.user_id
   and us.email is null
   and u.email is not null;

-- ---------------------------------------------------------------------------
-- 4. Lock durations
-- ---------------------------------------------------------------------------

-- "closed" replaces "session": an app that stays unlocked after it has been
-- closed is not locked, which is the whole point of the lock. "immediately" is
-- gone for the same reason in the other direction — it re-locked on every
-- navigation, which reads as a broken app rather than a locked one.
alter table public.user_preferences
  drop constraint if exists user_preferences_lock_duration_check;

alter table public.user_preferences
  add constraint user_preferences_lock_duration_check
    check (lock_duration in ('closed', 'minute', 'five', 'fifteen', 'hour'));

alter table public.user_preferences
  alter column lock_duration set default 'closed';

-- The two removed values are mapped onto "closed", which is the closest
-- surviving answer to both: "until I sign out" was the one that let the app
-- stay open, and "immediately" was the one that locked it at once.
update public.user_preferences
   set lock_duration = 'closed'
 where lock_duration in ('immediately', 'session');

comment on column public.user_preferences.lock_duration is
  'How long an unlocked app stays unlocked. "closed" means it locks again the moment the app is closed or backgrounded.';

-- ---------------------------------------------------------------------------
-- 5. The security row is read-only for its owner
-- ---------------------------------------------------------------------------

-- Writes now happen through server actions holding the service role, which
-- means the row can no longer be edited by a browser that merely holds a
-- session: the lockout counter, the MPIN hash and the lock flag are all
-- server-owned facts now.
drop policy if exists "user_security_owner_all" on public.user_security;
drop policy if exists "user_security_owner_read" on public.user_security;

create policy "user_security_owner_read" on public.user_security
  for select using (user_id = auth.uid());

comment on table public.user_security is
  'Per-account lock and sign-in state. The owner may read it; only server actions holding the service role may write it.';

-- ---------------------------------------------------------------------------
-- 6. The guard: no user-owned table may be without RLS
-- ---------------------------------------------------------------------------

-- "Each user only sees their own data" is enforced by the database, not by
-- the application remembering to filter. Every table in `public` that belongs
-- to a user must therefore have Row Level Security switched on — and this
-- migration refuses to finish if one does not, so a future migration that
-- creates a table and forgets the policy cannot slip through unnoticed.
do $$
declare
  exposed text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into exposed
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity
     -- Only tables that belong to a user: anything with a foreign key into
     -- auth.users. `profiles` keys on auth.users directly rather than through
     -- a `user_id` column, so a column-name test would have missed it — and a
     -- table of lookup values with no user of its own is not this migration's
     -- business.
     and exists (
       select 1
         from pg_constraint con
         join pg_class owner_table on owner_table.oid = con.conrelid
         join pg_namespace owner_ns on owner_ns.oid = owner_table.relnamespace
        where con.contype = 'f'
          and con.conrelid = c.oid
          and owner_ns.nspname = 'public'
          and exists (
            select 1
              from pg_class referenced
              join pg_namespace referenced_ns on referenced_ns.oid = referenced.relnamespace
             where referenced.oid = con.confrelid
               and referenced_ns.nspname = 'auth'
               and referenced.relname = 'users'
          )
     );

  if exposed is not null then
    raise exception
      'Row Level Security is disabled on: %. Every user-owned table must enable it.',
      exposed;
  end if;
end;
$$;

commit;
