# Data Flow

## Core Request Pipeline

Every API call follows this path:

```mermaid
flowchart TD
    A["User Action / WebSocket / Update Loop"] --> B["API Layer"]
    B --> C["Request Service"]
    C --> D["WebApi Bridge"]
    D --> E["C# Backend"]
    E --> F["VRChat API"]
    F --> E --> D --> C --> B
    B --> G["Coordinator"]
    G --> H["Pinia Store"]
    H --> I["Vue Components"]
```

| Node | Path | Details |
|------|------|---------|
| API Layer | src/api/*.js | — |
| Request Service | src/services/request.js | buildRequestInit(), deduplicateGETs(), parseResponse() |
| WebApi Bridge | src/services/webapi.js | Windows: WebApi.Execute(options) / Linux: WebApi.ExecuteJson(json) |
| C# Backend | — | HTTP proxy to VRChat |
| Coordinator | src/coordinators/*.js | apply*() side-effects, cross-store orchestration |
| Pinia Store | src/stores/*.js | reactive Map/Set, computed properties |
| Vue Components | — | Automatic reactivity |

## WebSocket Real-Time Event Flow

```mermaid
sequenceDiagram
    participant VRC as VRChat Server
    participant WS as websocket.js
    participant Coord as Coordinators
    participant Store as Pinia Stores
    participant UI as Vue Components

    VRC->>WS: WebSocket message
    
    Note over WS: Parse event type

    alt Friend Events
        WS->>Coord: friend-online / friend-active
        Coord->>Coord: applyUser(json)
        Coord->>Store: userStore.cachedUsers.set()
        Coord->>Store: friendStore → update state
        
        WS->>Coord: friend-offline
        Coord->>Coord: Enter pending offline (170s delay)
        Note over Coord: pendingOfflineWorker ticks every 1s
        Coord->>Store: After 170s → finalize transition
        Coord->>Store: feedStore, sharedFeedStore, DB write

        WS->>Coord: friend-location
        Coord->>Coord: applyUser(json)
        Coord->>Store: Update location data

        WS->>Coord: friend-add / friend-delete
        Coord->>Store: friendStore.addFriend() / deleteFriend()
        Coord->>Store: Write friend log to DB
    end

    alt Current User Events
        WS->>Coord: user-update
        Coord->>Coord: applyCurrentUser(json)
        Coord->>Store: userStore

        WS->>Coord: user-location
        Coord->>Coord: runSetCurrentUserLocationFlow()
        Coord->>Store: locationStore + instanceStore
    end

    alt Notification Events
        WS->>Store: notification / notification-v2
        Store->>Store: notificationStore processing
        Store->>Store: handlePipelineNotification()
    end

    alt Instance Events
        WS->>Store: instance-queue-joined/position/ready/left
        Store->>Store: instanceStore queue management

        WS->>Store: instance-closed
        Store->>Store: notification + sharedFeed + ui
    end

    alt Group Events
        WS->>Coord: group-left / group-role-updated / group-member-updated
        Coord->>Store: groupStore
    end

    alt Content Events
        WS->>Store: content-refresh
        Store->>Store: Refresh content types
    end

    Store-->>UI: Reactive update
```

## Complete WebSocket Event Map

| Event | Handler | Stores Affected |
|-------|---------|----------------|
| `friend-online` | `applyUser()` | user, friend |
| `friend-active` | `applyUser()` | user, friend |
| `friend-offline` | `applyUser()` → pending 170s | user, friend, feed, sharedFeed |
| `friend-update` | `applyUser()` | user, friend |
| `friend-location` | `applyUser()` | user, friend, location |
| `friend-add` | `applyUser()` + `handleFriendAdd()` | user, friend |
| `friend-delete` | `handleFriendDelete()` | friend, user |
| `user-update` | `applyCurrentUser()` | user |
| `user-location` | `runSetCurrentUserLocationFlow()` | location, user, instance |
| `notification` | `handleNotification()` | notification |
| `notification-v2` | `handlePipelineNotification()` | notification |
| `notification-v2-update` | `handlePipelineNotification()` | notification |
| `notification-v2-delete` | `handlePipelineNotification()` | notification |
| `instance-queue-joined` | `instanceQueueUpdate()` | instance |
| `instance-queue-position` | `instanceQueueUpdate()` | instance |
| `instance-queue-ready` | `instanceQueueReady()` | instance |
| `instance-queue-left` | `removeQueuedInstance()` | instance |
| `instance-closed` | Queue notification | notification, sharedFeed, ui |
| `group-left` | `onGroupLeft()` | group |
| `group-role-updated` | `applyGroup()` + refetch | group |
| `group-member-updated` | `handleGroupMember()` | group |
| `content-refresh` | Refresh content types | gallery |

## Update Loop Timers

The `updateLoop` store manages periodic background tasks:

| Timer | Interval | What It Does |
|-------|----------|-------------|
| `nextCurrentUserRefresh` | 300s (5 min) | `getCurrentUser()` — refresh own profile |
| `nextFriendsRefresh` | 3600s (1 hour) | `runRefreshFriendsListFlow()` + `runRefreshPlayerModerationsFlow()` |
| `nextGroupInstanceRefresh` | 300s (5 min) | `getUsersGroupInstances()` — group instance data |
| `nextAppUpdateCheck` | 3600s (1 hour) | Check for VRCX auto-update |
| `nextClearVRCXCacheCheck` | 86400s (24 hrs) | `clearVRCXCache()` |
| `nextDatabaseOptimize` | 3600s (1 hour) | SQLite optimization |
| `nextDiscordUpdate` | Variable | Discord Rich Presence refresh |
| `nextAutoStateChange` | Variable | `updateAutoStateChange()` |
| `nextGetLogCheck` | Variable | `addGameLogEvent()` — game log polling |
| `nextGameRunningCheck` | Variable | `AppApi.CheckGameRunning()` |

## Three-Layer Caching Strategy

```mermaid
flowchart LR
    subgraph L1["Layer 1: Vue Query Cache"]
        QC["TanStack QueryClient"]
    end
    subgraph L2["Layer 2: Entity Cache"]
        EC["entityCache.js"]
    end
    subgraph L3["Layer 3: Store Maps"]
        SM["Pinia Store Maps"]
    end

    QC --> EC --> SM
```

**Key rule**: Data is only replaced if the incoming data is **newer** (recency-based). This prevents stale WebSocket events from overwriting fresh API responses.

## Friend Sync: Login Flow

```mermaid
sequenceDiagram
    participant App as App.vue
    participant Auth as authCoordinator
    participant Sync as friendSyncCoordinator
    participant FStore as friendStore
    participant API as VRChat API
    participant WS as websocket.js

    App->>Auth: autoLogin()
    Auth->>Auth: Login + set tokens
    Auth->>Sync: runInitFriendsListFlow()
    
    Sync->>Sync: isFriendsLoaded = false
    Sync->>FStore: initFriendLog(currentUser)
    Note over FStore: First run: fetch all friends<br/>Subsequent: load from DB
    
    FStore->>API: GET /friends (paginated, 50/page, 5 concurrent)
    API-->>FStore: Friend list
    
    FStore->>FStore: addFriend() for each
    FStore->>FStore: tryApplyFriendOrder()
    FStore->>FStore: getAllUserStats() from DB
    
    Sync->>Sync: isFriendsLoaded = true
    Sync->>WS: reconnectWebSocket()
    
    Note over WS: WebSocket now handles<br/>incremental updates
```
