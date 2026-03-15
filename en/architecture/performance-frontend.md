# Frontend Performance

> Based on the codebase state on **March 15, 2026**, ordered by severity.

## 🔴 Critical

### 1. `MyAvatars` refresh still has a clear SQLite N+1 query pattern

- Location:
  `src/views/MyAvatars/MyAvatars.vue`
  `src/services/database/avatarFavorites.js`
- Current state:
  After fetching avatars, `refreshAvatars()` loads all tags once, then calls `database.getAvatarTimeSpent(ref.id)` once per avatar.
- Why it matters:
  Refresh cost trends toward `1 + N` database reads. As avatar counts grow, users feel the delay directly in page refresh completion.
- Direction:
  Replace per-avatar time queries with a batched lookup returned together with tags or in one extra query.

### 2. Feed / GameLog / notification search still depends on `LIKE '%x%'` and `UNION ALL`

- Location:
  `src/services/database/feed.js`
  `src/services/database/gameLog.js`
  `src/services/database/notifications.js`
- Current state:
  Several search paths still use `LIKE '%search%'` across multiple tables and then merge results through `UNION ALL`; notification search still builds SQL through string interpolation.
- Why it matters:
  These queries cannot meaningfully use normal indexes, so performance degrades with database age, table size, and typing frequency. This is one of the old performance-page findings that is still very much current.
- Direction:
  Long term, move to FTS5. Short term, at least parameterize the queries and evaluate whether some searches can use prefix matching or an in-memory index.

### 3. `FriendList` search does full filtering on every change and then triggers extra stats work

- Location:
  `src/views/FriendList/FriendList.vue`
  `src/stores/friend.js`
  `src/services/database/gameLog.js`
- Current state:
  `friendsListSearchChange()` scans the full friend collection for display name, memo, note, bio, status, and rank matches, then calls `getAllUserStats()` and `getAllUserMutualCount()`.
- Why it matters:
  This is not just UI filtering. Large SQL work is pulled back into the typing path, so input latency scales with both friend count and database age.
- Direction:
  Add debounce, move stats out of the per-keystroke path, and cache or lazily hydrate the expensive aggregates.

## 🟠 High

### 4. `FriendsLocations` still performs multiple full-data rebuilds before virtualization

- Location:
  `src/views/FriendsLocations/FriendsLocations.vue`
- Current state:
  The page uses virtualization, but still rebuilds upstream data through repeated `map`, `filter`, `flatMap`, sorting, dedupe, group merge, and `virtualRows` generation.
- Why it matters:
  CPU is still spent before virtualization even begins. Search, segment switching, same-instance grouping, and favorite-group changes can all rerun the full pipeline.
- Direction:
  Introduce more stable incremental caches for same-instance groups, search inputs, and virtual row data.

### 5. ~~`FriendsLocations` calls `virtualizer.measure()` too often~~ ✅ Resolved

- Location:
  `src/views/FriendsLocations/FriendsLocations.vue`
- Resolved in: `d52b0c7c`, `1c0a3509`
- What was done:
  Introduced `scheduleVirtualMeasure()` — a single coalescing path that batches all `measure()` calls behind one `nextTick`. Multiple watchers (`searchTerm`, `activeSegment`, `showSameInstance`, `filteredFriends.length`, `cardScale/cardSpacing`, `virtualRows`) now all funnel through this single path, eliminating redundant measurements per interaction. Also migrated manual `ResizeObserver` management to `@vueuse/core`'s `useResizeObserver`.

### 6. ~~One legacy quick-search path still scans all friends on the main thread~~ ✅ Resolved

- Location:
  `src/stores/search.js`
- Resolved in: `d52b0c7c`
- What was done:
  The legacy `quickSearchRemoteMethod()` function was completely removed along with its dependencies (`friendStore`, `removeConfusables`, `localeIncludes`, `quickSearchItems` ref). All quick-search is now routed exclusively through `quickSearchWorker`. `search.js` shrank from ~450 to ~300 lines, now only containing direct access parsing and user search API logic.

## 🟡 Medium

### 7. ~~Card-size sliders persist every drag step into SQLite config~~ ✅ Resolved (FriendsLocations)

- Location:
  `src/views/FriendsLocations/FriendsLocations.vue`
  `src/views/MyAvatars/composables/useAvatarCardGrid.js`
  `src/services/config.js`
- Resolved in: `d52b0c7c` (FriendsLocations), `1c0a3509` (useAvatarCardGrid ResizeObserver)
- What was done:
  `FriendsLocations` now wraps `configRepository.setString()` calls in `debounce(200ms)` for both `cardScale` and `cardSpacing` sliders. `useAvatarCardGrid` was refactored to use `@vueuse/core`'s `useResizeObserver` (removing manual `ResizeObserver` lifecycle), though its slider persistence was not debounced in this change.
- Remaining:
  `useAvatarCardGrid` slider setters still call `configRepository.setString()` directly on every drag step.

### 8. `FriendsSidebar` still does multi-pass full scans before render

- Location:
  `src/views/Sidebar/components/FriendsSidebar.vue`
- Current state:
  Even with virtualization, the sidebar still repeatedly rebuilds structures like `sameInstanceFriendId`, `visibleFavoriteOnlineFriends`, `vipFriendsDivideByGroup`, and `virtualRows`.
- Why it matters:
  DOM volume is controlled, but CPU time is still spent in repeated pre-render data shaping.
- Direction:
  Reuse pre-grouped structures and reduce repeated array construction in filter chains.

### 9. Favorite-store computed values sort source arrays in place

- Location:
  `src/stores/favorite.js`
- Current state:
  `favoriteFriends`, `favoriteWorlds`, and `favoriteAvatars` call `sort()` directly on their backing arrays inside computed getters.
- Why it matters:
  In-place sorting mutates source state, adds avoidable reactive churn, and makes large-list updates harder to reason about.
- Direction:
  Sort copies instead of source arrays, or cache a separate derived ordering.

### 10. ~~The Pinia action trail plugin reads and rewrites full `localStorage` JSON on every action~~ ✅ Removed

- Location:
  `src/plugins/piniaActionTrail.js` (deleted)
  `src/stores/index.js`
- Resolved in: `54f85c62`
- What was done:
  `piniaActionTrail.js` was completely deleted. The `registerPiniaActionTrailPlugin()` call and the 60-second delayed initialization were removed from `stores/index.js`. Crash recovery reporting in `vrcx.js` no longer reads or clears the trail. Replaced by `rendererMemoryReport.js` — a lightweight interval-based plugin that monitors `performance.memory` and sends a Sentry warning when JS heap usage exceeds 80% of the limit (with a 5-minute cooldown).

## Notes

- The main frontend bottleneck has shifted away from raw DOM volume and toward interaction paths that mix full recomputation with synchronous persistence work.
- Parts of the old monolithic performance page still have historical value, but sections about friend sorting and deep search watchers no longer describe the current top priorities.
