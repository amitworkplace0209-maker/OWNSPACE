# Ownspece — UI Design System Documentation

## Overview

Ownspece uses a centralized design system based on CSS custom properties (variables) mapped via data attributes on the `<html>` element. The system supports multiple theme modes, accent presets, card styles, background presets, and density settings.

## Architecture

### Theme Provider Chain
```
next-themes (ThemeProvider)
  → AppearanceManager (applies data attributes to <html>)
    → CSS custom properties (globals.css)
      → Component styles
```

### Data Attributes
The `AppearanceManager` component (`src/components/providers/appearance-manager.tsx`) applies the following data attributes to `<html>`:

- `data-accent` — accent color (indigo, violet, blue, cyan, emerald, teal, rose, orange, amber)
- `data-card-style` — card visual style (default, elevated, soft, outline, glass, compact)
- `data-density` — spacing density (comfortable, compact)
- `data-background` — background preset (clean, soft, tinted, contrast, deep, slate, charcoal)

### CSS Token System (`src/app/globals.css`)

The design tokens are defined in `:root` (light mode) and `.dark` (dark mode):

- **Core tokens**: `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--destructive-foreground`, `--border`, `--input`, `--ring`
- **Semantic tokens**: `--success`, `--warning`, `--danger`, `--info`
- **Surface tokens**: `--surface`, `--surface-muted`
- **Chart tokens**: `--chart-1` through `--chart-5`
- **Sidebar tokens**: `--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`

### Background Presets

**Light**: `clean` (default), `soft`, `tinted`, `contrast`
**Dark**: `deep`, `slate`, `charcoal`

The `deep` preset provides the darkest background (`oklch(0.12 0.006 250)`) for a rich dark mode experience without pure black.

### Card Styles

| Style | Description |
|-------|-------------|
| `default` | Clean surface with subtle depth |
| `elevated` | Soft drop shadow for depth |
| `soft` | Tinted accent background |
| `outline` | Bordered, backgroundless |
| `glass` | Translucent, frosted panels |
| `compact` | Reduced spacing density |

### Accent Colors

All 9 accent colors have both light and dark mode mappings with proper OKLCH color values. Each accent color remaps `--primary`, `--ring`, `--sidebar-primary`, and chart colors consistently.

## Usage

### Appearance Manager
```tsx
import { AppearanceManager } from "@/components/providers/appearance-manager";

<AppearanceManager
  theme="system"
  accent="indigo"
  cardStyle="default"
  density="comfortable"
  background="clean"
/>
```

### Theme Toggle
```tsx
import { ThemeToggle } from "@/components/layout/theme-toggle";
<ThemeToggle />
```

### Persistence
User preferences are stored in the `user_preferences` table and synced via `setThemeAction` and `updatePreferencesAction`.

## Responsive Design

- **Desktop** (≥1024px): Sidebar + content layout
- **Tablet** (768px–1023px): Compact sidebar / adaptive layout
- **Mobile** (<768px): Bottom navigation + drawer

## Accessibility

- `prefers-reduced-motion` respected
- Focus-visible outlines on all interactive elements
- Keyboard navigation supported
- Semantic HTML elements throughout

## Card Design System

### Stat Card
Large number + small label + optional trend indicator. Has a colored top bar.

### Project Card
Visual banner with status indicator, progress bar, metadata.

### Task Card
Priority/status badges, due date, progress indicator, hover actions.

### List Card
Compact list items with icons and metadata.

### Timeline Card
Timeline-style layout with dots and connecting lines.
