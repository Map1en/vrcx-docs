# Frontend Performance

> Based on the code state on **March 23, 2026**, focused on frontend hotspots that still hold.

## Evaluation Frame

When judging whether a page will feel slow, do not start with “how many nodes are rendered”. Start with three questions:

1. how much batch data preparation already happens on the main thread before rendering
2. whether typing or filtering also pulls in database stats, config writes, or other side effects
3. whether virtualization, caching, and workers actually cover the hotspot or only the final DOM layer

## 🔴 Critical Hotspots

### 1. `FriendList` is still one of the most interaction-sensitive typing paths

- Location: `src/views/FriendList/FriendList.vue`, `src/stores/friend.js`, `src/services/database/gameLog.js`
- Current state: the page now has search caching, refresh windows, and scheduling, but search still scans the friend set and stats refresh still sits close to that path
- Performance meaning: on large friend sets and older databases, input delay can still appear because typing does not only change a filter, it stays close to expensive stats refresh logic
- Documentation takeaway: future optimization should keep moving toward stronger debounce, clearer stats-cache boundaries, and pulling stats work farther away from the typing path

### 2. `FriendsLocations` still spends most of its cost before virtualization

- Location: `src/views/FriendsLocations/FriendsLocations.vue`
- Current state: the page already coalesces measurement through `scheduleVirtualMeasure()` and already virtualizes the list, but it still performs multiple passes for same-instance grouping, segment changes, favorite grouping, search filtering, and row chunking before `virtualRows` is produced
- Performance meaning: what users feel is not only how many cards render, but whether each interaction rebuilds the full row model first
- Documentation takeaway: the next gains are more likely to come from stable upstream caches and incremental derivation than from more DOM-level tuning

### 3. `FriendsSidebar` has the same “rebuild before virtualization” problem

- Location: `src/views/Sidebar/components/FriendsSidebar.vue`
- Current state: `sameInstanceFriendId`, `visibleFavoriteOnlineFriends`, `onlineFriendsByGroupStatus`, `vipFriendsDivideByGroup`, and `virtualRows` form a multi-stage derivation chain
- Performance meaning: even with sidebar virtualization, frequent realtime events can repeatedly rerun set building, regrouping, and array reconstruction
- Documentation takeaway: sidebar performance is mainly about reducing repeated pre-render data shaping, not just rendering fewer rows

### 4. Local search and log stats still bring SQLite pressure back into frontend interactions

- Location: `src/services/database/feed.js`, `src/services/database/gameLog.js`, `src/services/database/notifications.js`
- Current state: several queries still rely on `LIKE '%x%'` and `UNION ALL`; notification search still includes string-built SQL
- Performance meaning: users experience this as “page search is slow”, but the underlying cause is degraded local querying hanging off frontend interactions
- Documentation takeaway: these problems belong in frontend performance discussions even when the code sits in the database layer

## 🟠 Important But Secondary

### 5. High-frequency config writes are still spread around the UI

- Location: multiple views and composables including `FriendsLocations`, `MyAvatars`, `Favorites`, and `Settings`
- Current state: some sliders and interactions are now debounced, but many `configRepository.setString()` calls still sit directly inside setters or watchers
- Performance meaning: a single write may be cheap, but dragging, typing, or toggling can turn it into noticeable jitter
- Documentation takeaway: keep separating persistence timing from reactive display timing

### 6. `websocket` and `updateLoop` keep feeding pressure into frontend derivation chains

- Location: `src/services/websocket.js`, `src/stores/updateLoop.js`
- Current state: realtime events are parsed on the main thread before entering coordinators and stores; `updateLoop()` also triggers periodic refresh, log reads, and game-state checks every second
- Performance meaning: a single page may not be doing much itself, but always-on paths can still keep recomputation and visible updates flowing
- Documentation takeaway: frontend performance docs should include always-on background pressure, not just per-page interaction cost

### 7. `MyAvatars` is healthier than the older docs suggest, but it is still a heavy refresh page

- Location: `src/views/MyAvatars/MyAvatars.vue`
- Current state: refresh now batches `getAllAvatarTags()` and `getAllAvatarTimeSpent()`, so the old per-avatar time-spent conclusion no longer holds
- Performance meaning: the page now behaves more like a large batch refresh with metadata attachment than a classic N+1 page
- Documentation takeaway: further optimization should focus on batch preparation cost and time-to-interactive rather than repeating the old N+1 framing

## Optimization Directions Already Validated In Code

### 1. Worker offloading is the right direction

- `src/stores/quickSearch.js` runs quick search in a worker
- `src/stores/activity.js` runs activity calculations in a worker

That is a strong signal that serializable, batchable, background-friendly work should leave the main thread first.

### 2. Incremental resorting is better than repeated full sorting

- `src/stores/friend.js` maintains `sortedFriends`
- `reindexSortedFriend()` allows local reorder after single-entity changes

This fits a realtime friend graph far better than repeatedly sorting separate derived lists.

### 3. Virtualization solves only the last layer

The current code makes one thing very clear:

- virtualization controls render volume
- but if upstream code still rebuilds `virtualRows` and regrouped data in full, the CPU hotspot remains

That is why performance docs should start with what happens before the virtual list, not after it.

## Old Conclusions That Should Not Be Repeated

- `MyAvatars` should no longer be documented as a classic SQLite N+1 page because the current implementation now batches the metadata reads
- quick search should no longer be described as a full main-thread scan because the main path is worker-based now
- current lag should not be reduced to “too many nodes” because data derivation cost is now the more accurate explanation

## Metrics Worth Tracking In Future Docs

- whether a single search input still triggers stats refresh work
- whether segment or grouping changes rebuild full `virtualRows`
- whether high-frequency interactions directly call `configRepository.setString()`
- how many derivation layers rerun after one realtime event lands
