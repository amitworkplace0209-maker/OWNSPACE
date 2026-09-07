-- ============================================================================
-- Ownspece migration 002 — core user tables
-- ============================================================================

begin;

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text unique,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username) between 3 and 30)
);

-- 1:1 with the user
create table public.user_preferences (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  theme           text not null default 'system' check (theme in ('light', 'dark', 'system')),
  default_view    text not null default 'dashboard' check (default_view in ('dashboard', 'projects', 'tasks', 'calendar', 'wiki')),
  daily_note_time time,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_user_name_unique unique (user_id, name),
  constraint tags_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  icon        text,
  color       text,
  status      text not null default 'active'
                check (status in ('active', 'on_hold', 'completed', 'archived')),
  priority    text not null default 'none'
                check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  progress    smallint not null default 0 check (progress between 0 and 100),
  start_date  date,
  due_date    date,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_name_not_blank check (char_length(btrim(name)) > 0),
  constraint projects_dates check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_user_status_idx on public.projects (user_id, status);
create index projects_user_due_idx     on public.projects (user_id, due_date);
create index projects_user_updated_idx on public.projects (user_id, updated_at desc);

commit;