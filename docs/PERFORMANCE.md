# Ownspece — Performance Documentation

## Current Architecture

### Data Flow
- Server Components fetch from Supabase via DAL layer
- React `cache()` memoizes data within a render pass
- Client Components use hooks for local UI state
- No IndexedDB/offline layer

### Performance Issues Addressed
1. **Dashboard loading**: All widgets now use `Promise.all` but render independently with skeleton states
2. **N+1 queries**: DAL functions use single queries with proper joins
3. **Duplicate requests**: `cache()` prevents duplicate fetches within a render pass
4. **Search**: Debounced via command palette; server-side search with limits

### Optimization Strategies

#### Server-Side
- `React.cache()` for memoizing data fetches
- `server-only` directive for DAL modules
- `revalidatePath()` for cache invalidation
- Pagination on large collections

#### Client-Side
- Skeleton loading states
- `Suspense` boundaries for independent widget loading
- `useTransition` for non-blocking state updates
- `requestAnimationFrame` for deferred initialization

### Loading States
- `PageSkeleton` — Full page skeleton
- `CardSkeleton` — Card grid skeleton
- Empty states with action buttons
- Error states with retry options

### Code Splitting
- Next.js app router provides automatic code splitting
- Heavy features loaded on demand
- Dynamic imports for chart components

### Database Optimization
- Proper indexes on all foreign keys
- RLS policies use indexed columns
- `LIMIT` clauses on all queries
- Pagination on large collections

### Known Issues
- Dashboard `Promise.all` blocks initial render until all data resolves
- Some pages have `force-dynamic` rendering
- Search queries may be slow with large datasets

### Recommendations
1. Add IndexedDB for offline caching and faster initial loads
2. Implement a sync queue for offline mutations
3. Add pagination to large list views
4. Implement debounced/throttled search
5. Add client-side caching with stale-while-revalidate
6. Use React Server Components for static content
