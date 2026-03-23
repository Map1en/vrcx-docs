# VRCX 内部文档

这套文档服务两个目标：

- 快速理解前端的上层结构，而不是陷在零散实现细节里
- 在改功能或排查卡顿时，能尽快定位到真正的代码入口和性能链路

## 先看什么

- [系统总览](/zh/architecture/overview)：应用如何启动、主要层级如何协作、哪些链路是主路径
- [前端改动入口地图](/zh/architecture/change-entry-map)：改一个功能时，应该从哪几个文件开始看
- [性能总览](/zh/architecture/performance-analysis)：当前仍然成立的热点、已经缓解的问题、建议优先级

## 目前文档重点

### 架构

文档聚焦这些长期稳定的结构：

- `app.js` / `App.vue` 的启动顺序
- `view -> store -> coordinator -> service` 的主业务链路
- WebSocket 驱动的实时更新路径
- Worker、SQLite、配置持久化这些后台能力如何接入主线程

### 性能

性能分析优先关注真正影响体感的地方：

- 输入或筛选时是否夹带全量计算
- 列表虚拟化之前是否已经做了多轮数据重建
- SQLite 查询是否落入 `LIKE '%x%'`、`UNION ALL`、N+1 这类退化路径
- 配置写入、日志处理、后台刷新是否在高频交互上同步发生

### 工程化

文档默认遵循当前代码里的实际边界，而不是理想化分层：

- `store` 持有状态与局部派生
- `coordinator` 负责跨 store 编排和副作用
- `service` 负责请求、数据库、配置、桥接层
- `worker` 负责可剥离的大计算

## 阅读建议

- 想快速熟悉项目：从 [系统总览](/zh/architecture/overview) 开始
- 想改页面或功能：接着看 [前端改动入口地图](/zh/architecture/change-entry-map)
- 想查卡顿、输入延迟、列表压力：直接看 [性能总览](/zh/architecture/performance-analysis) 和 [前端性能](/zh/architecture/performance-frontend)
