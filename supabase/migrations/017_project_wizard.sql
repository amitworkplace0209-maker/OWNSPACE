-- ============================================================================
-- Ownspece migration 017 — project wizard fields
--
-- The 12-step project wizard reuses every existing table. This migration only
-- ADDs the columns those steps need — it deliberately creates no new tables, so
-- there is exactly one source of truth for projects, structure, tasks,
-- checklists, reminders, notes, finance and resources.
--
-- Design notes:
--  - Long-form prose (objective, goals, scope, tech stack, links, …) lives in
--    typed jsonb rather than a dozen nullable text columns. It is written and
--    read together, never filtered on, and jsonb keeps the table readable.
--  - Anything the UI filters or sorts by (category, project type, favourite,
--    pin) is a real column with an index.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. projects — steps 1, 2, 3, 4, 9, 11, 12
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists title text,
  add column if not exists category text
    check (category in ('development', 'business', 'learning', 'personal', 'research',
                        'design', 'marketing', 'finance', 'health', 'other')),
  add column if not exists project_type text
    check (project_type in ('web_app', 'pwa', 'mobile_app', 'desktop_app', 'api',
                            'research', 'design', 'marketing', 'other')),
  add column if not exists is_favorite boolean not null default false,
  add column if not exists is_pinned boolean not null default false,
  add column if not exists timezone text not null default 'UTC',
  add column if not exists currency text not null default 'INR'
    check (char_length(currency) = 3),
  add column if not exists budget numeric(14, 2) check (budget is null or budget >= 0),
  add column if not exists card_style text
    check (card_style in ('default', 'elevated', 'soft', 'outline', 'glass', 'compact', 'gradient')),
  add column if not exists banner_path text,
  add column if not exists logo_path text,
  -- Step 4: the long-form project detail blocks.
  add column if not exists details jsonb not null default '{}'::jsonb,
  -- Step 11: advanced / per-project feature toggles.
  add column if not exists options jsonb not null default '{}'::jsonb;

create index if not exists projects_user_category_idx  on public.projects (user_id, category);
create index if not exists projects_user_favorite_idx on public.projects (user_id) where is_favorite;
create index if not exists projects_user_pinned_idx   on public.projects (user_id) where is_pinned;

-- ---------------------------------------------------------------------------
-- 2. project_nodes — step 5. Adds the `notes` field the wizard exposes per node.
--    Name/type/description/dates/status/priority/parent/order already exist.
-- ---------------------------------------------------------------------------

alter table public.project_nodes
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- 3. tasks — step 6. phase_id already links to legacy project_phases; node_id
--    links to the flexible structure, and parent_task_id covers subtasks.
--    Tags and dependencies already have their own junction tables.
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column if not exists node_id uuid references public.project_nodes (id) on delete set null,
  add column if not exists start_date date,
  add column if not exists estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0);

create index if not exists tasks_node_idx on public.tasks (node_id);

alter table public.tasks
  drop constraint if exists tasks_dates;
alter table public.tasks
  add constraint tasks_dates
  check (due_date is null or start_date is null or due_date >= start_date);

-- ---------------------------------------------------------------------------
-- 4. checklists + checklist_items — step 6.
--    A checklist already belongs to a task OR a node (migration 015). The
--    wizard adds descriptive/priority/scheduling fields and lets both the
--    checklist and its items nest.
-- ---------------------------------------------------------------------------

alter table public.checklists
  add column if not exists description text,
  add column if not exists due_date date,
  add column if not exists priority text not null default 'none'
    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  add column if not exists parent_checklist_id uuid
    references public.checklists (id) on delete cascade,
  add column if not exists sort_order integer not null default 0;

create index if not exists checklists_parent_idx on public.checklists (parent_checklist_id);

alter table public.checklist_items
  add column if not exists description text,
  add column if not exists due_date date,
  add column if not exists priority text not null default 'none'
    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  add column if not exists parent_item_id uuid
    references public.checklist_items (id) on delete cascade;

create index if not exists checklist_items_parent_idx on public.checklist_items (parent_item_id);

-- ---------------------------------------------------------------------------
-- 5. reminders — step 7. node_id already exists (015); the wizard also lets a
--    reminder hang off a checklist, a task or a note, and adds repeat/priority/
--    snooze/notification-channel fields.
-- ---------------------------------------------------------------------------

alter table public.reminders
  add column if not exists description text,
  add column if not exists checklist_id uuid references public.checklists (id) on delete cascade,
  add column if not exists note_id uuid references public.notes (id) on delete cascade,
  add column if not exists priority text not null default 'none'
    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  add column if not exists repeat_rule text not null default 'none'
    check (repeat_rule in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'custom')),
  add column if not exists repeat_interval integer
    check (repeat_interval is null or repeat_interval > 0),
  add column if not exists repeat_until date,
  add column if not exists notification_channels text[] not null default '{in_app}',
  add column if not exists snooze_minutes integer check (snooze_minutes is null or snooze_minutes > 0),
  add column if not exists sound text,
  add column if not exists is_enabled boolean not null default true,
  add column if not exists advance_minutes integer not null default 0
    check (advance_minutes >= 0);

create index if not exists reminders_project_idx on public.reminders (user_id, project_id);

-- ---------------------------------------------------------------------------
-- 6. daily_notes — step 8. `content` remains the free-form body; the wizard's
--    named sections get their own columns so they can be listed independently.
-- ---------------------------------------------------------------------------

alter table public.daily_notes
  add column if not exists title text,
  add column if not exists todays_work text,
  add column if not exists completed_work text,
  add column if not exists problems text,
  add column if not exists ideas text,
  add column if not exists next_steps text;

-- ---------------------------------------------------------------------------
-- 7. calendar_events — step 8. The project calendar aggregates tasks,
--    reminders, milestones and notes through their own project_id; events only
--    need to be attachable to a structure node.
-- ---------------------------------------------------------------------------

alter table public.calendar_events
  add column if not exists node_id uuid references public.project_nodes (id) on delete set null;

create index if not exists calendar_events_node_idx on public.calendar_events (node_id);

-- ---------------------------------------------------------------------------
-- 8. finance_transactions — step 9. Adds time-of-day, invoice reference and the
--    uploaded receipt that the wizard collects alongside an amount.
-- ---------------------------------------------------------------------------

alter table public.finance_transactions
  add column if not exists occurred_at time,
  add column if not exists reference text,
  add column if not exists file_id uuid references public.files (id) on delete set null;

create index if not exists finance_transactions_project_idx
  on public.finance_transactions (user_id, project_id);

commit;