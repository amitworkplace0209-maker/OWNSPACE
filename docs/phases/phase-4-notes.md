# Phase 4 — Notes

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The notes feature already existed and was largely complete (project filter,
search, pinned-first sorting, cards, create/edit dialog, detail view with edit
mode, git-style version history with restore, tag management, pin/favorite
toggles, delete with confirmation). This phase closed the remaining spec gaps.

## Changes

### Scope filter (All / Pinned / Favorites) — `src/components/notes/notes-workspace.tsx`
- Added a segmented control next to the project filter that scopes the list to
  **All**, **Pinned** (`is_pinned`) or **Favorites** (`is_favorited`),
  composing with the existing project filter and search. The DAL already
  supported `pinned`/`favorited` options; the UI now exposes equivalent
  filtering over the server-provided list.

### Tag chips on note cards
- Note cards now show up to 3 tag chips (from `tag_names`) inline, so
  tag-organized browsing works directly from the list without opening the
  detail view.

## Existing capability verified (unchanged)
- **Version history**: `note_versions` snapshots are captured on every content
  change (`updateNoteAction` / `restoreNoteVersionAction`) and browsable via
  the shared `VersionHistoryDialog` with one-click restore.
- **Pinning / favorites**: quick toggles on both list cards and the detail view,
  with `router.refresh()` revalidation.
- **Tags**: multi-select tag editor on the detail page (`setNoteTagsAction`
  does a clean diff-based add/remove on `note_tags`).
- **Project association**: note creation/edit assigns a project; the notes page
  deep-links into a pre-filtered project list from the note detail view.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Note "saved" indicator: notes save explicitly (Save button / `router.refresh`
  feedback) and versions are snapshotted on save — an autosave-with-indicator
  remains an optional polish item, not a correctness gap.