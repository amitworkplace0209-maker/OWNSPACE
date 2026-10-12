-- ============================================================================
-- Ownspece migration 025 — web push subscriptions
--
-- The service worker already had a `push` handler, but nothing could ever send
-- a push to it: there was nowhere to record a device's subscription and no VAPID
-- identity to sign one with. Without this table a reminder could only ever be
-- delivered while the app happened to be open.
--
-- One row per device, per browser profile. A user signing in on a phone and a
-- laptop gets two rows, and each is pushed to independently — which is what
-- makes the per-device notification settings on the reminders page meaningful
-- rather than cosmetic.
--
-- `endpoint` is the push service URL and is unique: it is the natural key, and
-- re-subscribing the same browser must upsert rather than accumulate dead rows.
-- ============================================================================

begin;

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,

  -- The push service URL from PushSubscription.endpoint. Unique so a browser
  -- that re-subscribes updates its row instead of adding a second one.
  endpoint     text not null unique,

  -- PushSubscription.keys, required by the encryption handshake.
  p256dh       text not null,
  auth         text not null,

  -- What the user should recognise this device by in the device list.
  label        text,
  user_agent   text,

  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id, created_at desc);

-- Owner-only, exactly like every other user-owned table. A subscription is a
-- delivery address: letting another account read or write one would let it
-- receive or suppress someone else's notifications.
alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner_all" on public.push_subscriptions;
create policy "push_subscriptions_owner_all" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Opt the table into realtime so a device subscribing or being removed on one
-- tab is reflected on the others without a reload.
do $$
declare
  already boolean;
begin
  select true into already
    from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = 'push_subscriptions';

  if not already then
    execute 'alter publication supabase_realtime add table public.push_subscriptions';
  end if;
end $$;

commit;