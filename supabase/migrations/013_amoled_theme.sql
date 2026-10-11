-- ============================================================================
-- Ownspece migration 013 — AMOLED theme
--
-- Adds "amoled" as a fourth first-class theme alongside light / dark / system
-- so the AMOLED surface can be persisted server-side and synced across devices
-- exactly like every other appearance preference.
--
-- The original constraint was declared inline in 002_core_user.sql, so its
-- name is auto-generated. We locate it defensively instead of hardcoding a
-- name that may differ across environments.
-- ============================================================================

begin;

do $$
declare
  constraint_name text;
begin
  select c.conname
    into constraint_name
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
   where c.conrelid = 'public.user_preferences'::regclass
     and c.contype = 'c'
     and a.attname = 'theme';

  if constraint_name is null then
    raise exception 'Could not locate the CHECK constraint on user_preferences.theme';
  end if;

  execute format('alter table public.user_preferences drop constraint %I', constraint_name);
end $$;

alter table public.user_preferences
  add constraint user_preferences_theme_check
  check (theme in ('light', 'dark', 'amoled', 'system'));

commit;
