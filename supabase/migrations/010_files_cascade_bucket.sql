-- ============================================================================
-- Ownspece migration 010 — files FK cascade + private storage bucket
-- ----------------------------------------------------------------------------
-- 1. `files.project_id` / `files.task_id` were created `on delete set null`,
--    but the `files_scope` check requires at least one to be set. Deleting a
--    project that owns a file therefore fails (both become null). Change both
--    FKs to `on delete cascade` so project/task deletion can always complete.
-- 2. Create a private storage bucket for user files with per-user object
--    policies (owner only). Downloads use signed URLs generated server-side.
-- ============================================================================

begin;

alter table public.files
  drop constraint files_project_id_fkey,
  add constraint files_project_id_fkey
    foreign key (project_id) references public.projects (id) on delete cascade;

alter table public.files
  drop constraint files_task_id_fkey,
  add constraint files_task_id_fkey
    foreign key (task_id) references public.tasks (id) on delete cascade;

-- Storage: one private bucket; objects are stored under <user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ownspece-files', 'ownspece-files', false, 104857600, null)
on conflict (id) do nothing;

-- Owner-only access to their own folder.
create policy "ownspece_files_owner_read"
  on storage.objects for select
  using (bucket_id = 'ownspece-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ownspece_files_owner_insert"
  on storage.objects for insert
  with check (bucket_id = 'ownspece-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ownspece_files_owner_update"
  on storage.objects for update
  using (bucket_id = 'ownspece-files' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "ownspece_files_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'ownspece-files' and (storage.foldername(name))[1] = auth.uid()::text);

commit;