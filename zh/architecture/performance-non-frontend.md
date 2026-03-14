# 非前端性能现状

> 基于 **2026 年 3 月 14 日** 代码状态整理，按严重程度排序。

## 🔴 关键

### 1. Electron Overlay 每帧都在做同步共享内存写入和整帧复制

- 位置：
  `src-electron/main.js`
- 现状：
  overlay 使用 `webContents.on('paint')`，每帧 `image.toBitmap()` 后进入 `writeOverlayFrame()`；该函数内部会 `openSync`、`Buffer.alloc`、`copy`、`writeSync`、`closeSync`。
- 为什么严重：
  这是高频渲染路径，而且发生在 Electron 主进程。同步 IO + 大块内存分配会直接带来主线程卡顿、GC 压力和 overlay 掉帧。
- 建议方向：
  复用已打开的共享内存句柄和帧缓冲区，避免每帧重新分配和同步打开/关闭。

### 2. `LogWatcher` 采用 1 秒轮询并反复扫描日志目录

- 位置：
  `Dotnet/LogWatcher.cs`
- 现状：
  后台线程每秒执行一次 `Update()`，调用 `GetFiles("output_log_*.txt")`，按创建时间排序，再逐个刷新、比较长度、决定是否解析。
- 为什么严重：
  日志文件越多，这条后台路径的 CPU 和 IO 成本越高，而且它是常驻轮询，不需要用户主动触发。
- 建议方向：
  用 `FileSystemWatcher` 或更轻的增量索引替代全目录扫描；把“发现新文件”和“读取新增内容”拆开。

## 🟠 高

### 3. 截图搜索路径存在全量递归遍历 + 元数据缓存 N+1 查询

- 位置：
  `Dotnet/ScreenshotMetadata/ScreenshotHelper.cs`
  `Dotnet/ScreenshotMetadata/ScreenshotMetadataDatabase.cs`
- 现状：
  `FindScreenshots()` 先 `Directory.GetFiles(..., SearchOption.AllDirectories)` 扫完整个截图目录；随后每个文件都要尝试缓存命中，缓存层内部又会触发多次小 SQL 查询。
- 为什么严重：
  大型图库下，这条路径同时消耗文件系统遍历和 SQLite 往返，响应时间会随截图数量明显上升。
- 建议方向：
  给截图目录建立持久索引，合并缓存命中查询，避免每个文件都走多次数据库判断。

### 4. “最近截图” 也是递归全量列举后再排序

- 位置：
  `Dotnet/AppApi/Common/Screenshot.cs`
- 现状：
  `GetLastScreenshot()` 通过 `Directory.GetFiles(..., SearchOption.AllDirectories)` 取回所有 PNG，再排序取最新项。
- 为什么严重：
  这是典型的“为了取一个结果遍历全部数据”。截图库越大，延迟越明显。
- 建议方向：
  维护最近截图索引，或在缓存层记录最后一次扫描结果。

### 5. CEF overlay 的 accelerated paint 路径存在忙等式 GPU 同步

- 位置：
  `Dotnet/Overlay/Cef/OffScreenBrowser.cs`
- 现状：
  `OnAcceleratedPaint` 中在 `CopyResource` 和 `Flush()` 后，使用 `while (GetData(...) == 1) Thread.Yield()` 等待 GPU 完成。
- 为什么严重：
  这是高频渲染路径上的忙等，overlay 活跃时很容易持续吃掉一个 CPU 核心。
- 建议方向：
  改成事件驱动或更明确的同步原语，避免在渲染线程上忙等。

## 🟡 中

### 6. Overlay WebSocket 服务没有明显的背压控制

- 位置：
  `Dotnet/OverlayWebSocket/OverlayServer.cs`
- 现状：
  接收侧使用固定小 buffer，并假定一次 `ReceiveAsync` 就能拿到完整消息；发送侧广播时直接 fire-and-forget `SendAsync`。
- 为什么有问题：
  消息频率上来后，异常、积压任务和额外日志都会放大性能问题。
- 建议方向：
  增加消息分片拼装、发送队列和慢客户端背压处理。

### 7. Windows IPC 把每个包都直接桥接进浏览器 JS

- 位置：
  `Dotnet/IPC/IPCClient.cs`
- 现状：
  收到 pipe 消息后直接 `ExecuteScriptAsync("window?.$pinia?.vrcx.ipcEvent", packet)`。
- 为什么有问题：
  高吞吐时，这会把后端消息压力原样转移到前端 UI 线程。
- 建议方向：
  做消息合批、节流，或改成更轻的桥接协议。

### 8. Overlay 主循环整体仍偏轮询驱动

- 位置：
  `Dotnet/Overlay/Electron/VRCXVRElectron.cs`
  `Dotnet/Overlay/Cef/VRCXVRCef.cs`
- 现状：
  Electron overlay 活跃时接近 `Thread.Sleep(1)` 轮询； CEF overlay 也保持固定短周期循环。
- 为什么有问题：
  在没有新帧或没有状态变化时，CPU 仍会持续被唤醒。
- 建议方向：
  把“有新帧”“需要重绘”“状态变化”变成显式事件，而不是持续 polling。

### 9. Debug 日志默认级别较高且文件输出 `AutoFlush=true`

- 位置：
  `Dotnet/Program.cs`
  `Dotnet/Cef/MainForm.cs`
- 现状：
  文件与控制台日志默认都较激进，文件 target 开启了 `AutoFlush`。
- 为什么有问题：
  在页面事件多、console 噪声大的场景下，会形成持续的小块同步写盘。
- 建议方向：
  降低默认日志级别，或只在特定诊断模式下打开高频日志与强制 flush。

## 备注

- 当前非前端性能的主要矛盾集中在 Overlay 渲染链路、常驻轮询任务，以及截图/日志这两类高 IO 子系统。
- 相比旧版单页性能分析，非前端问题更适合单独阅读，因为它们的触发条件、修复手段和前端完全不同。

