# Change Entry Map (Excluding Photon)

This page is the "shortest path to locate a feature when making changes".  
Scope: main frontend only (no `photon`-related pages, stores, or settings).

## General Entry Pattern

Start from the route, follow the chain:

`route -> view -> store -> coordinator -> api/service`

Route definition file: `src/plugins/router.js`

## Frequently Used Feature Entries

| Feature | Route Name | Entry View | Main Stores | Common Coordinators |
|---------|-----------|------------|-------------|---------------------|
| Feed | `feed` | `views/Feed/Feed.vue` | `feed`, `sharedFeed`, `appearance` | `userEventCoordinator` |
| Friends Locations | `friends-locations` | `views/FriendsLocations/FriendsLocations.vue` | `friend`, `favorite`, `location`, `appearance` | `friendPresenceCoordinator`, `locationCoordinator` |
| Friend List | `friend-list` | `views/FriendList/FriendList.vue` | `friend`, `search`, `appearance`, `modal` | `friendRelationshipCoordinator`, `userCoordinator` |
| Friend Log | `friend-log` | `views/FriendLog/FriendLog.vue` | `friend`, `user` | `friendRelationshipCoordinator` |
| Notifications | `notification` | `views/Notifications/Notification.vue` | `notification`, `invite`, `gallery`, `appearance` | `groupCoordinator`, `userCoordinator`, `worldCoordinator` |
| Favorites | `favorite-friends` / `favorite-worlds` / `favorite-avatars` | `views/Favorites/*` | `favorite`, `user`, `modal`, `appearance` | `favoriteCoordinator` |
| Search | `search` | `views/Search/Search.vue` | `search`, `auth`, `avatarProvider`, `appearance` | `userCoordinator`, `worldCoordinator`, `groupCoordinator`, `avatarCoordinator` |
| Settings | `settings` | `views/Settings/Settings.vue` | `settings/*`, `vrcxUpdater`, `vr` | Primarily store actions |
| Tools | `tools` | `views/Tools/Tools.vue` | `gallery`, `vrcx`, `launch`, `friend` | `imageUploadCoordinator` |
| Game Log | `game-log` | `views/GameLog/GameLog.vue` | `gameLog`, `appearance`, `modal`, `vrcx` | `gameLogCoordinator` |
| Moderation | `moderation` | `views/Moderation/Moderation.vue` | `moderation`, `appearance`, `modal` | `moderationCoordinator` |
| My Avatars | `my-avatars` | `views/MyAvatars/MyAvatars.vue` | `avatar`, `user`, `modal`, `appearance` | `avatarCoordinator`, `imageUploadCoordinator` |
| Dashboard | `dashboard` | `views/Dashboard/Dashboard.vue` | `dashboard` | — |

## Three Common Navigation Paths

### 1) Modify Sidebar Friend Display

1. Route entry: `MainLayout -> views/Sidebar/Sidebar.vue`
2. Specific rendering: `views/Sidebar/components/FriendsSidebar.vue`, `FriendItem.vue`
3. Data source: `stores/friend.js` (list, sorting, grouping)
4. State change source: `coordinators/friendPresenceCoordinator.js`, `friendRelationshipCoordinator.js`
5. Event input: `services/websocket.js` (`friend-*` events)

### 2) Modify FriendsLocations Card Behavior

1. Route: `friends-locations`
2. View: `views/FriendsLocations/FriendsLocations.vue`
3. Card: `views/FriendsLocations/components/FriendsLocationsCard.vue`
4. Data: `stores/friend.js` + `stores/location.js` + `stores/favorite.js`
5. Source: `friendPresenceCoordinator` / `locationCoordinator` + WebSocket

### 3) Modify Notification Display/Actions

1. Route: `notification` or Sidebar notification panel
2. View: `views/Notifications/Notification.vue`, `views/Sidebar/components/NotificationItem.vue`
3. Core state: `stores/notification/index.js`
4. Event entry: `services/websocket.js` (`notification*`, `instance-closed`)
5. Related actions: `groupCoordinator` / `userCoordinator` / `worldCoordinator`

## New Feature Checklist (Quick Reference)

1. Confirm mount point in `router.js` (new route or reuse existing page).
2. Identify owner store (who owns state, who provides actions).
3. Only orchestrate cross-store side effects in coordinators.
4. If data comes from real-time events, add WebSocket entry and mapping.
5. Add i18n keys (`src/localization/*.json`).
6. Add or update `vitest` tests for the affected module.

## Reverse Lookup (Commonly Used)

- Find "where is this route defined": `rg "name: 'xxx'" src/plugins/router.js`
- Find "which stores does a view use": `rg "use[A-Za-z]+Store\\(" src/views/YourView`
- Find "who uses a store": `rg "useYourStore" src/views src/coordinators src/stores`
