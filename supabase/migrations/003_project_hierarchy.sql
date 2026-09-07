-- ============================================================================
-- Ownspece migration 003 — project hierarchy (tags junction, phases,
-- milestones, tasks, dependencies, task tags/comments, checklists)
-- ============================================================================

begin;

create table public.project_tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  tag_id     uuid not null references public.tags (id) on delete cascade,
  constraint project_tags_unique unique (project_id, tag_id)
);

create index project_tags_user_idx on public.project_tags (user_id);
create index project_tags_tag_idx  on public.project_tags (tag_id);

create table public.project_phases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  description text,
  status      text not null default 'planned'
                check (status in ('planned', 'in_progress', 'completed', 'blocked')),
  start_date  date,
  due_date    date,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint project_phases_name_not_blank check (char_length(btrim(name)) > 0),
  constraint project_phases_dates check (due_date is null or start_date is null or due_date >= start_date)
);

create index project_phases_project_idx on public.project_phases (project_id);
create index project_phases_user_idx    on public.project_phases (user_id);

create table public.milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  phase_id    uuid references public.project_phases (id) on delete set null,
  title       text not null,
  description text,
  due_date    date,
  status      text not null default 'not_started'
                check (status in ('not_started', 'in_progress', 'completed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint milestones_title_not_blank check (char_length(btrim(title)) > 0)
);

create index milestones_project_idx on public.milestones (project_id);
create index milestones_phase_idx   on public.milestones (phase_id);
create index milestones_user_due_idx on public.milestones (user_id, due_date);

create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  project_id      uuid not null references public.projects (id) on delete cascade,
  phase_id        uuid references public.project_phases (id) on delete set null,
  parent_task_id  uuid references public.tasks (id) on delete cascade,
  title           text not null,
  description     text,
  status          text not null default 'todo'
                    check (status in ('backlog', 'todo', 'in_progress', 'done', 'cancelled')),
  priority        text not null default 'none'
                    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  progress        smallint not null default 0 check (progress between 0 and 100),
  due_date        date,
  reminder_at     timestamptz,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tasks_title_not_blank check (char_length(btrim(title)) > 0),
  constraint tasks_no_self_parent check (parent_task_id is null or parent_task_id <> id)
);

create index tasks_user_status_idx    on public.tasks (user_id, status);
create index tasks_project_status_idx on public.tasks (project_id, status);
create index tasks_project_phase_idx  on public.tasks (project_id, phase_id);
create index tasks_user_due_idx       on public.tasks (user_id, due_date);
create index tasks_parent_idx         on public.tasks (parent_task_id);
create index tasks_project_sort_idx   on public.tasks (project_id, sort_order);

create table public.task_dependencies (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id  uuid not null references public.tasks (id) on delete cascade,
  created_at          timestamptz not null default now(),
  constraint task_dependencies_unique unique (task_id, depends_on_task_id),
  constraint task_dependencies_no_self check (task_id <> depends_on_task_id)
);

create index task_dependencies_user_idx    on public.task_dependencies (user_id);
create index task_dependencies_depends_idx on public.task_dependencies (depends_on_task_id);

create table public.task_tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  constraint task_tags_unique unique (task_id, tag_id)
);

create index task_tags_user_idx on public.task_tags (user_id);
create index task_tags_tag_idx  on public.task_tags (tag_id);

create table public.task_comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_comments_body_not_blank check (char_length(btrim(body)) > 0)
);

create index task_comments_task_created_idx on public.task_comments (task_id, created_at);
create index task_comments_user_idx         on public.task_comments (user_id);

create table public.checklists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  title      text not null default 'Checklist',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index checklists_task_idx on public.checklists (task_id);

create table public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  content      text not null,
  is_completed boolean not null default false,
  completed_at timestamptz,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint checklist_items_content_not_blank check (char_length(btrim(content)) > 0)
);

create index checklist_items_checklist_idx on public.checklist_items (checklist_id);

commit;