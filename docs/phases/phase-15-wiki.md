# Phase 15 — Wiki

Status: **Complete** (verified: typecheck ✓, lint ✓, production build ✓).

## Scope

Wiki already supported page creation and editing with a tree structure. This phase added deep-link navigation, Markdown rendering, and exported a label helper used across the app.

## Fixes

### Deep-link cards (?page=slug)
- Wiki page cards now respond to `?page=slug` search params, enabling direct links to any page.
- The slug is validated server-side against existing pages before rendering.

### react-markdown rendering
- Page content is now rendered via `react-markdown` instead of raw HTML, giving safe, styled Markdown output.

### `statusLabelOf` export
- Exported `statusLabelOf` from the wiki module so other consumers (timeline, etc.) can map raw status enums to human labels without importing internals.

## Verification

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |

## Carry-forward
- Wiki page tree depth is still unbounded (no nesting limit enforced).
- Revision history (`wiki_versions`) is stored but not surfaced in the UI.
