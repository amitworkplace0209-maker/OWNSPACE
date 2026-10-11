-- 018 — reminder scheduling
--
-- Migration 017 added the scheduling columns (repeat_rule, advance_minutes,
-- is_enabled, notification_channels) and the wizard can write them, but two
-- things were still missing for the /reminders page to drive them honestly:
--
--   1. snoozed_until. Snooze used to overwrite remind_at in place, which
--      destroyed the time the user originally set. Un-snoozing was therefore
--      impossible, and a recurring reminder lost its schedule every time it
--      was snoozed. Keeping the original in remind_at and the pushed-out time
--      in snoozed_until makes snooze reversible.
--
--   2. repeat_days. `repeat_rule = 'custom'` is in the 017 check constraint
--      but had no way to say *which* days, so it was a dead option. Sunday =
--      0, matching Date#getDay().

alter table public.reminders
  add column if not exists snoozed_until timestamptz,
  add column if not exists repeat_days integer[] not null default '{}';

-- The sweep runs on every dashboard load and filters on status + remind_at,
-- so the existing (user_id, remind_at) index carries it. These two support
-- the page's own filters.
create index if not exists reminders_user_enabled_idx
  on public.reminders (user_id, is_enabled);

create index if not exists reminders_user_priority_idx
  on public.reminders (user_id, priority);

comment on column public.reminders.snoozed_until is
  'Set while a reminder is snoozed: the time it will fire again. remind_at keeps the original.';
comment on column public.reminders.repeat_days is
  'Weekdays (0 = Sunday) used when repeat_rule = ''custom''.';