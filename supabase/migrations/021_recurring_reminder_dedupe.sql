-- 021 — stop recurring schedules from spamming reminders
--
-- `generateRecurringTransactionsAction` raises a lead-time reminder for the
-- next occurrence. Without a record of what was already raised, every run of
-- the sweep inserted another reminder for the same payment, so a single
-- schedule could pile up a reminder per run.
--
-- `last_reminded_for` holds the due date the existing reminder covers, so a
-- reminder is only raised when the schedule rolls forward to a new one.

alter table public.finance_recurring
  add column if not exists last_reminded_for date;

comment on column public.finance_recurring.last_reminded_for is
  'Due date the last lead-time reminder was raised for. Prevents one reminder per sweep run.';