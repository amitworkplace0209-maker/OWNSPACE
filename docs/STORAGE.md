# Ownspece — Storage Documentation

## Storage Architecture

Ownspece has two distinct storage systems that are NOT combined:

### 1. Supabase Storage
**Purpose**: Ownspece application files uploaded by the user.

**Bucket**: `ownspece-files`

**Features**:
- Upload files
- Drag & drop
- Preview
- Download
- Delete
- Search/filter/sort
- Related project/task tracking

**Table**: `files`
- `id`, `user_id`, `project_id`, `task_id`, `name`, `storage_path`, `mime_type`, `size_bytes`, `created_at`, `updated_at`

**Categories**: Images, Videos, PDF, Documents, ZIP, Source Code, Other

### 2. Google Drive Storage
**Purpose**: User's Google Drive files (separate from Ownspece).

**Features**:
- Browse Drive files/folders
- Search Drive content
- Link Drive files to projects/tasks/notes
- Download files
- View storage info where available

**Tables**: `gdrive_connections`, `gdrive_file_refs`

**Status**: REQUIRES CONFIGURATION (needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`)

## Storage Dashboard (`/storage`)

### Supabase Storage Section
- Total files
- Used storage
- File count
- Recent uploads
- File categories breakdown

### Google Drive Section
- Connection status
- Per-account storage info
- File counts per account

## Storage UI Features
- Progress bar for usage
- Usage card
- File category chart
- File upload (drag & drop)
- File filtering by category, size, type
- Sort by name, date, size

## Storage Rules
1. **Never merge** Supabase Storage and Google Drive into one system
2. **Always show source** (Supabase vs Google Drive) for every file
3. **Never invent storage limits** — only show values from APIs
4. **Separate storage sections** in the UI

## File Management
- `uploadFile` — Upload to Supabase Storage
- `downloadFile` — Download from Supabase Storage
- `deleteFile` — Delete from Supabase Storage
- `listFiles` — List files with categories
- `getStorageStats` — Get storage statistics
- `categorizeFile` — Categorize by MIME type/extension

## File Categories
Images, Videos, PDF, Documents, ZIP, Source Code, Other

## Google Drive Rules
- Read-only access (browsing, searching, downloading)
- Never expose OAuth secrets to client
- Server-side token storage only
- Report "NOT CONFIGURED" when credentials missing
- Report "CONNECTION ERROR" when connection fails
- Never fake connection status