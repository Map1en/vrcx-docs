# Frontend Change Entry Map

This page is not meant to enumerate every file. It is meant to shorten the path to the first correct files when changing a feature.

## General Rule

Most frontend features can be traced through this order:

`route -> view -> store -> coordinator -> service/database`

The fixed anchor points are:

- routing: `src/plugins/router.js`
- root layout: `src/views/Layout/MainLayout.vue`
- global startup: `src/app.js`, `src/App.vue`
- cross-module flow: `src/coordinators/`
- external capability boundary: `src/services/`, `src/api/`

## Classify The Feature First

### Page-driven features

These have a clear route entry, for example:

- `Feed`
- `FriendsLocations`
- `FriendList`
- `Search`
- `MyAvatars`
- `GameLog`
- `Tools`
- `Settings`

For these, start with the route-mounted view and then inspect the stores and composables it uses directly.

### Realtime-driven features

Here the page is mostly a display surface while state is driven by WebSocket events and coordinators, for example:

- friend presence
- notifications
- instance and location changes
- group online state

For these, do not stop at the view. Read `src/services/websocket.js` together with the relevant coordinator.

### Background-computation features

Here the page mostly triggers work, while the expensive part happens in SQLite, Query cache, or a worker, for example:

- activity charts
- game-log analytics
- gallery and metadata processing
- quick search

For these, prioritize `src/services/database/*`, `src/queries/*`, `src/stores/activity.js`, `src/stores/quickSearch.js`, and `src/workers/*`.

## High-Frequency Entry Map

| Feature | Start With View | Then Store | Then Coordinator / Service |
|---------|-----------------|------------|----------------------------|
| Feed | `src/views/Feed/Feed.vue` | `src/stores/feed.js`, `src/stores/sharedFeed.js` | `src/coordinators/userEventCoordinator.js`, `src/services/database/feed.js` |
| Friend location cards | `src/views/FriendsLocations/FriendsLocations.vue` | `src/stores/friend.js`, `src/stores/location.js`, `src/stores/favorite.js` | `src/coordinators/friendPresenceCoordinator.js`, `src/coordinators/locationCoordinator.js` |
| Friend table | `src/views/FriendList/FriendList.vue` | `src/stores/friend.js`, `src/stores/search.js` | `src/coordinators/friendRelationshipCoordinator.js`, `src/services/database/gameLog.js` |
| Sidebar friends | `src/views/Sidebar/components/FriendsSidebar.vue` | `src/stores/friend.js`, `src/stores/favorite.js` | `src/coordinators/friendPresenceCoordinator.js`, `src/services/websocket.js` |
| Notifications | `src/views/Notifications/Notification.vue` | `src/stores/notification/index.js`, `src/stores/invite.js` | `src/coordinators/groupCoordinator.js`, `src/coordinators/worldCoordinator.js` |
| My Avatars | `src/views/MyAvatars/MyAvatars.vue` | `src/stores/avatar.js`, `src/stores/user.js` | `src/services/database/avatarFavorites.js`, `src/coordinators/avatarCoordinator.js` |
| Search / Quick Search | `src/views/Search/Search.vue` | `src/stores/search.js`, `src/stores/quickSearch.js`, `src/stores/searchIndex.js` | `src/workers/*`, related entity coordinators |
| Game Log | `src/views/GameLog/GameLog.vue` | `src/stores/gameLog/` | `src/coordinators/gameLogCoordinator.js`, `src/services/database/gameLog.js` |
| Tools / Gallery | `src/views/Tools/Tools.vue` | `src/stores/gallery.js`, `src/stores/tools.js` | `src/coordinators/imageUploadCoordinator.js`, gallery-related database services |
| Settings | `src/views/Settings/Settings.vue` | `src/stores/settings/*` | `src/services/config.js` |

## Three Common Tracing Paths

### 1. Changing friend presentation

If you are changing how friends are shown, do not stare at a single component only:

1. identify whether the UI lives in `FriendList`, `FriendsSidebar`, or `FriendsLocations`
2. inspect sorting, filtering, and derived lists in `src/stores/friend.js`
3. inspect `src/coordinators/friendPresenceCoordinator.js` and `src/coordinators/friendRelationshipCoordinator.js`
4. if the data is realtime-driven, also inspect `src/services/websocket.js`

### 2. Changing search behavior

1. normal search starts at `src/views/Search/Search.vue` and `src/stores/search.js`
2. quick search lives in `src/stores/quickSearch.js`, `src/stores/searchIndex.js`, and `src/stores/quickSearchWorker.js`
3. if search results depend on local history or logs, continue into `src/services/database/*`

### 3. Changing stats or charts

1. start from the page or dialog entry
2. inspect whether the store already owns cache or snapshot logic
3. inspect the query shape in `src/services/database/*` or `src/queries/*`
4. confirm whether the heavy aggregation already runs in a worker or still sits on the main thread

## Pre-change Checklist

- which store actually owns the feature state
- whether the feature is page-driven, realtime-driven, or background-computation-driven
- whether multi-store side effects belong in a coordinator
- whether a reusable database query, Query cache, or worker pipeline already exists
- whether the change would bring heavy queries, full filtering, or synchronous persistence back into a hot interaction path

## Most Useful Search Commands

- find a route: `rg "name: 'xxx'" src/plugins/router.js`
- find which stores a view uses: `rg "use[A-Za-z]+Store\(" src/views/YourView`
- find where a store is consumed: `rg "useYourStore" src/views src/coordinators src/stores`
- find WebSocket entry points: `rg "websocket|notification|friend-" src/services src/coordinators`
- find database queries: `rg "database\.|SELECT |FROM " src/views src/stores src/services`
