-- ============================================================================
-- Ownspece migration 001 — helper functions
--
-- Re-runnable (CREATE OR REPLACE). Ownership helpers are declared LANGUAGE
-- plpgsql intentionally: PL/pgSQL bodies are compiled lazily on first call,
-- so they may be created before the tables they reference (which live in
-- later migration files). SQL-language functions would instead be resolved at
-- CREATE time and fail with "relation ... does not exist".
--
-- The policies that call these helpers never pass a row of the SAME table the
-- helper queries, which avoids PostgreSQL's "infinite recursion in policy"
-- guard. Helpers are security invoker, so they run as the requesting role and
-- never bypass RLS.
-- ============================================================================

begin;

-- Keeps updated_at current on every UPDATE (used by triggers in 007_triggers).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.user_owns_project(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.projects p where p.id = target and p.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_phase(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.project_phases ph where ph.id = target and ph.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_task(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.tasks t where t.id = target and t.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_checklist(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.checklists c where c.id = target and c.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_note(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.notes n where n.id = target and n.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_wiki(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.wiki_pages w where w.id = target and w.user_id = auth.uid());
end;
$$;

create or replace function public.user_owns_tag(target uuid)
returns boolean
language plpgsql
stable
as $$
begin
  return exists (select 1 from public.tags tg where tg.id = target and tg.user_id = auth.uid());
end;
$$;

commit;