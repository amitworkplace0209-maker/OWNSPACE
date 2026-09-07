-- ============================================================================
-- Ownspece migration 004 — notes & knowledge (notes, versions, note tags,
-- daily notes, planning entries, wiki pages, wiki versions, wiki tags)
-- ============================================================================

begin;

-- content holds the current snapshot; history lives in note_versions.
create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete set null,
  title       text not null,
  content     text not null default '',
  is_pinned   boolean not null default false,
  is_favorited boolean not null default false,
  color       text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notes_title_not_blank check (char_length(btrim(title)) > 0)
);

create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index notes_user_pinned_idx  on public.notes (user_id, is_pinned);
create index notes_project_idx      on public.notes (project_id);

-- append-only history; no updated_at
create table public.note_versions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  note_id    uuid not null references public.notes (id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

create index note_versions_note_created_idx on public.note_versions (note_id, created_at desc);

create table public.note_tags (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note_id uuid not null references public.notes (id) on delete cascade,
  tag_id  uuid not null references public.tags (id) on delete cascade,
  constraint note_tags_unique unique (note_id, tag_id)
);

create index note_tags_user_idx on public.note_tags (user_id);
create index note_tags_tag_idx  on public.note_tags (tag_id);

-- One entry per (user, project, date). Unique constraint prevents accidentally
-- creating duplicate daily entries for the same project/date.
create table public.daily_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  note_date  date not null,
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_notes_project_date_unique unique (user_id, project_id, note_date)
);

create index daily_notes_user_date_idx on public.daily_notes (user_id, note_date);
create index daily_notes_project_idx    on public.daily_notes (project_id);

create table public.planning_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_date  date not null,
  start_time time,
  end_time   time,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_entries_time_range check (start_time is null or end_time is null or end_time > start_time)
);

create index planning_entries_user_date_idx on public.planning_entries (user_id, plan_date);
create index planning_entries_project_idx    on public.planning_entries (project_id);

-- Belongs to a project; parent_id builds the page tree.
create table public.wiki_pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  parent_id    uuid references public.wiki_pages (id) on delete set null,
  title        text not null,
  slug         text not null,
  content      text not null default '',
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint wiki_pages_project_slug_unique unique (project_id, slug),
  constraint wiki_pages_title_not_blank check (char_length(btrim(title)) > 0),
  constraint wiki_pages_slug_not_blank check (char_length(btrim(slug)) > 0),
  constraint wiki_pages_no_self_parent check (parent_id is null or parent_id <> id)
);

create index wiki_pages_project_idx on public.wiki_pages (project_id);
create index wiki_pages_parent_idx  on public.wiki_pages (parent_id);

-- append-only history; no updated_at
create table public.wiki_versions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  wiki_page_id uuid not null references public.wiki_pages (id) on delete cascade,
  content      text not null,
  created_at   timestamptz not null default now()
);

create index wiki_versions_page_created_idx on public.wiki_versions (wiki_page_id, created_at desc);

create table public.wiki_tags (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  wiki_page_id uuid not null references public.wiki_pages (id) on delete cascade,
  tag_id       uuid not null references public.tags (id) on delete cascade,
  constraint wiki_tags_unique unique (wiki_page_id, tag_id)
);

create index wiki_tags_user_idx on public.wiki_tags (user_id);
create index wiki_tags_tag_idx  on public.wiki_tags (tag_id);

commit;