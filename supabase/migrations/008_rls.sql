-- ============================================================================
-- Ownspece migration 008 — Row Level Security
--
-- RLS is enabled on every user-owned table. If any statement in this file
-- fails, the whole migration aborts and nothing partial is applied.
-- Policies scope every statement to auth.uid(). Child records additionally
-- verify that their parent (project / task / etc.) belongs to the user via
-- the public.user_owns_* helpers (security invoker, never bypass RLS).
-- Junction tables verify BOTH referenced parents.
-- ============================================================================

begin;

-- profiles: user may manage only their own row.
alter table public.profiles enable row level security;
create policy "profiles_owner_all" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- user_preferences
alter table public.user_preferences enable row level security;
create policy "user_preferences_owner_all" on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- tags
alter table public.tags enable row level security;
create policy "tags_owner_all" on public.tags
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- projects
alter table public.projects enable row level security;
create policy "projects_owner_all" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- project_tags (junction: both sides must belong to the user)
alter table public.project_tags enable row level security;
create policy "project_tags_owner_all" on public.project_tags
  for all
  using (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and user_owns_tag(tag_id)
  )
  with check (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and user_owns_tag(tag_id)
  );

-- project_phases
alter table public.project_phases enable row level security;
create policy "project_phases_owner_all" on public.project_phases
  for all
  using (user_id = auth.uid() and user_owns_project(project_id))
  with check (user_id = auth.uid() and user_owns_project(project_id));

-- milestones
alter table public.milestones enable row level security;
create policy "milestones_owner_all" on public.milestones
  for all
  using (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (phase_id is null or user_owns_phase(phase_id))
  )
  with check (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (phase_id is null or user_owns_phase(phase_id))
  );

-- tasks
alter table public.tasks enable row level security;
create policy "tasks_owner_all" on public.tasks
  for all
  using (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (phase_id is null or user_owns_phase(phase_id))
  )
  with check (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (phase_id is null or user_owns_phase(phase_id))
  );

-- task_dependencies (both task ids must belong to the user)
alter table public.task_dependencies enable row level security;
create policy "task_dependencies_owner_all" on public.task_dependencies
  for all
  using (
    user_id = auth.uid()
    and user_owns_task(task_id)
    and user_owns_task(depends_on_task_id)
  )
  with check (
    user_id = auth.uid()
    and user_owns_task(task_id)
    and user_owns_task(depends_on_task_id)
  );

-- task_tags (junction)
alter table public.task_tags enable row level security;
create policy "task_tags_owner_all" on public.task_tags
  for all
  using (
    user_id = auth.uid()
    and user_owns_task(task_id)
    and user_owns_tag(tag_id)
  )
  with check (
    user_id = auth.uid()
    and user_owns_task(task_id)
    and user_owns_tag(tag_id)
  );

-- task_comments
alter table public.task_comments enable row level security;
create policy "task_comments_owner_all" on public.task_comments
  for all
  using (user_id = auth.uid() and user_owns_task(task_id))
  with check (user_id = auth.uid() and user_owns_task(task_id));

-- checklists
alter table public.checklists enable row level security;
create policy "checklists_owner_all" on public.checklists
  for all
  using (user_id = auth.uid() and user_owns_task(task_id))
  with check (user_id = auth.uid() and user_owns_task(task_id));

-- checklist_items
alter table public.checklist_items enable row level security;
create policy "checklist_items_owner_all" on public.checklist_items
  for all
  using (user_id = auth.uid() and user_owns_checklist(checklist_id))
  with check (user_id = auth.uid() and user_owns_checklist(checklist_id));

-- notes
alter table public.notes enable row level security;
create policy "notes_owner_all" on public.notes
  for all
  using (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)))
  with check (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)));

-- note_versions
alter table public.note_versions enable row level security;
create policy "note_versions_owner_all" on public.note_versions
  for all
  using (user_id = auth.uid() and user_owns_note(note_id))
  with check (user_id = auth.uid() and user_owns_note(note_id));

