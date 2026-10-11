-- ============================================================================
-- Ownspece migration 024 — realtime for the daily journal
--
-- The daily planner keeps its own copy of the day open for long stretches: it
-- sits in a tab while someone works. Without realtime, a note written on a
-- phone and a block edited on a laptop would each only appear after the other
-- side reloaded, which reads as "the app lost my note".
--
-- Two tables join `tasks` and `notifications` in the publication:
--
--   daily_notes       — the journal body and its structured sections
--   planning_entries  — the time blocks on the day
--
-- Nothing here changes data or exposes anything new. RLS still governs which
-- rows a subscriber receives, so a subscriber sees exactly the rows the owner
-- policy already allows — no new data becomes visible to anyone.
--
-- DELETE events carry only the primary key under the default replica
-- identity, and the planner reacts to a change by refreshing rather than by
-- patching the row in place, so raising it would widen the WAL payload for
-- every write to buy nothing.
-- ============================================================================

begin;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['public.daily_notes', 'public.planning_entries']
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

alter table public.daily_notes      replica identity default;
alter table public.planning_entries replica identity default;

commit;