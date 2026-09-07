-- ============================================================================
-- Ownspece migration 007 — updated_at triggers (re-runnable)
-- ============================================================================

begin;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.user_preferences;
create trigger set_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.tags;
create trigger set_updated_at before update on public.tags
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.projects;
create trigger set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.project_phases;
create trigger set_updated_at before update on public.project_phases
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.milestones;
create trigger set_updated_at before update on public.milestones
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.tasks;
create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.task_comments;
create trigger set_updated_at before update on public.task_comments
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.checklists;
create trigger set_updated_at before update on public.checklists
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.checklist_items;
create trigger set_updated_at before update on public.checklist_items
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.notes;
create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.daily_notes;
create trigger set_updated_at before update on public.daily_notes
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.planning_entries;
create trigger set_updated_at before update on public.planning_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.calendar_events;
create trigger set_updated_at before update on public.calendar_events
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.reminders;
create trigger set_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.wiki_pages;
create trigger set_updated_at before update on public.wiki_pages
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.time_entries;
create trigger set_updated_at before update on public.time_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.pomodoro_sessions;
create trigger set_updated_at before update on public.pomodoro_sessions
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.files;
create trigger set_updated_at before update on public.files
  for each row execute function public.set_updated_at();

commit;