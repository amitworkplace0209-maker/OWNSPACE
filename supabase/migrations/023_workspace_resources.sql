-- ============================================================================
-- Ownspece migration 023 — workspace-wide resources
--
-- The unified /resources page lists every attachment in the workspace at once:
-- files in Supabase Storage, files linked from Google Drive, and links /
-- repositories / documents held in `project_resources`.
--
-- Two things have to change for that to be possible.
--
-- 1. `files_scope` blocked a global upload.
--    Migration 006 added
--      constraint files_scope check (project_id is not null or task_id is not null)
--    because both foreign keys were `on delete set null` — deleting a project
--    would null `project_id` on its files and leave a row that satisfied
--    nothing. Migration 010 switched both to `on delete cascade`, which removes
--    the row instead of orphaning it, so the reason for the constraint is gone.
--    What survived was a check that made every top-level upload fail: the row
--    was rejected with "Could not save the file metadata." after the blob had
--    already been written, and the orphan rolled around in /storage.
--
-- 2. `project_resources` requires a project.
--    `project_id` is NOT NULL with ON DELETE CASCADE, which is right for the
--    per-project Resources tab but wrong for a workspace-wide link. It becomes
--    nullable; deleting a project still removes its resources, and a link that
--    is no longer attached to anything simply has a null project_id.
--
-- Nothing here loosens RLS: `files_owner_all` already allows a null project_id
-- or task_id, and `project_resources_owner_all` is owner-only regardless.
-- ============================================================================

begin;

-- 1. Drop the now-obsolete scope check.
alter table public.files
  drop constraint if exists files_scope;

comment on table public.files is
  'Files in Supabase Storage. project_id / task_id are both nullable — a file can be workspace-wide. Deleting a project or task removes its files.';

-- 2. Resources may exist without a project.
alter table public.project_resources
  alter column project_id drop not null;

-- Filtering "everything in this project" is the hot path for the project
-- Resources tab, and now that some rows have no project the index has to
-- tolerate the null.
create index if not exists project_resources_user_created_idx
  on public.project_resources (user_id, created_at desc);

-- 3. A link with neither a name nor a URL is unopenable. The name check already
--    covers the blank-name case; this one covers a row that is only ever a URL.
alter table public.project_resources
  drop constraint if exists project_resources_needs_target;
alter table public.project_resources
  add constraint project_resources_needs_target
  check (
    char_length(btrim(coalesce(name, ''))) > 0
    or char_length(btrim(coalesce(url, ''))) > 0
    or char_length(btrim(coalesce(storage_path, ''))) > 0
    or char_length(btrim(coalesce(gdrive_file_id, ''))) > 0
  );

commit;