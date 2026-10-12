-- 026 — category kinds, per-category opening balances, monthly/yearly reports
--
-- What was missing
-- ----------------
-- `finance_categories` had a name, a type (income/expense) and a colour. That is
-- enough to group a ledger by category, but not enough to answer the questions a
-- money page is actually asked:
--
--   * "Is this a fixed commitment (rent) or a variable one (kirana)?"
--   * "How much cash do I have in hand right now?"
--   * "What did the household cost me this year, not just this month?"
--   * "How much of this month's spending went to the house?"
--
-- Those need two things this migration adds:
--
--   1. `kind` — which *book* a category belongs to (household, cash/bank,
--      investment, liability, income, expense). Every category the app seeds
--      gets one, and the kind decides which metrics and which chart a category
--      page renders. A user's own categories may leave it null; every metric
--      then falls back to the plain income/expense behaviour.
--
--   2. `type = 'account'` — categories that are *containers* of money rather than
--      buckets of it. "Cash in hand" is not income and not an expense, but
--      transactions still flow in and out of it, so it needs to exist as a
--      category while staying out of "income by category" breakdowns. Folding
--      it into `expense` would put every withdrawal under spending.
--
-- Plus `finance_accounts`, which holds the opening balance for a category. The
-- running balance is derived (opening + everything after it), never stored, so
-- inserting a back-dated transaction in the middle of history still produces the
-- right balance on every later day.

begin;

-- ---------------------------------------------------------------------------
-- 1. Categories: kind, icon, and the account type
-- ---------------------------------------------------------------------------

alter table public.finance_categories
  add column if not exists kind text,
  add column if not exists icon text,
  -- Marks the app's own starter categories. Only used to decide whether to offer
  -- "reset to defaults"; deleting one is always allowed.
  add column if not exists is_system boolean not null default false;

-- The inline check from migration 012 has an auto-generated name, but the name
-- depends on whether it was written inline or as a named constraint, so the
-- constraint is located by definition rather than guessed. Dropping the wrong
-- one would leave `type` unconstrained, which is worse than the problem.
do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.finance_categories'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%type%income%expense%'
  loop
    execute format('alter table public.finance_categories drop constraint %I', constraint_row.conname);
  end loop;
end
$$;

alter table public.finance_categories
  add constraint finance_categories_type_check
    check (type in ('income', 'expense', 'account'));

-- NULL kind is allowed on purpose: a category the user creates themselves has
-- not been classified, and the app renders the generic treatment for it rather
-- than pretending it is one of the built-in books.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'finance_categories_kind_check'
  ) then
    alter table public.finance_categories
      add constraint finance_categories_kind_check
        check (kind is null or kind in (
          'income', 'expense', 'household', 'cash_bank', 'investment', 'liability'
        ));
  end if;
end
$$;

create index if not exists finance_categories_user_kind_idx
  on public.finance_categories (user_id, kind, name);

-- ---------------------------------------------------------------------------
-- 2. Opening balances, one per category
-- ---------------------------------------------------------------------------

create table if not exists public.finance_accounts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- A category can be an account at most once. Cascading means deleting the
  -- category deletes its opening balance rather than orphaning a number that
  -- nothing can explain any more.
  category_id  uuid not null unique references public.finance_categories (id) on delete cascade,

  -- Money held on the 1st of `opening_month`, before any transaction that month.
  -- Negative is allowed and meaningful: a credit card is a liability, so its
  -- balance starts below zero and grows more negative as you spend on it.
  opening_balance numeric(14, 2) not null default 0,
  -- Transactions dated before this month are outside the running balance, so a
  -- user who only starts tracking today does not see their balance jump to zero
  -- every month they add a correction.
  opening_month   text not null check (opening_month ~ '^\d{4}-\d{2}$'),

  currency     text not null default 'INR' check (char_length(currency) = 3),
  notes        text check (notes is null or char_length(notes) <= 5000),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists finance_accounts_user_idx
  on public.finance_accounts (user_id);

alter table public.finance_accounts enable row level security;
drop policy if exists "finance_accounts_owner_all" on public.finance_accounts;
create policy "finance_accounts_owner_all" on public.finance_accounts
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists set_updated_at on public.finance_accounts;
create trigger set_updated_at before update on public.finance_accounts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Holdings join a category, so "Mutual Funds" has its own portfolio page
-- ---------------------------------------------------------------------------

-- A holding is money in a specific place — a PPF account, a Nifty index fund.
-- Without this link an investment category could only ever show transactions,
-- which is not what an investment *is*: it has a cost basis and a current value.
-- `on delete set null` rather than cascade, so re-categorising a holding never
-- destroys the portfolio record.
alter table public.finance_holdings
  add column if not exists category_id uuid references public.finance_categories (id) on delete set null;

create index if not exists finance_holdings_user_category_idx
  on public.finance_holdings (user_id, category_id)
  where category_id is not null;

-- ---------------------------------------------------------------------------
-- 4. Backfill the existing categories
-- ---------------------------------------------------------------------------

-- Every pre-existing category becomes a plain expense or income book. Nothing is
-- guessed from its name: "Rent" could have been typed as income by mistake, and
-- silently moving it would change the balances that were already on screen.
update public.finance_categories
   set kind = 'expense'
 where kind is null and type = 'expense';

update public.finance_categories
   set kind = 'income'
 where kind is null and type = 'income';

-- ---------------------------------------------------------------------------
-- 5. Per-category report index
-- ---------------------------------------------------------------------------

-- Every report is "everything for one category between two dates", which is
-- exactly what this index serves. The existing user/category index orders by id
-- and cannot skip to a date range.
create index if not exists finance_transactions_user_category_date_idx
  on public.finance_transactions (user_id, category_id, transaction_date desc);

comment on column public.finance_categories.kind is
  'Which book this category belongs to: household, cash_bank, investment, liability, income, expense. NULL = unclassified.';
comment on column public.finance_categories.type is
  'income / expense are buckets; account is a container of money (cash in hand, a credit card) that must stay out of income and expense breakdowns.';
comment on table public.finance_accounts is
  'Opening balance per category. The running balance is derived from this plus transactions, never stored.';

commit;
