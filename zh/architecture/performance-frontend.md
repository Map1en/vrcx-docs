# 前端性能现状

> 基于 **2026 年 3 月 15 日** 代码状态整理，按严重程度排序。

## 🔴 关键

### 1. `MyAvatars` 刷新有明显的 SQLite N+1 查询

- 位置：
  `src/views/MyAvatars/MyAvatars.vue`
  `src/services/database/avatarFavorites.js`
- 现状：
  `refreshAvatars()` 拉完头像列表后，会先取一次全部标签，再对每个头像单独调用 `database.getAvatarTimeSpent(ref.id)`。
- 为什么严重：
  头像数量越多，刷新就越像 `1 + N` 次数据库读取。这个等待直接发生在页面刷新流程里，用户会感知到列表完成前的明显停顿。
- 建议方向：
  把头像时长改成批量查询，和标签一起在一次或少量 SQL 中取回。

### 2. Feed / GameLog / 通知搜索仍然依赖 `LIKE '%x%'` 和 `UNION ALL`

- 位置：
  `src/services/database/feed.js`
  `src/services/database/gameLog.js`
  `src/services/database/notifications.js`
- 现状：
  多条搜索路径仍在多个表上做 `LIKE '%search%'`，再通过 `UNION ALL` 合并结果；其中通知搜索仍然是字符串拼接 SQL。
- 为什么严重：
  这类查询无法有效利用普通索引，数据库越老、表越大、搜索越频繁，退化越明显。它也是旧性能页中仍然成立、但这次拆页后必须保留的核心问题。
- 建议方向：
  中长期上 FTS5；短期上至少先参数化查询，并评估是否能把部分查询改成前缀匹配或内存索引。

### 3. `FriendList` 搜索每次变更都会全量过滤，并继续触发额外统计

- 位置：
  `src/views/FriendList/FriendList.vue`
  `src/stores/friend.js`
  `src/services/database/gameLog.js`
- 现状：
  `friendsListSearchChange()` 每次都遍历整个好友集合，匹配 display name、memo、note、bio、status、rank；随后还会调用 `getAllUserStats()` 和 `getAllUserMutualCount()`。
- 为什么严重：
  这不只是前端过滤，还会把大 SQL 查询重新拉进搜索交互链路。好友多时，输入延迟会和数据库规模一起放大。
- 建议方向：
  给搜索加 debounce；把统计查询移出每次输入路径；缓存统计结果或按需异步补全。

## 🟠 高

### 4. `FriendsLocations` 在虚拟化之前仍然有多层全量重建

- 位置：
  `src/views/FriendsLocations/FriendsLocations.vue`
- 现状：
  页面虽然用了虚拟列表，但上游仍在反复做 `map`、`filter`、`flatMap`、`sort`、去重、分组合并，再生成 `virtualRows`。
- 为什么严重：
  真正吃 CPU 的地方在“虚拟化之前”。搜索、切分段、切同房聚合、收藏分组变化时，都可能把整条数据链重新跑一遍。
- 建议方向：
  为同房分组、搜索索引、虚拟行数据建立更稳定的增量缓存，避免每次交互全量重建。

### 5. ~~`FriendsLocations` 的 `virtualizer.measure()` 触发过密~~ ✅ 已解决

- 位置：
  `src/views/FriendsLocations/FriendsLocations.vue`
- 解决于：`d52b0c7c`、`1c0a3509`
- 改动：
  引入 `scheduleVirtualMeasure()` —— 统一的合并调度路径，将所有 `measure()` 调用合并到一次 `nextTick` 中。`searchTerm`、`activeSegment`、`showSameInstance`、`filteredFriends.length`、`cardScale/cardSpacing`、`virtualRows` 等多个 watcher 现在全部通过这条单一路径，消除了每次交互的冗余测量。同时将手动 `ResizeObserver` 管理迁移到 `@vueuse/core` 的 `useResizeObserver`。

### 6. ~~旧的快速搜索路径仍在主线程全量扫描好友~~ ✅ 已解决

- 位置：
  `src/stores/search.js`
- 解决于：`d52b0c7c`
- 改动：
  旧的 `quickSearchRemoteMethod()` 函数及其依赖（`friendStore`、`removeConfusables`、`localeIncludes`、`quickSearchItems` ref）被完全移除。所有快速搜索现在完全通过 `quickSearchWorker` 路由。`search.js` 从 ~450 行缩减到 ~300 行，现在只包含直接访问解析和用户搜索 API 逻辑。

## 🟡 中

### 7. ~~列表缩放滑杆把每一步拖动都写进 SQLite 配置~~ ✅ 已解决（FriendsLocations）

- 位置：
  `src/views/FriendsLocations/FriendsLocations.vue`
  `src/views/MyAvatars/composables/useAvatarCardGrid.js`
  `src/services/config.js`
- 解决于：`d52b0c7c`（FriendsLocations）、`1c0a3509`（useAvatarCardGrid ResizeObserver）
- 改动：
  `FriendsLocations` 现在将 `configRepository.setString()` 调用包裹在 `debounce(200ms)` 中，涵盖 `cardScale` 和 `cardSpacing` 两个滑杆。`useAvatarCardGrid` 重构为使用 `@vueuse/core` 的 `useResizeObserver`（移除了手动 `ResizeObserver` 生命周期管理），但其滑杆持久化在此次变更中未加 debounce。
- 剩余：
  `useAvatarCardGrid` 的滑杆 setter 仍然在每步拖动时直接调用 `configRepository.setString()`。

### 8. `FriendsSidebar` 渲染前的数据准备仍然是多层全量扫描

- 位置：
  `src/views/Sidebar/components/FriendsSidebar.vue`
- 现状：
  侧栏虽然做了虚拟化，但在 `sameInstanceFriendId`、`visibleFavoriteOnlineFriends`、`vipFriendsDivideByGroup`、`virtualRows` 这些阶段仍会多次遍历和重组数据。
- 为什么有问题：
  DOM 数量被控住了，但 CPU 仍然花在虚拟化之前的数据准备上。
- 建议方向：
  复用预分组结果，减少筛选链路中的重复数组构造。

### 9. 收藏 store 的 computed 会原地 `sort()` 源数组

- 位置：
  `src/stores/favorite.js`
- 现状：
  `favoriteFriends`、`favoriteWorlds`、`favoriteAvatars` 在 computed 中直接对源数组调用 `sort()`。
- 为什么有问题：
  `sort()` 会修改原数组本身，容易制造额外响应式扰动，也让大列表排序更难推断。
- 建议方向：
  先复制数组再排序，或把排序结果缓存为独立派生值。

### 10. ~~Pinia action trail 插件对每个 action 都做完整 `localStorage` 读写~~ ✅ 已删除

- 位置：
  `src/plugins/piniaActionTrail.js`（已删除）
  `src/stores/index.js`
- 解决于：`54f85c62`
- 改动：
  `piniaActionTrail.js` 已被完全删除。`stores/index.js` 中的 `registerPiniaActionTrailPlugin()` 调用和 60 秒延迟初始化被移除。`vrcx.js` 中的崩溃恢复上报不再读取或清除 trail。替换为 `rendererMemoryReport.js` —— 一个轻量的基于定时器的插件，监控 `performance.memory`，当 JS 堆使用率超过 80% 阈值时向 Sentry 发送警告（5 分钟冷却）。

## 备注

- 当前前端性能的主要矛盾已经从“纯渲染量过大”转向“交互链路里混入了全量计算与同步持久化”。
- 旧版总性能页里关于好友排序和深度 watcher 的部分分析有历史价值，但不再代表当前最高优先级。
