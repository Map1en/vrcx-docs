# 性能现状总览

> 基于 `VRCX` 仓库在 **2026 年 3 月 14 日** 的代码状态整理。本文只保留现状和导航；具体问题已拆分为前端页与非前端页，并按严重程度排序。

## 基准场景

- 4000+ 好友
- 多年累积的 SQLite 数据库
- 大型截图库
- VR Overlay 持续运行

在这个量级下，当前性能问题的主矛盾已经不再是单纯的 DOM 数量，而是：

- 主线程上的全量数据整理
- 高频同步 SQLite / `localStorage` / 文件 IO
- Overlay 渲染链路里的整帧拷贝与轮询
- 仍然存在的旧查询路径和未批处理的后台任务

## 相比旧版分析，现状有这些变化

### 已经缓解或不再适合作为最高优先级的问题

1. `findUserByDisplayName` 不再只有纯线性扫描。

   `src/shared/utils/user.js` 现在支持传入 `cachedUserIdsByDisplayName` 索引，命中时会先走索引，再回退到全表扫描。它仍是热点函数，但不再适合继续当成“全局第一性能瓶颈”描述。

2. 好友列表不再是 5 份独立数组各自完整排序。

   `src/stores/friend.js` 现在维护了 `sortedFriends`，并通过 `reindexSortedFriend()` 做增量重排。旧文档里“5 个 computed 各自 `Array.from(...).sort(...)`”这一段已经过时。

3. 搜索索引的深度 watcher 问题已经明显缓解。

   现在仓库里已经有 `quickSearchWorker`、`searchIndexStore.version` 和 coordinator 驱动的索引更新路径。旧文档里那类“6 个 deep watcher 持续拖垮搜索”的表述不再准确。剩余问题主要是仍有一条旧的主线程快速搜索路径还在使用。

## 当前优先级快照

| 严重程度 | 问题 | 所在页 |
|----------|------|-------|
| 🔴 关键 | `MyAvatars` 刷新中的 SQLite N+1 查询 | [前端性能页](/zh/architecture/performance-frontend) |
| 🔴 关键 | Feed / GameLog / 通知搜索仍依赖 `LIKE '%x%'` 和 `UNION ALL` | [前端性能页](/zh/architecture/performance-frontend) |
| 🔴 关键 | `FriendList` 搜索每次变更都做全量过滤并触发额外统计 | [前端性能页](/zh/architecture/performance-frontend) |
| 🔴 关键 | Electron Overlay 每帧同步共享内存写入 + 整帧复制 | [非前端性能页](/zh/architecture/performance-non-frontend) |
| 🔴 关键 | `LogWatcher` 1 秒轮询 + 目录扫描 | [非前端性能页](/zh/architecture/performance-non-frontend) |
| 🟠 高 | `FriendsLocations` 在虚拟化前有多层全量重建 | [前端性能页](/zh/architecture/performance-frontend) |
| 🟠 高 | 截图搜索/缓存路径存在全量遍历和 N+1 查询 | [非前端性能页](/zh/architecture/performance-non-frontend) |

## 分页

- [前端性能现状](/zh/architecture/performance-frontend)
- [非前端性能现状](/zh/architecture/performance-non-frontend)

## 阅读建议

- 如果你在查 UI 卡顿、输入延迟、列表交互变慢，先看前端页。
- 如果你在查 Overlay 掉帧、日志读取吃 CPU、截图搜索慢，先看非前端页。
