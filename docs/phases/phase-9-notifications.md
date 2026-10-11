# Phase 9 — Notifications

Status: **Complete** (verified: typecheck ✓, lint ✓, 28 tests ✓, production build ✓).

## Scope

The notification center already had All/Unread/Read tabs, a type filter,
per-item mark-read and delete, "mark all as read", live counts, and an
empty state. This phase added bulk management and the inverse (mark unread /
clear read).

## Changes

### Bulk actions (`src/lib/actions/notifications.ts`)
New server actions:
- `markNotificationsReadAction(ids)` — mark a set read.
- `deleteNotificationsAction(ids)` — delete a set.
- `clearReadNotificationsAction()` — delete all read notifications.
- `markNotificationUnreadAction(id)` — flip one back to unread.

All are scoped by `user_id`, guarded against empty id lists, use
`friendlyError`, and revalidate `/notifications`, `/dashboard` and (where
relevant) `/activity`.

### Workspace (`src/components/notifications/notifications-workspace.tsx`)
- A selection toolbar above the list (`Checkbox` + "N selected") with
  **Mark read** and **Delete** actions for the selection, plus **Clear read**
  when any read notifications exist.
- Per-row selection checkbox; a per-row **Mark as unread** button for read
  items (previously only mark-read existed).
- Read count is derived as `totalCount - unreadCount`, so no extra DAL field
  was needed.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS (28 tests) |
| `npm run build` | PASS (33 routes, proxy active) |

## Carry-forward
- Selection is keyed by notification id and intersected with the currently
  visible list, so switching filters never acts on hidden rows.
- Notifications stay in sync with the dashboard's reminder sweep
  (`processDueRemindersAction`); no changes were needed there.
- The `AppNotification` type still has no link/entity field, so rows are not
  clickable-through to their source; tracked for a later schema addition.