# 前端改动入口地图

这页的目标不是穷举所有文件，而是给出“改功能时先去哪看”的最短路径。

## 总规则

大多数前端功能都可以按这条顺序定位：

`route -> view -> store -> coordinator -> service/database`

对应的几个固定入口：

- 路由：`src/plugins/router.js`
- 根布局：`src/views/Layout/MainLayout.vue`
- 全局初始化：`src/app.js`、`src/App.vue`
- 跨模块流程：`src/coordinators/`
- 外部能力边界：`src/services/`、`src/api/`

## 先分清功能属于哪一类

### 页面型功能

特征是有明确路由入口，比如：

- `Feed`
- `FriendsLocations`
- `FriendList`
- `Search`
- `MyAvatars`
- `GameLog`
- `Tools`
- `Settings`

这类功能通常先看 route 对应 view，再看它直接使用的 store 和 composable。

### 实时型功能

特征是页面只是展示端，状态主要来自 WebSocket 和 coordinator，比如：

- 好友在线状态
- 通知
- 实例/位置变化
- 群组在线信息

这类功能不能只看 view。要从 `src/services/websocket.js` 和相关 coordinator 一起看。

### 后台计算型功能

特征是页面只是发起动作，真正耗时发生在 SQLite、Query cache 或 Worker，比如：

- 活跃度图表
- 游戏日志统计
- 截图库/元数据处理
- 快速搜索

这类功能优先看 `src/services/database/*`、`src/queries/*`、`src/stores/activity.js`、`src/stores/quickSearch.js`、`src/workers/*`。

## 高频入口地图

| 功能 | 先看 View | 再看 Store | 再看 Coordinator / Service |
|------|-----------|------------|-----------------------------|
| Feed | `src/views/Feed/Feed.vue` | `src/stores/feed.js`、`src/stores/sharedFeed.js` | `src/coordinators/userEventCoordinator.js`、`src/services/database/feed.js` |
| 好友位置卡片 | `src/views/FriendsLocations/FriendsLocations.vue` | `src/stores/friend.js`、`src/stores/location.js`、`src/stores/favorite.js` | `src/coordinators/friendPresenceCoordinator.js`、`src/coordinators/locationCoordinator.js` |
| 好友表格 | `src/views/FriendList/FriendList.vue` | `src/stores/friend.js`、`src/stores/search.js` | `src/coordinators/friendRelationshipCoordinator.js`、`src/services/database/gameLog.js` |
| 侧栏好友 | `src/views/Sidebar/components/FriendsSidebar.vue` | `src/stores/friend.js`、`src/stores/favorite.js` | `src/coordinators/friendPresenceCoordinator.js`、`src/services/websocket.js` |
| 通知 | `src/views/Notifications/Notification.vue` | `src/stores/notification/index.js`、`src/stores/invite.js` | `src/coordinators/groupCoordinator.js`、`src/coordinators/worldCoordinator.js` |
| 我的模型 | `src/views/MyAvatars/MyAvatars.vue` | `src/stores/avatar.js`、`src/stores/user.js` | `src/services/database/avatarFavorites.js`、`src/coordinators/avatarCoordinator.js` |
| 搜索 / 快速搜索 | `src/views/Search/Search.vue` | `src/stores/search.js`、`src/stores/quickSearch.js`、`src/stores/searchIndex.js` | `src/workers/*`、相关 entity coordinator |
| 游戏日志 | `src/views/GameLog/GameLog.vue` | `src/stores/gameLog/` | `src/coordinators/gameLogCoordinator.js`、`src/services/database/gameLog.js` |
| 工具 / 图库 | `src/views/Tools/Tools.vue` | `src/stores/gallery.js`、`src/stores/tools.js` | `src/coordinators/imageUploadCoordinator.js`、图库相关数据库服务 |
| 设置 | `src/views/Settings/Settings.vue` | `src/stores/settings/*` | `src/services/config.js` |

## 三条最常用的定位路径

### 1. 改好友展示

如果你改的是“好友怎么显示”，通常不要只盯某一个组件：

1. 看 `FriendList` 或 `FriendsSidebar` / `FriendsLocations` 哪个视图在展示
2. 看 `src/stores/friend.js` 的排序、筛选、派生列表
3. 看 `src/coordinators/friendPresenceCoordinator.js` 和 `src/coordinators/friendRelationshipCoordinator.js`
4. 如果数据来自实时事件，再补看 `src/services/websocket.js`

### 2. 改搜索体验

1. 普通搜索先看 `src/views/Search/Search.vue` 和 `src/stores/search.js`
2. 快速搜索看 `src/stores/quickSearch.js`、`src/stores/searchIndex.js`、`src/stores/quickSearchWorker.js`
3. 如果搜索命中依赖本地历史或日志，再看 `src/services/database/*`

### 3. 改统计或图表

1. 看页面或对话框入口
2. 看对应 store 是否已有缓存与快照逻辑
3. 再看 `src/services/database/*` 或 `src/queries/*` 的查询形态
4. 最后确认是否已经走 Worker，还是仍在主线程聚合

## 改动前的判断清单

- 这个功能的 owner store 是谁
- 这是页面驱动、实时驱动，还是后台计算驱动
- 跨 store 副作用是否应该放进 coordinator
- 是否已经存在可复用的数据库查询、Query cache 或 Worker 管线
- 这次改动会不会把重查询、全量过滤或同步持久化带回高频交互路径

## 搜索代码时最实用的命令

- 找路由：`rg "name: 'xxx'" src/plugins/router.js`
- 找某个页面用了哪些 store：`rg "use[A-Za-z]+Store\(" src/views/YourView`
- 找某个 store 被谁消费：`rg "useYourStore" src/views src/coordinators src/stores`
- 找 WebSocket 事件入口：`rg "websocket|notification|friend-" src/services src/coordinators`
- 找数据库查询：`rg "database\.|SELECT |FROM " src/views src/stores src/services`
