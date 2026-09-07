-- ============================================================================
-- Ownspece migration 006 — time tracking, activities & files
-- ============================================================================

begin;

-- activity feed; append-only, no updated_at.
-- entity_id is polymorphic (points at the id of the entity_type table), so it
-- carries no foreign key by design.
create table public.activities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  activity_type text not null
                  check (activity_type in ('project', 'phase', 'milestone', 'task', 'comment',
                                           'checklist', 'note', 'wiki', 'file', 'calendar',
                                           'reminder', 'time', 'pomodoro', 'system')),
  entity_type   text,
  entity_id     uuid,
  summary       text,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

create index activities_user_created_idx    on public.activities (user_id, created_at desc);
create index activities_project_created_idx on public.activities (project_id, created_at desc);

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  project_id        uuid not null references public.projects (id) on delete cascade,
  task_id           uuid references public.tasks (id) on delete set null,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_minutes  integer not null default 0 check (duration_minutes >= 0),
  description       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint time_entries_duration check (ended_at is null or ended_at > started_at)
);

create index time_entries_user_start_idx on public.time_entries (user_id, started_at);
create index time_entries_project_idx     on public.time_entries (project_id);
create index time_entries_task_idx        on public.time_entries (task_id);

create table public.pomodoro_sessions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  task_id               uuid references public.tasks (id) on delete set null,
  focus_duration_minutes integer not null default 25 check (focus_duration_minutes > 0),
  break_duration_minutes integer not null default 5 check (break_duration_minutes >= 0),
  started_at            timestamptz not null,
  ended_at              timestamptz,
  status                text not null default 'running'
                          check (status in ('running', 'completed', 'cancelled')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint pomodoro_sessions_end check (ended_at is null or ended_at >= started_at)
);

create index pomodoro_sessions_user_start_idx on public.pomodoro_sessions (user_id, started_at);
create index pomodoro_sessions_task_idx        on public.pomodoro_sessions (task_id);

-- metadata only; Storage buckets/upload arrive in a later phase.
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete set null,
  task_id       uuid references public.tasks (id) on delete set null,
  name          text not null,
  storage_path  text not null,
  mime_type     text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint files_scope check (project_id is not null or task_id is not null),
  constraint files_name_not_blank check (char_length(btrim(name)) > 0),
  constraint files_path_not_blank check (char_length(btrim(storage_path)) > 0)
);

create index files_user_idx    on public.files (user_id);
create index files_project_idx on public.files (project_id);
create index files_task_idx    on public.files (task_id);

commit;