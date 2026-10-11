-- ============================================================================
-- Ownspece migration 016 — wider appearance palettes
--
-- The appearance system gained three accents (lime, fuchsia, sky) and a
-- "gradient" card style. The CHECK constraints from 012 are the database's
-- source of truth for the allowed values, so they have to be widened in the
-- same migration that the application starts offering the new options —
-- otherwise the Zod enum accepts "lime" and Postgres rejects it with a
-- constraint violation the user can do nothing about.
-- ============================================================================

begin;

alter table public.user_preferences
  drop constraint if exists user_preferences_accent_color_check;

alter table public.user_preferences
  add constraint user_preferences_accent_color_check
  check (accent_color in (
    'indigo', 'violet', 'blue', 'cyan', 'emerald', 'teal',
    'rose', 'orange', 'amber', 'lime', 'fuchsia', 'sky'
  ));

alter table public.user_preferences
  drop constraint if exists user_preferences_card_style_check;

alter table public.user_preferences
  add constraint user_preferences_card_style_check
  check (card_style in (
    'default', 'elevated', 'soft', 'outline', 'glass', 'compact', 'gradient'
  ));

commit;