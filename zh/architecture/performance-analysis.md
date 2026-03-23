# 性能总览

> 基于 `VRCX` 仓库在 **2026 年 3 月 23 日** 的代码状态整理。这里只保留当前仍成立的结构性结论。

## 先看结论

当前前端性能的主要矛盾，不再是“页面元素太多”，而是下面几类工作进入了高频交互链路：

- 输入、筛选、分组时的全量数据重建
- SQLite 搜索和统计查询的退化路径
- 虚拟列表之前的多轮派生和拼装
- 配置持久化、后台刷新、日志处理这类同步副作用
- WebSocket 和 `updateLoop` 驱动下的持续主线程压力

换句话说，VRCX 现在更像是在和“主线程上的数据整形成本”作战，而不只是和 DOM 数量作战。

## 当前最重要的性能路径

### 1. 实时事件路径

代表模块：`src/services/websocket.js`、`friendPresenceCoordinator`、通知和群组相关 coordinator/store

这条路径是好友状态、位置、通知、群组变化的总入口。事件本身不一定重，但如果每次落地都触发大列表重排、大组装或额外筛选，累计成本会迅速放大。

### 2. 轮询与后台任务路径

代表模块：`src/stores/updateLoop.js`

`updateLoop()` 每秒驱动多个倒计时槽位，负责定时刷新、日志读取、游戏状态检查和部分后台维护。单次循环不一定重，但它把很多 I/O 和状态更新聚到了一条常驻链路上。

### 3. 列表交互路径

代表页面：`FriendList`、`FriendsLocations`、`FriendsSidebar`

这类页面已经使用了虚拟列表或增量排序，但真正的热点常常发生在虚拟化之前：

- 多次 `filter` / `map` / `sort` / 分组
- 为搜索或分段切换重建整批行数据
- 交互后触发额外统计查询

### 4. 本地数据查询路径

代表模块：`src/services/database/feed.js`、`gameLog.js`、`notifications.js`

这类路径决定了“数据库越老越卡”的上限。这里最值得警惕的模式是：

- `LIKE '%x%'`
- 多表 `UNION ALL`
- 搜索过程中重新跑大统计
- 旧数据集上的全表匹配

### 5. Worker / 本地缓存路径

代表模块：`src/stores/activity.js`、`src/stores/quickSearch.js`、`src/queries/*`

这是当前代码里相对健康的一条路径：项目已经把快速搜索和活跃度聚合迁进 Worker，并引入 snapshot、in-flight 去重、Query cache 和增量索引等机制。它说明重计算迁出主线程是有效方向，不该再回退。

## 仍然成立的高优先级问题

| 优先级 | 问题 | 说明 |
|--------|------|------|
| 🔴 关键 | 本地搜索查询仍依赖 `LIKE '%x%'`、`UNION ALL` | 典型位置在 `src/services/database/feed.js`、`gameLog.js`、`notifications.js`，会随数据量恶化 |
| 🔴 关键 | `FriendList` 输入链路仍带有全量过滤与统计刷新 | 即使已有缓存和时间窗，这条路径仍然是交互敏感区 |
| 🔴 关键 | `FriendsLocations` 和 `FriendsSidebar` 仍在虚拟化前做多轮重建 | 虚拟化控制了 DOM，但没有消除上游 CPU 成本 |
| 🟠 高 | `websocket` 与 `updateLoop` 叠加构成常驻主线程压力 | 高频事件和每秒轮询会把派生列表和状态更新持续推向主线程 |
| 🟠 高 | 高频配置写入仍散落在多个视图/设置模块 | 很多 `configRepository.setString()` 仍直接落在交互 setter 里 |

## 已经可以确认的正向设计

这些不是“未来建议”，而是代码里已经存在、值得继续依赖的优化基础：

- `src/services/request.js` 会在短窗口内合并重复 GET 请求，并对部分失败请求做短期熔断
- `src/stores/friend.js` 通过 `sortedFriends` + `reindexSortedFriend()` + batch 更新，避免了旧式的多份完整排序
- `src/stores/quickSearch.js` 已彻底依赖 Worker 执行快速搜索
- `src/stores/activity.js` 已把活跃度热力图和重叠分析放进 Worker，并引入缓存快照与任务去重
- `src/queries/*` 已通过 Query cache 管理实体请求、缓存过期和事件补丁
- 多个重列表界面已经使用虚拟列表，说明瓶颈判断应更多放在“数据准备”而不是“最终渲染”

## 已经过时、不该继续写进主结论的点

以下内容有历史背景，但不适合作为当前总览里的主结论：

- “好友列表主要问题是多份独立完整排序”已经不准确，`sortedFriends` 机制已经落地
- “快速搜索仍走主线程全量扫描”已经不准确，主路径已迁到 Worker
- “`MyAvatars` 是典型 SQLite N+1 页面”已经不准确，当前实现已改为批量读取标签和时长
- 单纯把问题归结为“DOM 太多”已经不够解释当前卡顿来源

## 建议的阅读顺序

- 查总体判断：先看本页
- 查前端热点细节：看 [前端性能](/zh/architecture/performance-frontend)
- 查非前端链路：看 [非前端性能](/zh/architecture/performance-non-frontend)

如果你只记一个判断，那就是：当前最值得优化的，不是“再少渲染几个节点”，而是“别让全量重算、重查询和同步持久化混进高频交互”。
