-- ============================================================================
-- Ownspece migration 022 — project wizard backend fixes
--
-- Closes three gaps left by earlier migrations that made the project wizard's
-- later steps fail against an otherwise fully-migrated database:
--
--  1. milestones.node_id — the wizard attaches a milestone to a structure node
--     (the same way tasks do), but 017 only ever added node_id to tasks. Every
--     wizard save therefore failed the milestone insert with PGRST204
--     "Could not find the 'node_id' column of 'milestones'". Adding the column
--     brings milestones in line with tasks, reminders, calendar events and
--     finance transactions, which all already reference project_nodes.
--
--  2. checklists.task_id was declared NOT NULL in 003. Migration 015 added
--     node_id and checklists_parent_check requiring exactly one of the two, so
--     a node-only checklist could never satisfy both constraints at once.
--     Dropping NOT NULL lets the check in 015 express the real rule.
--
--  3. activities.activity_type only allowed the original 006 enum, but the app
--     logs project_node, resource and finance activities. Widening the check
--     makes those inserts succeed instead of failing silently.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Milestones can hang off a structure node, mirroring tasks.
-- ---------------------------------------------------------------------------

alter table public.milestones
  add column if not exists node_id uuid references public.project_nodes (id) on delete set null;

create index if not exists milestones_node_idx on public.milestones (node_id);

-- ---------------------------------------------------------------------------
-- 2. A checklist belongs to a task OR a node; the column must be nullable for
--    the node case (003 declared it NOT NULL before nodes existed).
-- ---------------------------------------------------------------------------

alter table public.checklists
  alter column task_id drop not null;

-- ---------------------------------------------------------------------------
-- 3. Activity types the application actually writes.
-- ---------------------------------------------------------------------------

alter table public.activities
  drop constraint if exists activities_activity_type_check;

alter table public.activities
  add constraint activities_activity_type_check check (
    activity_type in (
      'project', 'phase', 'milestone', 'task', 'comment', 'checklist',
      'note', 'wiki', 'file', 'calendar', 'reminder', 'time', 'pomodoro',
      'system', 'project_node', 'resource', 'finance'
    )
  );

commit;
