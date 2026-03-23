# 前端性能

> 基于 **2026 年 3 月 23 日** 的代码状态整理，聚焦仍然成立的前端热点。

## 判断框架

看这类页面是否会卡，不要只问“渲染了多少节点”，而要先问三个问题：

1. 交互发生前，是否已经在主线程做了整批数据准备
2. 输入或筛选时，是否又把数据库统计、配置写入等副作用带了进来
3. 虚拟化、缓存、Worker 是否真的挡住了热点，还是只挡住了最后一层 DOM

## 🔴 关键热点

### 1. `FriendList` 仍然是最敏感的输入链路之一

- 位置：`src/views/FriendList/FriendList.vue`、`src/stores/friend.js`、`src/services/database/gameLog.js`
- 当前情况：页面已经引入搜索缓存、刷新时间窗和定时调度，但搜索仍需要对好友集合做匹配，统计刷新仍与这条链路紧密相关
- 性能含义：这类页面最容易在“大好友量 + 老数据库”组合下出现输入延迟，因为一次输入不只是改前端过滤，还可能牵动大统计结果是否刷新
- 文档结论：后续优化应继续沿着“更强的 debounce / 更明确的统计缓存边界 / 把统计结果从输入路径剥离”推进

### 2. `FriendsLocations` 的主要成本仍在虚拟化之前

- 位置：`src/views/FriendsLocations/FriendsLocations.vue`
- 当前情况：页面已经通过 `scheduleVirtualMeasure()` 合并测量，也已经虚拟化列表；但 `virtualRows` 之前仍有同房分组、分段切换、收藏分组、搜索过滤、卡片行切块等多轮构造
- 性能含义：真正影响滚动和切换体感的，不只是渲染多少卡片，而是每次交互前要不要先重建整批行模型
- 文档结论：这里后续更值得做的是稳定上游缓存与增量派生，而不是继续把注意力集中在 DOM 层微调

### 3. `FriendsSidebar` 也有类似的“虚拟化前重建”问题

- 位置：`src/views/Sidebar/components/FriendsSidebar.vue`
- 当前情况：`sameInstanceFriendId`、`visibleFavoriteOnlineFriends`、`onlineFriendsByGroupStatus`、`vipFriendsDivideByGroup`、`virtualRows` 形成多层派生链
- 性能含义：即使侧栏已经虚拟化，只要实时事件频繁，前面的集合重组和分组就会反复跑
- 文档结论：侧栏性能的关键不是“少渲染几行”，而是降低每次状态变化后的多轮数组构造

### 4. 本地搜索和日志统计仍会把 SQLite 压力带回前端交互

- 位置：`src/services/database/feed.js`、`src/services/database/gameLog.js`、`src/services/database/notifications.js`
- 当前情况：多条查询仍依赖 `LIKE '%x%'` 和 `UNION ALL`；通知搜索仍有字符串拼接 SQL
- 性能含义：用户感知到的是“页面搜索慢”，但根因其实是前端交互链路上挂着难以利用索引的本地查询
- 文档结论：这类问题应该在文档里归入“前端体感热点”，即使根代码位于数据库层

## 🟠 重要但次一级的问题

### 5. 高频配置写入仍然分散存在

- 位置：`FriendsLocations`、`MyAvatars`、`Favorites`、`Settings` 等多个视图和 composable
- 当前情况：部分滑杆和交互已经开始做 debounce，但大量 `configRepository.setString()` 仍直接写在 setter 或 watch 回调里
- 性能含义：单次写入可能不重，但如果落在拖动、输入、切换这类高频操作里，会形成额外抖动
- 文档结论：应继续把“持久化时机”与“响应式显示时机”拆开

### 6. `websocket` 和 `updateLoop` 会持续把压力送进前端派生链

- 位置：`src/services/websocket.js`、`src/stores/updateLoop.js`
- 当前情况：实时事件在主线程解析后进入 coordinator/store；`updateLoop()` 每秒还会触发定时刷新、日志读取、游戏状态检查等后台任务
- 性能含义：单个页面未必主动做了什么，但常驻链路仍会持续触发 store 派生和界面更新
- 文档结论：文档讨论前端性能时，不能只看单页，也要把“常驻后台压力”算进去

### 7. `MyAvatars` 的刷新路径已经比旧文档健康，但仍属于重页面刷新

- 位置：`src/views/MyAvatars/MyAvatars.vue`
- 当前情况：刷新流程已经改为批量读取 `getAllAvatarTags()` 和 `getAllAvatarTimeSpent()`，旧的逐头像时长查询结论已经不成立
- 性能含义：这一页的主要成本现在更接近“大批量列表刷新 + 批量附加元数据”，而不是典型 N+1
- 文档结论：后续如果继续优化，应关注批量数据准备和页面首次可交互时间，而不是延续旧结论

## 已经可以确认的优化方向

### 1. Worker 化是有效方向

- `src/stores/quickSearch.js` 通过 Worker 执行快速搜索
- `src/stores/activity.js` 通过 Worker 执行活跃度计算

这说明凡是“可序列化、可批量、可后台算”的内容，都值得优先从主线程挪走。

### 2. 增量重排优于重复整表排序

- `src/stores/friend.js` 维护 `sortedFriends`
- `reindexSortedFriend()` 允许在单个实体变动时局部调整顺序

这类设计比过去每个派生列表各自排序更适合实时好友场景。

### 3. 虚拟列表只解决最后一层问题

当前代码非常清楚地说明了一点：

- 虚拟化可以控制渲染量
- 但如果上游仍在整批生成 `virtualRows` 或重新构造分组，CPU 热点仍然存在

因此文档在讨论大列表性能时，应该先写“虚拟化之前发生了什么”。

## 不应继续沿用的旧结论

- 不应再把 `MyAvatars` 写成“典型 SQLite N+1 页面”，因为当前实现已改为批量读取
- 不应再把快速搜索写成“主线程全量扫描”，因为主路径已迁到 Worker
- 不应把所有卡顿都简化成“节点太多”，因为现在更多是数据派生成本

## 建议后续文档继续跟踪的指标

- 输入一次搜索时，是否会触发数据库统计刷新
- 大列表切段或分组时，是否重建整批 `virtualRows`
- 高频交互是否直接触发 `configRepository.setString()`
- 某个实时事件落地后，会带动多少层派生链重算
