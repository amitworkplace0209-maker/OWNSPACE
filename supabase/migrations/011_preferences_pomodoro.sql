begin;

-- Pomodoro settings live on user_preferences
alter table public.user_preferences
  add column focus_duration_minutes integer not null default 25
    check (focus_duration_minutes between 1 and 180);

alter table public.user_preferences
  add column break_duration_minutes integer not null default 5
    check (break_duration_minutes between 0 and 60);

commit;