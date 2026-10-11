# Ownspece — UI Components Documentation

## Shared Components

### StatCard (`src/components/shared/stat-card.tsx`)
Large number + label + optional trend indicator. Has a colored top bar on hover. Supports navigation via `href`.

**Props**: `title`, `value`, `href?`, `icon?`, `trend?`, `variant?`, `className?`

### ProjectCard (`src/components/shared/project-card.tsx`)
Project card with banner, status indicator, progress bar, metadata, and hover actions.

**Props**: `project`, `className?`

### TaskCard (`src/components/shared/task-card.tsx`)
Task card with priority/status badges, due date, progress indicator, and hover actions. Supports compact mode.

**Props**: `task`, `compact?`, `className?`

### SectionHeader (`src/components/shared/section-header.tsx`)
Section header with title, description, and optional actions.

**Props**: `title`, `description?`, `actions?`, `className?`

### CardGrid (`src/components/shared/card-grid.tsx`)
Responsive card grid with configurable column counts.

**Props**: `children`, `cols?`, `className?`

### TimelineItem (`src/components/shared/timeline-item.tsx`)
Timeline item with icon dot and connecting line.

**Props**: `activity`, `className?`

### EmptyState (`src/components/shared/empty-state.tsx`)
Empty state with icon, title, description, and optional action.

**Props**: `icon?`, `title`, `description?`, `action?`, `className?`

### PageHeader (`src/components/shared/page-header.tsx`)
Page header with title, description, and optional actions.

**Props**: `title`, `description?`, `actions?`

### PageSkeleton (`src/components/shared/skeletons.tsx`)
Full page loading skeleton.

**Props**: `rows?`

### CardSkeleton (`src/components/shared/skeletons.tsx`)
Card grid loading skeleton.

**Props**: `count?`

## Layout Components

### AppSidebar (`src/components/layout/app-sidebar.tsx`)
Collapsible sidebar with navigation groups, search button, quick create menu, and user menu. Supports unread badge on notifications.

### Topbar (`src/components/layout/topbar.tsx`)
Sticky topbar with page title, search, quick create, notifications, theme toggle, and user menu.

### MobileBottomNav (`src/components/layout/mobile-bottom-nav.tsx`)
Fixed bottom navigation for mobile with "More" drawer.

### ThemeToggle (`src/components/layout/theme-toggle.tsx`)
Theme switcher (Light/Dark/System) with persistence.

### UserMenu (`src/components/layout/user-menu.tsx`)
User profile dropdown with settings, profile, and logout.

## Status & Badge Components (`src/components/shared/badges.tsx`)

### ProjectStatusBadge
Maps project status to colored badge (active/on_hold/completed/archived).

### TaskStatusBadge
Maps task status to colored badge (backlog/todo/in_progress/done/cancelled).

### PriorityBadge
Maps priority to colored badge (none/low/medium/high/urgent).

### PhaseStatusBadge, MilestoneStatusBadge
Maps phase/milestone status to colored badges.

## Card Variants (shadcn/ui)

The shadcn `Card` component supports `variant` prop:
- `default` — Clean surface
- `elevated` — Soft shadow
- `soft` — Tinted background
- `outline` — Border only
- `glass` — Frosted glass
- `compact` — Reduced spacing

## Form Components

### FormField (`src/components/shared/form-field.tsx`)
Labeled input wrapper with optional error display.

### ConfirmDialog (`src/components/shared/confirm-dialog.tsx`)
Confirmation dialog with action button.

### CommandPalette (`src/components/layout/command-palette.tsx`)
Global command palette triggered by Ctrl+K.
