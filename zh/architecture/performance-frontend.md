# 前端性能现状

> 基于 **2026 年 3 月 14 日** 代码状态整理，按严重程度排序。

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

### 5. `FriendsLocations` 的 `virtualizer.measure()` 触发过密

- 位置：
  `src/views/FriendsLocations/FriendsLocations.vue`
- 现状：
  `searchTerm`、`activeSegment`、`showSameInstance`、`filteredFriends.length`、`cardScale/cardSpacing`、`virtualRows` 变更都会触发 `nextTick + virtualizer.measure()`。
- 为什么严重：
  一次用户动作会联动多个 watch，从而触发多次重复测量和布局计算，表现为搜索和切换时的抖动或掉帧。
- 建议方向：
  合并测量入口，做单帧节流，避免一个交互命中多个重复 `measure()`。

### 6. 旧的快速搜索路径仍在主线程全量扫描好友

- 位置：
  `src/stores/search.js`
- 现状：
  `quickSearchRemoteMethod()` 仍会遍历 `friendStore.friends.values()`，并对名字、memo、note 做 `removeConfusables()` 和 `localeIncludes()` 匹配。
- 为什么严重：
  仓库已经有 worker 版快速搜索，这说明主线程实现本身就是已知热点。只要仍有入口走旧路径，大好友量下就会继续拖慢输入。
- 建议方向：
  统一到 `quickSearchWorker`，逐步移除旧主线程实现。

## 🟡 中

### 7. 列表缩放滑杆把每一步拖动都写进 SQLite 配置

- 位置：
  `src/views/FriendsLocations/FriendsLocations.vue`
  `src/views/MyAvatars/composables/useAvatarCardGrid.js`
  `src/services/config.js`
- 现状：
  slider 的 setter 直接 `configRepository.setString()`，底层是 SQLite `INSERT OR REPLACE`。
- 为什么有问题：
  拖动时会把 UI 重算和高频写库叠在一起，放大交互成本。
- 建议方向：
  改成只在拖动结束后落库，或用 debounce 批量提交。

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

### 10. Pinia action trail 插件对每个 action 都做完整 `localStorage` 读写

- 位置：
  `src/plugins/piniaActionTrail.js`
  `src/stores/index.js`
- 现状：
  插件会 `getItem -> JSON.parse -> push -> JSON.stringify -> setItem`；当前只在 `NIGHTLY` 构建启用。
- 为什么有问题：
  这是同步主线程存储操作。虽然只在 nightly 打开，但在状态变更密集场景里仍会明显放大卡顿。
- 建议方向：
  改成内存缓冲 + 定时刷盘，或仅在错误上报前一次性读取。

## 备注

- 当前前端性能的主要矛盾已经从“纯渲染量过大”转向“交互链路里混入了全量计算与同步持久化”。
- 旧版总性能页里关于好友排序和深度 watcher 的部分分析有历史价值，但不再代表当前最高优先级。
