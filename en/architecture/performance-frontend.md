# Frontend Performance

> Based on the codebase state on **March 14, 2026**, ordered by severity.

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

### 5. `FriendsLocations` calls `virtualizer.measure()` too often

- Location:
  `src/views/FriendsLocations/FriendsLocations.vue`
- Current state:
  Changes to `searchTerm`, `activeSegment`, `showSameInstance`, `filteredFriends.length`, `cardScale/cardSpacing`, and `virtualRows` all trigger `nextTick + virtualizer.measure()`.
- Why it matters:
  One user interaction can fan out into multiple redundant measurements and layout work, which shows up as stutter during search and segment switches.
- Direction:
  Merge measurement triggers behind a single scheduled path and throttle to one measure per frame.

### 6. One legacy quick-search path still scans all friends on the main thread

- Location:
  `src/stores/search.js`
- Current state:
  `quickSearchRemoteMethod()` still loops over `friendStore.friends.values()` and applies `removeConfusables()` and `localeIncludes()` against names, memos, and notes.
- Why it matters:
  The repo already contains a worker-based quick-search implementation, which makes the remaining main-thread path a known regression risk whenever it is still used.
- Direction:
  Route all quick-search entry points through `quickSearchWorker` and retire the legacy main-thread path.

## 🟡 Medium

### 7. Card-size sliders persist every drag step into SQLite config

- Location:
  `src/views/FriendsLocations/FriendsLocations.vue`
  `src/views/MyAvatars/composables/useAvatarCardGrid.js`
  `src/services/config.js`
- Current state:
  Slider setters call `configRepository.setString()` directly, and the config backend writes through SQLite `INSERT OR REPLACE`.
- Why it matters:
  UI recalculation and frequent writes are stacked on top of each other during drag interactions.
- Direction:
  Persist on drag-end or debounce config writes.

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

### 10. The Pinia action trail plugin reads and rewrites full `localStorage` JSON on every action

- Location:
  `src/plugins/piniaActionTrail.js`
  `src/stores/index.js`
- Current state:
  The plugin does `getItem -> JSON.parse -> push -> JSON.stringify -> setItem` per action. It is currently only enabled for `NIGHTLY` builds.
- Why it matters:
  This is synchronous main-thread storage IO. Even though it is nightly-only, it can still amplify jank during action-heavy debugging sessions.
- Direction:
  Buffer in memory and flush periodically, or read the trail only when a report is actually emitted.

## Notes

- The main frontend bottleneck has shifted away from raw DOM volume and toward interaction paths that mix full recomputation with synchronous persistence work.
- Parts of the old monolithic performance page still have historical value, but sections about friend sorting and deep search watchers no longer describe the current top priorities.