-- note_tags (junction)
alter table public.note_tags enable row level security;
create policy "note_tags_owner_all" on public.note_tags
  for all
  using (
    user_id = auth.uid()
    and user_owns_note(note_id)
    and user_owns_tag(tag_id)
  )
  with check (
    user_id = auth.uid()
    and user_owns_note(note_id)
    and user_owns_tag(tag_id)
  );

-- daily_notes
alter table public.daily_notes enable row level security;
create policy "daily_notes_owner_all" on public.daily_notes
  for all
  using (user_id = auth.uid() and user_owns_project(project_id))
  with check (user_id = auth.uid() and user_owns_project(project_id));

-- planning_entries
alter table public.planning_entries enable row level security;
create policy "planning_entries_owner_all" on public.planning_entries
  for all
  using (user_id = auth.uid() and user_owns_project(project_id))
  with check (user_id = auth.uid() and user_owns_project(project_id));

-- calendar_events
alter table public.calendar_events enable row level security;
create policy "calendar_events_owner_all" on public.calendar_events
  for all
  using (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)))
  with check (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)));

-- reminders
alter table public.reminders enable row level security;
create policy "reminders_owner_all" on public.reminders
  for all
  using (
    user_id = auth.uid()
    and (project_id is null or user_owns_project(project_id))
    and (task_id is null or user_owns_task(task_id))
  )
  with check (
    user_id = auth.uid()
    and (project_id is null or user_owns_project(project_id))
    and (task_id is null or user_owns_task(task_id))
  );

-- notifications
alter table public.notifications enable row level security;
create policy "notifications_owner_all" on public.notifications
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- activities
alter table public.activities enable row level security;
create policy "activities_owner_all" on public.activities
  for all
  using (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)))
  with check (user_id = auth.uid() and (project_id is null or user_owns_project(project_id)));

-- wiki_pages
alter table public.wiki_pages enable row level security;
create policy "wiki_pages_owner_all" on public.wiki_pages
  for all
  using (user_id = auth.uid() and user_owns_project(project_id))
  with check (user_id = auth.uid() and user_owns_project(project_id));

-- wiki_versions
alter table public.wiki_versions enable row level security;
create policy "wiki_versions_owner_all" on public.wiki_versions
  for all
  using (user_id = auth.uid() and user_owns_wiki(wiki_page_id))
  with check (user_id = auth.uid() and user_owns_wiki(wiki_page_id));

-- wiki_tags (junction)
alter table public.wiki_tags enable row level security;
create policy "wiki_tags_owner_all" on public.wiki_tags
  for all
  using (
    user_id = auth.uid()
    and user_owns_wiki(wiki_page_id)
    and user_owns_tag(tag_id)
  )
  with check (
    user_id = auth.uid()
    and user_owns_wiki(wiki_page_id)
    and user_owns_tag(tag_id)
  );

-- time_entries
alter table public.time_entries enable row level security;
create policy "time_entries_owner_all" on public.time_entries
  for all
  using (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (task_id is null or user_owns_task(task_id))
  )
  with check (
    user_id = auth.uid()
    and user_owns_project(project_id)
    and (task_id is null or user_owns_task(task_id))
  );

-- pomodoro_sessions
alter table public.pomodoro_sessions enable row level security;
create policy "pomodoro_sessions_owner_all" on public.pomodoro_sessions
  for all
  using (user_id = auth.uid() and (task_id is null or user_owns_task(task_id)))
  with check (user_id = auth.uid() and (task_id is null or user_owns_task(task_id)));

-- files
alter table public.files enable row level security;
create policy "files_owner_all" on public.files
  for all
  using (
    user_id = auth.uid()
    and (project_id is null or user_owns_project(project_id))
    and (task_id is null or user_owns_task(task_id))
  )
  with check (
    user_id = auth.uid()
    and (project_id is null or user_owns_project(project_id))
    and (task_id is null or user_owns_task(task_id))
  );

commit;