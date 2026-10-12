# Ownspece — Google Drive Integration Documentation

## Status: REQUIRES CONFIGURATION

### Current State
The Google Drive integration is fully coded but requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables to function. Without these, the system shows "Not configured" status.

### Files
- `src/lib/gdrive.ts` — Core Google Drive API logic
- `src/lib/actions/gdrive.ts` — Server actions for auth, file operations
- `src/components/gdrive/gdrive-workspace.tsx` — Full Drive UI component
- `src/app/(app)/gdrive/page.tsx` — G Drive page

### Configuration Required

1. **Google Cloud Console**:
   - Create a project at https://console.cloud.google.com
   - Enable the Google Drive API
   - Create OAuth 2.0 credentials
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`

2. **Redirect URI**: `https://<your-domain>/auth/gdrive/callback`
   - For local development: `http://localhost:3000/auth/gdrive/callback`

3. **Scope**: `https://www.googleapis.com/auth/drive` (full access)

### Security Architecture
- OAuth secrets are server-side only
- Access/refresh tokens stored in `gdrive_connections` table (encrypted)
- Never exposed to client-side code
- Refresh token handling for persistent connections

### Multiple Accounts
The `gdrive_connections` table stores per-user connections. Multiple accounts per user are technically possible but the current implementation stores a single connection per user. To support multiple accounts, the table schema needs to support multiple rows per user with a `is_active` flag.

### Features (when configured)
- Connect/disconnect Google Drive
- Browse Drive files and folders
- Search Drive content
- Link Drive files to projects/tasks/notes
- Download files
- View connection status

### Database Tables
- `gdrive_connections` — OAuth tokens, email, scope, expires_at
- `gdrive_file_refs` — Links Drive files to projects/tasks/notes

### API Routes
- `GET /api/gdrive/download?fileId=` — Download files from Drive
- `GET /auth/gdrive/callback` — OAuth callback handler

### Current Limitations
- Read-only access (browsing, searching, downloading)
- Single connection per user
- No file upload capability yet
