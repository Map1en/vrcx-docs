# 前端改动入口地图（排除 Photon）

这页是“改功能时的最短定位路径”。  
范围只包含主前端（不含 `photon` 相关页面、store、设置）。

## 入口总则

先从路由找入口，再顺着链路走：

`route -> view -> store -> coordinator -> api/service`

路由定义文件：`src/plugins/router.js`

## 高频功能入口

| 功能 | 路由名 | 入口 View | 主要 Store | 常用 Coordinator |
|------|--------|-----------|------------|------------------|
| 动态 Feed | `feed` | `views/Feed/Feed.vue` | `feed`, `sharedFeed`, `appearance` | `userEventCoordinator` |
| 好友位置卡片 | `friends-locations` | `views/FriendsLocations/FriendsLocations.vue` | `friend`, `favorite`, `location`, `appearance` | `friendPresenceCoordinator`, `locationCoordinator` |
| 好友表格 | `friend-list` | `views/FriendList/FriendList.vue` | `friend`, `search`, `appearance`, `modal` | `friendRelationshipCoordinator`, `userCoordinator` |
| 好友历史 | `friend-log` | `views/FriendLog/FriendLog.vue` | `friend`, `user` | `friendRelationshipCoordinator` |
| 通知 | `notification` | `views/Notifications/Notification.vue` | `notification`, `invite`, `gallery`, `appearance` | `groupCoordinator`, `userCoordinator`, `worldCoordinator` |
| 收藏（好友/世界/模型） | `favorite-friends` / `favorite-worlds` / `favorite-avatars` | `views/Favorites/*` | `favorite`, `user`, `modal`, `appearance` | `favoriteCoordinator` |
| 搜索 | `search` | `views/Search/Search.vue` | `search`, `auth`, `avatarProvider`, `appearance` | `userCoordinator`, `worldCoordinator`, `groupCoordinator`, `avatarCoordinator` |
| 设置 | `settings` | `views/Settings/Settings.vue` | `settings/*`, `vrcxUpdater`, `vr` | 以 store action 为主 |
| 工具 | `tools` | `views/Tools/Tools.vue` | `gallery`, `vrcx`, `launch`, `friend` | `imageUploadCoordinator` |
| 游戏日志 | `game-log` | `views/GameLog/GameLog.vue` | `gameLog`, `appearance`, `modal`, `vrcx` | `gameLogCoordinator` |
| 管理 | `moderation` | `views/Moderation/Moderation.vue` | `moderation`, `appearance`, `modal` | `moderationCoordinator` |
| 我的模型 | `my-avatars` | `views/MyAvatars/MyAvatars.vue` | `avatar`, `user`, `modal`, `appearance` | `avatarCoordinator`, `imageUploadCoordinator` |
| 自定义仪表盘 | `dashboard` | `views/Dashboard/Dashboard.vue` | `dashboard` | — |

## 三条常用定位路径

### 1) 改 Sidebar 好友显示

1. 路由入口：`MainLayout -> views/Sidebar/Sidebar.vue`
2. 具体渲染：`views/Sidebar/components/FriendsSidebar.vue`、`FriendItem.vue`
3. 数据来源：`stores/friend.js`（列表、排序、分组）
4. 状态变更来源：`coordinators/friendPresenceCoordinator.js`、`friendRelationshipCoordinator.js`
5. 事件输入：`services/websocket.js`（`friend-*` 事件）

### 2) 改 FriendsLocations 卡片行为

1. 路由：`friends-locations`
2. 视图：`views/FriendsLocations/FriendsLocations.vue`
3. 卡片：`views/FriendsLocations/components/FriendsLocationsCard.vue`
4. 数据：`stores/friend.js` + `stores/location.js` + `stores/favorite.js`
5. 来源：`friendPresenceCoordinator` / `locationCoordinator` + WebSocket

### 3) 改通知展示/动作

1. 路由：`notification` 或 Sidebar 通知面板
2. 视图：`views/Notifications/Notification.vue`、`views/Sidebar/components/NotificationItem.vue`
3. 核心状态：`stores/notification/index.js`
4. 事件入口：`services/websocket.js`（`notification*`、`instance-closed`）
5. 关联动作：`groupCoordinator` / `userCoordinator` / `worldCoordinator`

## 新功能改动清单（速用版）

1. 在 `router.js` 确认功能挂载点（新路由还是复用现有页）。
2. 确认 owner store（谁拥有状态，谁提供 action）。
3. 只在 coordinator 编排跨 store 副作用。
4. 如果数据来自实时事件，补 `websocket.js` 入口与映射说明。
5. 补 i18n key（`src/localization/*.json`）。
6. 增加或更新 `vitest` 对应模块测试。

## 反向检索（你常用的）

- 想找“这个路由在哪定义”：`rg "name: 'xxx'" src/plugins/router.js`
- 想找“某 view 用了哪些 store”：`rg "use[A-Za-z]+Store\\(" src/views/YourView`
- 想找“某 store 被谁用了”：`rg "useYourStore" src/views src/coordinators src/stores`

