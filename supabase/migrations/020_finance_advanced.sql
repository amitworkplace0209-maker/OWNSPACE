-- 020 — advanced finance: budgets, recurring transactions, bills, investments
--
-- Migration 012 gave the app two finance tables (categories + transactions) and
-- nothing else. Every figure the /finance page wanted beyond that — a monthly
-- budget, rent that posts itself every month, an EMI due on the 5th, stock
-- holdings — had nowhere to live, so none of it existed.
--
-- Also fixes two gaps in the original tables:
--   * `updated_at` was never maintained: 007_triggers.sql runs before 012 and
--     so never covered them.
--   * `finance_transactions` had no way to say where a row came from, so a
--     generated transaction was indistinguishable from a hand-entered one and
--     double-generating was undetectable.

-- ---------------------------------------------------------------------------
-- 1. Maintenance triggers, which migration 012 never got
-- ---------------------------------------------------------------------------

drop trigger if exists set_updated_at on public.finance_categories;
create trigger set_updated_at before update on public.finance_categories
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.finance_transactions;
create trigger set_updated_at before update on public.finance_transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Monthly budgets
-- ---------------------------------------------------------------------------

create table if not exists public.finance_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- NULL category/project means "everything", which is how a monthly overall
  -- budget is expressed. Scoped to one category is the common case.
  category_id uuid references public.finance_categories (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  -- 'YYYY-MM'. Kept as text rather than a date so it sorts and groups without
  -- timezone conversion shifting the month.
  month       text not null check (month ~ '^\d{4}-\d{2}$'),
  amount      numeric(14, 2) not null check (amount > 0),
  currency    text not null default 'INR' check (char_length(currency) = 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One budget per scope per month. A NULL column is distinct from any value in
-- a plain unique index, which is exactly the semantics wanted here: unlimited
-- budgets per month, but only one overall and one per category.
create unique index if not exists finance_budgets_unique
  on public.finance_budgets (
    user_id, month,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(project_id,  '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists finance_budgets_user_month_idx
  on public.finance_budgets (user_id, month desc);

alter table public.finance_budgets enable row level security;
drop policy if exists "finance_budgets_owner_all" on public.finance_budgets;
create policy "finance_budgets_owner_all" on public.finance_budgets
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Recurring transactions
-- ---------------------------------------------------------------------------

create table if not exists public.finance_recurring (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  type           text not null check (type in ('income', 'expense')),
  amount         numeric(14, 2) not null check (amount > 0),
  category_id    uuid references public.finance_categories (id) on delete set null,
  project_id     uuid references public.projects (id) on delete cascade,
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'upi', 'wallet', 'other')),
  description    text check (description is null or char_length(description) <= 300),
  notes          text check (notes is null or char_length(notes) <= 5000),

  -- Reuses the same vocabulary as reminders so one scheduler can drive both.
  repeat_rule    text not null default 'monthly'
                   check (repeat_rule in ('daily', 'weekly', 'monthly', 'yearly', 'custom')),
  repeat_interval integer check (repeat_interval is null or repeat_interval > 0),
  repeat_until   date,
  repeat_days    integer[] not null default '{}',

  -- The day the next occurrence is generated for. Generation is idempotent
  -- per (rule, next_due_on), so a double click cannot double-post rent.
  next_due_on    date not null,
  -- Date of the last generated occurrence, for the idempotency guard.
  last_generated_on date,

  -- Whether this posts itself automatically, or is only ever a suggestion.
  is_active      boolean not null default true,
  -- Create a reminder ahead of the due date instead of posting directly.
  remind_days_before integer check (remind_days_before is null or remind_days_before >= 0),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint finance_recurring_name_not_blank check (char_length(btrim(name)) > 0)
);

create index if not exists finance_recurring_user_due_idx
  on public.finance_recurring (user_id, next_due_on)
  where is_active;

alter table public.finance_recurring enable row level security;
drop policy if exists "finance_recurring_owner_all" on public.finance_recurring;
create policy "finance_recurring_owner_all" on public.finance_recurring
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.finance_recurring;
create trigger set_updated_at before update on public.finance_recurring
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Bills (fixed monthly commitments)
-- ---------------------------------------------------------------------------

create table if not exists public.finance_bills (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  name           text not null,
  amount         numeric(14, 2) not null check (amount > 0),
  category_id    uuid references public.finance_categories (id) on delete set null,
  project_id     uuid references public.projects (id) on delete cascade,
  -- Day of month the bill falls due (1-31). A month shorter than that clamps
  -- to its last day rather than rolling into the next one.
  due_day        integer not null default 1 check (due_day between 1 and 31),
  payment_method text check (payment_method in ('cash', 'card', 'bank_transfer', 'upi', 'wallet', 'other')),
  notes          text check (notes is null or char_length(notes) <= 5000),

  status         text not null default 'unpaid'
                   check (status in ('unpaid', 'paid', 'skipped')),
  -- When the bill was last settled, used to decide whether this month's copy
  -- is already handled.
  last_paid_on   date,
  is_active      boolean not null default true,
  -- Raise a reminder this many days before the due date.
  remind_days_before integer check (remind_days_before is null or remind_days_before >= 0),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint finance_bills_name_not_blank check (char_length(btrim(name)) > 0)
);

create index if not exists finance_bills_user_idx
  on public.finance_bills (user_id, status, due_day);

alter table public.finance_bills enable row level security;
drop policy if exists "finance_bills_owner_all" on public.finance_bills;
create policy "finance_bills_owner_all" on public.finance_bills
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.finance_bills;
create trigger set_updated_at before update on public.finance_bills
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Investments / holdings
-- ---------------------------------------------------------------------------

create table if not exists public.finance_holdings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- Free-form ticker. No market data source is wired up, so nothing validates
  -- this against a real exchange — it is the user's own shorthand.
  symbol         text not null,
  name           text,
  quantity       numeric(18, 6) not null check (quantity > 0),
  buy_price      numeric(14, 2) not null check (buy_price > 0),
  -- Entered by the user; there is no live quote feed.
  current_price  numeric(14, 2) check (current_price is null or current_price >= 0),
  currency       text not null default 'INR' check (char_length(currency) = 3),
  notes          text check (notes is null or char_length(notes) <= 5000),
  acquired_on    date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint finance_holdings_symbol_not_blank check (char_length(btrim(symbol)) > 0)
);

create index if not exists finance_holdings_user_idx
  on public.finance_holdings (user_id, symbol);

alter table public.finance_holdings enable row level security;
drop policy if exists "finance_holdings_owner_all" on public.finance_holdings;
create policy "finance_holdings_owner_all" on public.finance_holdings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.finance_holdings;
create trigger set_updated_at before update on public.finance_holdings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. Link transactions back to where they came from
-- ---------------------------------------------------------------------------

alter table public.finance_transactions
  add column if not exists recurring_id uuid references public.finance_recurring (id) on delete set null,
  add column if not exists bill_id uuid references public.finance_bills (id) on delete set null,
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'recurring', 'bill'));

create index if not exists finance_transactions_recurring_idx
  on public.finance_transactions (recurring_id);
create index if not exists finance_transactions_bill_idx
  on public.finance_transactions (bill_id);

-- ---------------------------------------------------------------------------
-- 7. A default currency for the personal (non-project) ledger
-- ---------------------------------------------------------------------------

alter table public.user_preferences
  add column if not exists currency text not null default 'INR'
    check (char_length(currency) = 3);

comment on table public.finance_budgets is
  'Monthly spending caps, optionally scoped to a category or a project.';
comment on table public.finance_recurring is
  'Transactions that post themselves on a schedule — salary, rent, EMI.';
comment on table public.finance_bills is
  'Fixed monthly commitments tracked for due-date and payment state.';
comment on column public.finance_transactions.source is
  'manual = typed in; recurring / bill = generated. Guards against double-posting.';