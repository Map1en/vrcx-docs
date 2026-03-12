# 数据流

## 核心请求管线

每个 API 调用都经过这条路径：

```mermaid
flowchart TD
    A["用户操作 / WebSocket / UpdateLoop"] --> B["API 层"]
    B --> C["请求服务"]
    C --> D["WebApi 桥接"]
    D --> E["C# 后端"]
    E --> F["VRChat API"]
    F --> E --> D --> C --> B
    B --> G["Coordinator"]
    G --> H["Pinia Store"]
    H --> I["Vue 组件"]
```

| 节点 | 路径 | 说明 |
|------|------|------|
| API 层 | src/api/*.js | — |
| 请求服务 | src/services/request.js | buildRequestInit(), deduplicateGETs(), parseResponse() |
| WebApi 桥接 | src/services/webapi.js | Windows: WebApi.Execute(options) / Linux: WebApi.ExecuteJson(json) |
| C# 后端 | — | HTTP 代理到 VRChat |
| Coordinator | src/coordinators/*.js | apply*() 副作用, 跨 Store 编排 |
| Pinia Store | src/stores/*.js | reactive Map/Set, computed 派生 |
| Vue 组件 | — | 自动响应式更新 |

## WebSocket 实时事件流

```mermaid
sequenceDiagram
    participant VRC as VRChat 服务器
    participant WS as websocket.js
    participant Coord as Coordinator
    participant Store as Pinia Store
    participant UI as Vue 组件

    VRC->>WS: WebSocket 消息
    
    Note over WS: 解析事件类型

    alt 好友事件
        WS->>Coord: friend-online / friend-active
        Coord->>Coord: applyUser(json)
        Coord->>Store: userStore.cachedUsers.set()
        Coord->>Store: friendStore → 更新状态
        
        WS->>Coord: friend-offline
        Coord->>Coord: 进入待离线状态（170s 延迟）
        Note over Coord: pendingOfflineWorker 每 1s 检查
        Coord->>Store: 170s 后 → 完成状态转换
        Coord->>Store: feedStore, sharedFeedStore, DB 写入

        WS->>Coord: friend-location
        Coord->>Coord: applyUser(json)
        Coord->>Store: 更新位置数据

        WS->>Coord: friend-add / friend-delete
        Coord->>Store: friendStore.addFriend() / deleteFriend()
        Coord->>Store: 写入好友日志到 DB
    end

    alt 当前用户事件
        WS->>Coord: user-update
        Coord->>Coord: applyCurrentUser(json)
        Coord->>Store: userStore

        WS->>Coord: user-location
        Coord->>Coord: runSetCurrentUserLocationFlow()
        Coord->>Store: locationStore + instanceStore
    end

    alt 通知事件
        WS->>Store: notification / notification-v2
        Store->>Store: notificationStore 处理
        Store->>Store: handlePipelineNotification()
    end

    alt 实例事件
        WS->>Store: instance-queue-joined/position/ready/left
        Store->>Store: instanceStore 队列管理

        WS->>Store: instance-closed
        Store->>Store: notification + sharedFeed + ui
    end

    alt 群组事件
        WS->>Coord: group-left / group-role-updated / group-member-updated
        Coord->>Store: groupStore
    end

    alt 内容事件
        WS->>Store: content-refresh
        Store->>Store: 刷新内容类型
    end

    Store-->>UI: 响应式更新
```

## 完整 WebSocket 事件映射表

| 事件 | 处理函数 | 影响的 Store |
|------|---------|-------------|
| `friend-online` | `applyUser()` | user, friend |
| `friend-active` | `applyUser()` | user, friend |
| `friend-offline` | `applyUser()` → 待离线 170s | user, friend, feed, sharedFeed |
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
| `instance-closed` | 排队通知 | notification, sharedFeed, ui |
| `group-left` | `onGroupLeft()` | group |
| `group-role-updated` | `applyGroup()` + 重新拉取 | group |
| `group-member-updated` | `handleGroupMember()` | group |
| `content-refresh` | 刷新内容类型 | gallery |

## UpdateLoop 定时器

`updateLoop` store 管理所有后台定时任务：

| 定时器 | 间隔 | 功能 |
|--------|------|------|
| `nextCurrentUserRefresh` | 300s（5 分钟） | `getCurrentUser()` — 刷新自己的资料 |
| `nextFriendsRefresh` | 3600s（1 小时） | `runRefreshFriendsListFlow()` + `runRefreshPlayerModerationsFlow()` |
| `nextGroupInstanceRefresh` | 300s（5 分钟） | `getUsersGroupInstances()` — 群组实例数据 |
| `nextAppUpdateCheck` | 3600s（1 小时） | 检查 VRCX 自动更新 |
| `nextClearVRCXCacheCheck` | 86400s（24 小时） | `clearVRCXCache()` |
| `nextDatabaseOptimize` | 3600s（1 小时） | SQLite 优化 |
| `nextDiscordUpdate` | 动态 | Discord Rich Presence 刷新 |
| `nextAutoStateChange` | 动态 | `updateAutoStateChange()` |
| `nextGetLogCheck` | 动态 | `addGameLogEvent()` — 游戏日志轮询 |
| `nextGameRunningCheck` | 动态 | `AppApi.CheckGameRunning()` |

## 三层缓存策略

```mermaid
flowchart LR
    subgraph L1["第 1 层：Vue Query 缓存"]
        QC["TanStack QueryClient"]
    end
    subgraph L2["第 2 层：实体缓存"]
        EC["entityCache.js"]
    end
    subgraph L3["第 3 层：Store Map"]
        SM["Pinia Store Map"]
    end

    QC --> EC --> SM
```

**关键规则**：数据只有在传入数据**更新**时才会被替换（基于新鲜度）。这防止了陈旧的 WebSocket 事件覆盖新鲜的 API 响应。

## 好友同步：登录流程

```mermaid
sequenceDiagram
    participant App as App.vue
    participant Auth as authCoordinator
    participant Sync as friendSyncCoordinator
    participant FStore as friendStore
    participant API as VRChat API
    participant WS as websocket.js

    App->>Auth: autoLogin()
    Auth->>Auth: 登录 + 设置 token
    Auth->>Sync: runInitFriendsListFlow()
    
    Sync->>Sync: isFriendsLoaded = false
    Sync->>FStore: initFriendLog(currentUser)
    Note over FStore: 首次运行：拉取所有好友<br/>后续：从 DB 加载
    
    FStore->>API: GET /friends（分页，50/页，5 并发）
    API-->>FStore: 好友列表
    
    FStore->>FStore: addFriend() 逐个添加
    FStore->>FStore: tryApplyFriendOrder()
    FStore->>FStore: getAllUserStats() 从 DB 读取
    
    Sync->>Sync: isFriendsLoaded = true
    Sync->>WS: reconnectWebSocket()
    
    Note over WS: WebSocket 接管<br/>增量更新
```
