-- ============================================================================
-- Ownspece migration 009 — automatic profile + preferences provisioning
--
-- Creates public.profiles and public.user_preferences rows atomically whenever
-- a new auth.users row appears (Supabase Auth). This guarantees every user has
-- a profile + preferences before their first app request, regardless of how
-- they sign up (email confirmation on/off, API, etc.).
--
-- Runs as SECURITY DEFINER (owner = postgres) so it can write the user's
-- freshly-created rows in the same transaction. This does NOT weaken RLS:
-- application roles still face every row-level policy unchanged; the function
-- only inserts the owning user's own seed rows from auth metadata.
-- ============================================================================

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
set lock_timeout = '5s'
as $$
begin
  -- id/1:1 with auth.users; RLS owner policies require id = auth.uid(), which
  -- holds for the row being created here.
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;