-- 027 — choose which categories show on the finance page
--
-- What was missing
-- ----------------
-- Migration 026 gave every category a book, a report and a page, and the app
-- seeded thirty of them. Nothing was left to decide which of those thirty a user
-- actually wants looking at them every day: the money page showed all of them,
-- so a household that spends on six things scrolled past twenty-four empty
-- tiles to find them.
--
-- This adds `is_pinned` — the user picks the tiles worth their main page and the
-- rest stay available on their own pages.
--
-- Why a column and not a browser preference
-- -----------------------------------------
-- The category board is rendered by the server from one read per page load. A
-- localStorage flag would have to be applied on the client, which means either a
-- flash of tiles the user had hidden, or a request for every category followed by
-- a client filter — the first looks broken, the second doubles the query and
-- still flashes. Pinning in the database means the server sends only the tiles
-- that belong on the page, so there is nothing to reconcile after paint.
--
-- It also makes the choice follow the user across devices and browsers, which is
-- what people expect from a preference about their own ledger.

begin;

alter table public.finance_categories
  add column if not exists is_pinned boolean not null default true;

comment on column public.finance_categories.is_pinned is
  'Shown on the main finance page. Unpinned categories keep their report and their own page, they just are not listed on the money page.';

commit;
