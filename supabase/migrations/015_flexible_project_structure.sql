-- ============================================================================
-- Ownspece migration 015 — flexible project structure, resources, history
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Project Nodes — flexible hierarchical structure
-- ---------------------------------------------------------------------------

create table public.project_nodes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  parent_id     uuid references public.project_nodes (id) on delete cascade,
  node_type     text not null
                  check (node_type in (
                    'phase', 'chapter', 'lesson', 'topic', 'section',
                    'collection', 'module', 'milestone', 'custom'
                  )),
  title         text not null,
  description   text,
  status        text not null default 'planned'
                  check (status in ('planned', 'in_progress', 'completed', 'blocked', 'on_hold')),
  priority      text not null default 'none'
                  check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  start_date    date,
  due_date      date,
  sort_order    integer not null default 0,
  progress      smallint not null default 0 check (progress between 0 and 100),
  metadata      jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint project_nodes_title_not_blank check (char_length(btrim(title)) > 0),
  constraint project_nodes_dates check (due_date is null or start_date is null or due_date >= start_date),
  constraint project_nodes_no_self_parent check (parent_id is null or parent_id <> id)
);

create index project_nodes_user_idx     on public.project_nodes (user_id);
create index project_nodes_project_idx  on public.project_nodes (project_id);
create index project_nodes_parent_idx   on public.project_nodes (parent_id);
create index project_nodes_type_idx     on public.project_nodes (node_type);
create index project_nodes_project_sort on public.project_nodes (project_id, sort_order);

-- ---------------------------------------------------------------------------
-- 2. Project Resources — links, files, google drive, notes, etc.
-- ---------------------------------------------------------------------------

create table public.project_resources (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  node_id          uuid references public.project_nodes (id) on delete set null,
  resource_type    text not null
                     check (resource_type in (
                       'link', 'file', 'google_drive', 'supabase_file',
                       'note', 'document', 'repository', 'api', 'video', 'image', 'custom'
                     )),
  name             text not null,
  description      text,
  url              text,
  storage_path     text,
  mime_type        text,
  size_bytes       bigint,
  gdrive_file_id   text,
  gdrive_account   text,
  tags             text[],
  metadata         jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint project_resources_name_not_blank check (char_length(btrim(name)) > 0)
);

create index project_resources_user_idx      on public.project_resources (user_id);
create index project_resources_project_idx   on public.project_resources (project_id);
create index project_resources_node_idx      on public.project_resources (node_id);
create index project_resources_type_idx      on public.project_resources (resource_type);

-- ---------------------------------------------------------------------------
-- 3. Project History / Version History
-- ---------------------------------------------------------------------------

create table public.project_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  entity_type    text not null,
  entity_id      uuid,
  action         text not null,
  old_value      jsonb,
  new_value      jsonb,
  summary        text,
  created_at     timestamptz not null default now()
);

create index project_history_user_idx       on public.project_history (user_id);
create index project_history_project_idx    on public.project_history (project_id);
create index project_history_entity_idx     on public.project_history (entity_type, entity_id);
create index project_history_project_created on public.project_history (project_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. Extend Checklists to support project_nodes (not just tasks)
-- ---------------------------------------------------------------------------

alter table public.checklists
  add column node_id uuid references public.project_nodes (id) on delete cascade;

-- Add check constraint: either task_id or node_id must be set, not both
alter table public.checklists
  add constraint checklists_parent_check check (
    (task_id is not null and node_id is null) or
    (task_id is null and node_id is not null)
  );

create index checklists_node_idx on public.checklists (node_id);

-- ---------------------------------------------------------------------------
-- 5. Extend Reminders to support project_nodes
-- ---------------------------------------------------------------------------

alter table public.reminders
  add column node_id uuid references public.project_nodes (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 6. Extend Notes to support project_nodes (optional)
-- ---------------------------------------------------------------------------

alter table public.notes
  add column node_id uuid references public.project_nodes (id) on delete set null;

create index notes_node_idx on public.notes (node_id);

-- ---------------------------------------------------------------------------
-- 7. Extend Finance Transactions to support project_nodes (optional)
-- ---------------------------------------------------------------------------

alter table public.finance_transactions
  add column node_id uuid references public.project_nodes (id) on delete set null;

create index finance_transactions_node_idx on public.finance_transactions (node_id);

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.project_nodes        enable row level security;
alter table public.project_resources    enable row level security;
alter table public.project_history      enable row level security;

create policy "project_nodes_owner_all"
  on public.project_nodes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "project_resources_owner_all"
  on public.project_resources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "project_history_owner_all"
  on public.project_history for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 9. Updated_at triggers for new tables
--    (public.set_updated_at() is the helper defined in 001_helpers.sql;
--     handle_updated_at() never existed, so this file could not be applied
--     until it was corrected.)
-- ---------------------------------------------------------------------------

create trigger project_nodes_updated_at
  before update on public.project_nodes
  for each row execute function public.set_updated_at();

create trigger project_resources_updated_at
  before update on public.project_resources
  for each row execute function public.set_updated_at();

commit;