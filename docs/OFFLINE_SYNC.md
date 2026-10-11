# Ownspece — Offline Sync Documentation

## Status: REQUIRES IMPLEMENTATION (Phase 15)

### Current State
- No IndexedDB implementation
- No offline data persistence
- No sync architecture
- All data stored exclusively in Supabase

### Planned Architecture

```
LOCAL (IndexedDB)
  ↓ sync queue
SYNC QUEUE
  ↓
SUPABASE (cloud)
  ↓ sync result
LOCAL CACHE
```

### Local Data Support (when implemented)
- Recent projects
- Tasks (create/edit)
- Notes (create/edit)
- Daily Notes
- Calendar
- Reminders (create/edit)
- Settings/preferences
- Cached file metadata
- Recent search results

### Offline Capabilities (when implemented)
- View cached data
- Create tasks
- Edit notes
- Create planning entries
- Create reminders
- Update checklists
- View projects

### Sync Queue
1. **Mutation captured** → Store in local IndexedDB
2. **Online** → Sync queue processes mutation
3. **Supabase** → Server receives mutation
4. **Sync result** → Confirm/update local cache
5. **Local cache** → Update IndexedDB

### Conflict Handling
- `updated_at` timestamp on all tables
- Local version tracking
- Server version comparison
- Safe conflict strategy: newer data wins
- No silent overwrites of newer server data

### Sync Status Indicators
- **Online** — Connection active
- **Offline** — No connection
- **Syncing** — Processing queued changes
- **Synced** — All changes applied
- **Sync Error** — Conflict or failure detected

### Implementation Plan (Phase 15)

1. **IndexedDB Setup**: `idb` library or native IndexedDB
2. **Local Data Layer**: Cache management
3. **Sync Queue**: Store pending mutations
4. **Online Detection**: `navigator.onLine` + event listeners
5. **Sync Engine**: Process queue when online
6. **Conflict Resolution**: Timestamp-based strategy
7. **UI Indicators**: Sync status display

### Security Notes
- Never store sensitive auth tokens in IndexedDB
- Use Supabase auth for server access
- Validate all mutations server-side
- RLS policies still enforced on server

### Database Requirements
No new tables needed for basic sync. The existing `updated_at` columns provide conflict detection.

### Libraries to Consider
- `idb` — Simple IndexedDB wrapper
- `dexie-js` — Full IndexedDB wrapper
- `sync-store` — Sync queue management

### Testing Checklist
- Offline mode: Create, edit, view data
- Online mode: Sync pending changes
- Conflict scenario: Modify same data on both sides
- Reconnection: Verify sync completes
- Error handling: Verify graceful degradation