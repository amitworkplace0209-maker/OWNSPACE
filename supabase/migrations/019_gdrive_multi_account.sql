-- 019 — multiple Google Drive accounts per user
--
-- Migration 012 made `gdrive_connections.user_id` the primary key, which capped
-- every user at exactly one Drive. Connecting a second account silently
-- overwrote the first, because the callback upserted on `user_id`.
--
-- The key becomes a surrogate `id`, with one row per (user, Google account).
-- `account_email` is what identifies the Drive, and it is normalised to lower
-- case so `A@x.com` and `a@x.com` cannot become two rows for one account.
--
-- `gdrive_file_refs` gains `connection_id` so a linked file remembers which
-- account it came from — without it, a file id from one Drive could not be
-- resolved once the browse context was another.

-- ---------------------------------------------------------------------------
-- 1. Swap the primary key
-- ---------------------------------------------------------------------------

alter table public.gdrive_connections
  add column if not exists id uuid default gen_random_uuid();

-- Backfill an id for any row that predates this migration before it becomes
-- not-null, otherwise the PK swap fails on a non-empty table.
update public.gdrive_connections
   set id = gen_random_uuid()
 where id is null;

alter table public.gdrive_connections
  alter column id set not null;

alter table public.gdrive_connections
  drop constraint if exists gdrive_connections_pkey;

alter table public.gdrive_connections
  add constraint gdrive_connections_pkey primary key (id);

-- ---------------------------------------------------------------------------
-- 2. Account identity and lifecycle
-- ---------------------------------------------------------------------------

alter table public.gdrive_connections
  add column if not exists account_email text,
  add column if not exists label text,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'revoked', 'error')),
  add column if not exists last_connected_at timestamptz,
  add column if not exists last_error text;

-- Existing rows predate the multi-account model, so backfill from whatever
-- email the old callback captured.
update public.gdrive_connections
   set account_email = lower(email),
       status = 'active'
 where account_email is null
   and email is not null;

-- An existing row with no email at all cannot be identified per-account, so it
-- is dropped rather than left as an unaddressable duplicate.
delete from public.gdrive_connections where account_email is null;

alter table public.gdrive_connections
  alter column account_email set not null;

-- One row per (user, Google account).
create unique index if not exists gdrive_connections_user_account_uniq
  on public.gdrive_connections (user_id, account_email);

-- The old (user_id) lookup in every DAL has to become a list.
create index if not exists gdrive_connections_user_idx
  on public.gdrive_connections (user_id);

comment on column public.gdrive_connections.account_email is
  'Google account this connection belongs to, lower-cased. One row per user+account.';
comment on column public.gdrive_connections.status is
  'active = usable; revoked = consent withdrawn (invalid_grant); error = last refresh failed.';

-- ---------------------------------------------------------------------------
-- 3. File refs remember their account
-- ---------------------------------------------------------------------------

alter table public.gdrive_file_refs
  add column if not exists connection_id uuid references public.gdrive_connections (id) on delete cascade;

-- Attach the ref to whichever connection currently owns that email. Refs that
-- match no connection keep a null connection_id and simply become unresolvable,
-- which is safer than pointing them at an arbitrary account.
update public.gdrive_file_refs refs
   set connection_id = conn.id
  from gdrive_connections conn
 where refs.connection_id is null
   and conn.user_id = refs.user_id
   and refs.connection_id is null;

create index if not exists gdrive_file_refs_connection_idx
  on public.gdrive_file_refs (connection_id);

-- Backup for attaching the same file to the same target twice. The old dedupe
-- was a read-then-write in the action, which two concurrent clicks could both
-- pass; this makes it impossible.
create unique index if not exists gdrive_file_refs_unique_link
  on public.gdrive_file_refs (
    user_id, drive_file_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(task_id,    '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(note_id,    '00000000-0000-0000-0000-000000000000'::uuid)
  );