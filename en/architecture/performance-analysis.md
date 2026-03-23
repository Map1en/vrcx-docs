# Performance Overview

> Based on the `VRCX` repository state on **March 23, 2026**. This page keeps only structural conclusions that still hold.

## The Short Version

The main frontend bottleneck is no longer simply “too many rendered elements”. The dominant problems now come from these kinds of work leaking into hot interaction paths:

- full data rebuilding during typing, filtering, and regrouping
- degraded SQLite search and stats queries
- multi-pass derivation before virtualization even starts
- synchronous side effects such as config persistence, background refresh, and log processing
- continuous main-thread pressure from both WebSocket handling and `updateLoop`

In practice, VRCX is now fighting main-thread data-shaping cost more than raw DOM volume.

## The Performance Paths That Matter Most

### 1. Realtime event path

Representative modules: `src/services/websocket.js`, `friendPresenceCoordinator`, notification and group-related coordinators/stores

This is the main entry point for friend presence, location, notification, and group changes. The incoming event itself is not always expensive, but the cost multiplies when each event triggers large-list regrouping, resorting, or repeated filtering.

### 2. Polling and background-task path

Representative module: `src/stores/updateLoop.js`

`updateLoop()` drives multiple countdown slots once per second, handling periodic refresh, log reads, game-state checks, and some background maintenance. A single pass may be cheap, but the loop concentrates a lot of I/O and state updates into one always-on path.

### 3. Large-list interaction path

Representative pages: `FriendList`, `FriendsLocations`, `FriendsSidebar`

These pages already use virtualization or incremental sorting, but the real hotspots often happen before virtualization:

- repeated `filter`, `map`, `sort`, and grouping passes
- rebuilding full row structures for search or segment changes
- triggering extra stats work after user interaction

### 4. Local data query path

Representative modules: `src/services/database/feed.js`, `gameLog.js`, `notifications.js`

These paths define how badly the app slows down as the local database ages. The patterns to watch are:

- `LIKE '%x%'`
- multi-table `UNION ALL`
- rerunning large stats work during search
- full matches on older, larger datasets

### 5. Worker and local-cache path

Representative modules: `src/stores/activity.js`, `src/stores/quickSearch.js`, `src/queries/*`

This is one of the healthier paths in the current codebase. Quick search and activity aggregation already run in workers, with snapshot caching, in-flight deduplication, Query cache, and incremental index updates. That direction should be preserved rather than rolled back.

## High-Priority Problems That Still Hold

| Priority | Problem | Why it matters |
|----------|---------|----------------|
| 🔴 Critical | Local search queries still depend on `LIKE '%x%'` and `UNION ALL` | Visible in `src/services/database/feed.js`, `gameLog.js`, and `notifications.js`; cost worsens with database size |
| 🔴 Critical | `FriendList` still keeps full filtering and stats refresh close to the typing path | Even with caching and freshness windows, this remains interaction-sensitive |
| 🔴 Critical | `FriendsLocations` and `FriendsSidebar` still do multi-pass rebuilding before virtualization | Virtualization controls DOM size but does not remove upstream CPU cost |
| 🟠 High | `websocket` and `updateLoop` together create persistent main-thread pressure | High-frequency events plus per-second polling keep pushing state updates and derivations onto the main thread |
| 🟠 High | High-frequency config writes are still spread across views and settings setters | Many `configRepository.setString()` calls still sit directly in interaction setters |

## Positive Design Choices Already Present

These are not future ideas. They are already implemented and should be treated as foundations:

- `src/services/request.js` merges repeated GET requests within a short window and short-circuits some repeated failures
- `src/stores/friend.js` uses `sortedFriends`, `reindexSortedFriend()`, and batched updates instead of the older pattern of repeatedly resorting separate derived arrays
- `src/stores/quickSearch.js` now fully relies on a worker for quick search
- `src/stores/activity.js` already pushes activity heatmaps and overlap analysis into a worker and adds snapshot caching plus in-flight deduplication
- `src/queries/*` already manage entity requests, staleness, and event patching through Query cache
- several large-list views already use virtualization, so diagnosis should focus more on data preparation than on final rendering alone

## Findings That Are Now Historical, Not Primary

These still have historical context, but they should not remain top-line conclusions:

- “friend lists are mainly slow because multiple independent arrays fully sort themselves” is no longer accurate after `sortedFriends`
- “quick search still scans the full friend set on the main thread” is no longer accurate
- “`MyAvatars` is a classic SQLite N+1 page” is no longer accurate because metadata reads are now batched
- blaming current lag mainly on “too many DOM nodes” no longer explains the main bottlenecks well enough

## Reading Order

- for the current big picture, start here
- for frontend-specific details, read [Frontend Performance](/en/architecture/performance-frontend)
- for non-frontend paths, read [Non-Frontend Performance](/en/architecture/performance-non-frontend)

If you only remember one thing, remember this: the highest-value optimizations now come from keeping full recomputation, heavy queries, and synchronous persistence out of hot interaction paths.
