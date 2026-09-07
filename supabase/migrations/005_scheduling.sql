-- ============================================================================
-- Ownspece migration 005 — scheduling & notifications (calendar events,
-- reminders, notifications)
-- ============================================================================

begin;

-- Explicit dated events. Tasks/milestones/reminders are represented on the
-- calendar by their own date columns (tasks.due_date, tasks.reminder_at,
-- milestones.due_date, reminders.remind_at), so no rows are duplicated here.
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  title       text not null,
  description text,
  event_type  text not null default 'event'
                check (event_type in ('event', 'meeting', 'appointment', 'personal')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  location    text,
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_events_title_not_blank check (char_length(btrim(title)) > 0),
  constraint calendar_events_duration check (ends_at is null or ends_at > starts_at)
);

create index calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);
create index calendar_events_project_idx     on public.calendar_events (project_id);

create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  task_id     uuid references public.tasks (id) on delete cascade,
  title       text not null,
  note        text,
  remind_at   timestamptz not null,
  status      text not null default 'pending'
                check (status in ('pending', 'triggered', 'dismissed', 'snoozed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint reminders_title_not_blank check (char_length(btrim(title)) > 0)
);

create index reminders_user_status_idx on public.reminders (user_id, status);
create index reminders_user_remind_idx on public.reminders (user_id, remind_at);
create index reminders_task_idx         on public.reminders (task_id);

-- inbox; append-only, no updated_at
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null check (type in ('reminder', 'task', 'project', 'system')),
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx  on public.notifications (user_id) where read_at is null;

commit;