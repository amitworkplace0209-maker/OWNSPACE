-- ============================================================================
-- Ownspece migration 012 — appearance preferences, finance, google drive
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Appearance preferences on user_preferences
-- ---------------------------------------------------------------------------

alter table public.user_preferences
  add column accent_color text not null default 'indigo'
    check (accent_color in ('indigo', 'violet', 'blue', 'cyan', 'emerald', 'teal', 'rose', 'orange', 'amber'));

alter table public.user_preferences
  add column card_style text not null default 'default'
    check (card_style in ('default', 'elevated', 'soft', 'outline', 'glass', 'compact'));

alter table public.user_preferences
  add column density text not null default 'comfortable'
    check (density in ('comfortable', 'compact'));

alter table public.user_preferences
  add column background_preset text not null default 'clean'
    check (background_preset in ('clean', 'soft', 'tinted', 'contrast', 'deep', 'slate', 'charcoal'));

-- ---------------------------------------------------------------------------
-- 2. Finance
-- ---------------------------------------------------------------------------

create table public.finance_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('income', 'expense')),
  color      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_categories_user_name_unique unique (user_id, name, type),
  constraint finance_categories_name_not_blank check (char_length(btrim(name)) > 0)
);

create table public.finance_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  category_id      uuid references public.finance_categories (id) on delete set null,
  project_id       uuid references public.projects (id) on delete set null,
  type             text not null check (type in ('income', 'expense')),
  amount           numeric(14, 2) not null check (amount > 0),
  description      text,
  payment_method   text check (payment_method in ('cash', 'card', 'bank_transfer', 'upi', 'wallet', 'other')),
  tags             text[],
  notes            text,
  transaction_date date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint finance_transactions_description_length check (description is null or char_length(description) <= 300),
  constraint finance_transactions_notes_length check (notes is null or char_length(notes) <= 5000)
);

create index finance_transactions_user_date_idx on public.finance_transactions (user_id, transaction_date desc);
create index finance_transactions_user_type_idx on public.finance_transactions (user_id, type);
create index finance_transactions_user_category_idx on public.finance_transactions (user_id, category_id);
create index finance_transactions_user_project_idx on public.finance_transactions (user_id, project_id);

-- ---------------------------------------------------------------------------
-- 3. Google Drive connections + file references
-- ---------------------------------------------------------------------------

create table public.gdrive_connections (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  email         text,
  refresh_token text not null,
  access_token  text,
  scope         text,
  expires_at    timestamptz,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- References to Google Drive files attached to projects / tasks / notes.
-- Only the metadata + web link are stored; the file itself lives in Drive.
create table public.gdrive_file_refs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid references public.projects (id) on delete cascade,
  task_id       uuid references public.tasks (id) on delete cascade,
  note_id       uuid references public.notes (id) on delete cascade,
  drive_file_id text not null,
  drive_name    text not null,
  mime_type     text,
  size_bytes    bigint,
  modified_at   timestamptz,
  web_link      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint gdrive_file_refs_name_not_blank check (char_length(btrim(drive_name)) > 0)
);

create index gdrive_file_refs_user_project_idx on public.gdrive_file_refs (user_id, project_id);
create index gdrive_file_refs_user_task_idx on public.gdrive_file_refs (user_id, task_id);
create index gdrive_file_refs_user_note_idx on public.gdrive_file_refs (user_id, note_id);

-- ---------------------------------------------------------------------------
-- 4. Row Level Security for the new tables
-- ---------------------------------------------------------------------------

alter table public.finance_categories   enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.gdrive_connections   enable row level security;
alter table public.gdrive_file_refs     enable row level security;

create policy "finance_categories_owner_all"
  on public.finance_categories for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "finance_transactions_owner_all"
  on public.finance_transactions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "gdrive_connections_owner_all"
  on public.gdrive_connections for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "gdrive_file_refs_owner_all"
  on public.gdrive_file_refs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Notification type constraint currently only allows 4 values. Keep the
--    app-level categories mapped to those types — no schema change needed.
-- ---------------------------------------------------------------------------

commit;