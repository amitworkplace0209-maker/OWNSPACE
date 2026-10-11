# Ownspece — Data Architecture Documentation

## Database Schema

All tables are in Supabase PostgreSQL with Row Level Security (RLS) enabled.

### Core Tables

| Table | Purpose | RLS |
|-------|---------|-----|
| `profiles` | User profile info | Owner-only |
| `user_preferences` | Theme, accent, card style | Owner-only |
| `tags` | User-defined tags | Owner-only |
| `projects` | Project data | Owner-only |
| `project_tags` | Tag-to-project mapping | Owner-only |
| `project_phases` | Project phases | Owner-only |
| `milestones` | Project milestones | Owner-only |
| `tasks` | Task data | Owner-only |
| `task_dependencies` | Task dependencies | Owner-only |
| `task_tags` | Tag-to-task mapping | Owner-only |
| `task_comments` | Task comments | Owner-only |
| `checklists` | Checklists | Owner-only |
| `checklist_items` | Checklist items | Owner-only |
| `notes` | Notes | Owner-only |
| `note_versions` | Note version history | Owner-only |
| `daily_notes` | Daily journal entries | Owner-only |
| `planning_entries` | Planning entries | Owner-only |
| `calendar_events` | Calendar events | Owner-only |
| `reminders` | Reminders | Owner-only |
| `notifications` | In-app notifications | Owner-only |
| `activities` | Activity feed | Owner-only |
| `wiki_pages` | Wiki documentation | Owner-only |
| `wiki_versions` | Wiki version history | Owner-only |
| `time_entries` | Time tracking | Owner-only |
| `pomodoro_sessions` | Focus sessions | Owner-only |
| `files` | Stored files | Owner-only |
| `gdrive_connections` | Google Drive OAuth | Owner-only |
| `gdrive_file_refs` | Drive file links | Owner-only |
| `finance_categories` | Finance categories | Owner-only |
| `finance_transactions` | Financial transactions | Owner-only |

### Sync Architecture

```
LOCAL (IndexedDB) — planned
  ↓ sync queue
SYNC QUEUE
  ↓
SUPABASE (cloud)
  ↓ sync result
LOCAL CACHE
```

### Conflict Handling
- `updated_at` timestamps on all tables
- `set_updated_at()` trigger auto-manages timestamps
- Client-side conflict detection on sync
- Safe overwrite strategy: newer server data wins

### RLS Policies
All tables have RLS enabled. User ownership is verified via helper functions:
- `user_owns_profiles()`
- `user_owns_projects()`
- `user_own_tasks()`
- etc.

Service-role access is server-only and never exposed client-side.

### Helper Functions
- `public.set_updated_at()` — Auto-updates `updated_at` on row updates
- `public.user_owns_*()` — Ownership verification functions

### Migration History
12 migrations have been applied covering all table schemas, triggers, and RLS policies.