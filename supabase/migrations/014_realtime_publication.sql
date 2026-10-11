-- ============================================================================
-- Ownspece migration 014 — realtime for tasks and notifications
--
-- The dashboard subscribes to postgres_changes on these two tables so a task
-- completed in /tasks or a notification raised by a reminder sweep shows up on
-- the dashboard without a manual reload.
--
-- Nothing here changes data: it only opts two tables into the existing
-- supabase_realtime publication. Row Level Security still governs which rows a
-- subscriber receives, so no new data becomes visible to anyone.
-- ============================================================================

begin;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['public.tasks', 'public.notifications']
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = split_part(tbl, '.', 1)
         and tablename   = split_part(tbl, '.', 2)
    ) then
      execute format('alter publication supabase_realtime add table %s', tbl);
    end if;
  end loop;
end $$;

-- DELETE events only carry the primary key unless replica identity is raised.
-- The dashboard refreshes on any change, so it does not need the old row, and
-- the default (primary key) is deliberately left alone to avoid widening the
-- WAL payload for every update.
alter table public.tasks        replica identity default;
alter table public.notifications replica identity default;

commit;
