# Non-Frontend Performance

> Based on the codebase state on **March 14, 2026**, ordered by severity.

## 🔴 Critical

### 1. Electron overlay still does synchronous shared-memory writes and full-frame copies every frame

- Location:
  `src-electron/main.js`
- Current state:
  The overlay uses `webContents.on('paint')`, converts every frame with `image.toBitmap()`, then `writeOverlayFrame()` performs `openSync`, `Buffer.alloc`, `copy`, `writeSync`, and `closeSync`.
- Why it matters:
  This is a hot rendering path on the Electron main process. Synchronous IO plus large allocations directly increase main-thread stalls, GC pressure, and overlay frame drops.
- Direction:
  Reuse the shared-memory handle and frame buffer instead of reopening and reallocating per frame.

### 2. `LogWatcher` still relies on 1-second polling and repeated directory scans

- Location:
  `Dotnet/LogWatcher.cs`
- Current state:
  A background thread runs `Update()` once per second, calls `GetFiles("output_log_*.txt")`, sorts by creation time, refreshes entries, compares lengths, and decides what to parse.
- Why it matters:
  Cost scales with log-file count and never really goes idle because the polling loop is always alive.
- Direction:
  Split file discovery from incremental reading, and replace full directory scans with a lighter event-driven approach where possible.

## 🟠 High

### 3. Screenshot search combines recursive full scans with N+1 metadata-cache lookups

- Location:
  `Dotnet/ScreenshotMetadata/ScreenshotHelper.cs`
  `Dotnet/ScreenshotMetadata/ScreenshotMetadataDatabase.cs`
- Current state:
  `FindScreenshots()` recursively enumerates all PNGs, then attempts cache reads per file, and the cache path itself can trigger multiple small SQL lookups.
- Why it matters:
  Large screenshot libraries pay twice: filesystem traversal plus repeated SQLite round trips.
- Direction:
  Build a persistent screenshot index and merge cache-hit checks so each file does not fan out into multiple database reads.

### 4. “Last screenshot” lookup also scans everything before sorting

- Location:
  `Dotnet/AppApi/Common/Screenshot.cs`
- Current state:
  `GetLastScreenshot()` recursively enumerates all PNGs and sorts them just to pick one result.
- Why it matters:
  It is full traversal for a single answer, so latency grows directly with library size.
- Direction:
  Maintain a recent-screenshot index or reuse scan metadata from the cache layer.

### 5. The CEF accelerated-paint path still uses busy-wait GPU synchronization

- Location:
  `Dotnet/Overlay/Cef/OffScreenBrowser.cs`
- Current state:
  After `CopyResource` and `Flush()`, `OnAcceleratedPaint` waits with `while (GetData(...) == 1) Thread.Yield()`.
- Why it matters:
  Busy-waiting inside a hot render path can consume a CPU core while overlay rendering is active.
- Direction:
  Replace the busy wait with a more explicit synchronization model or event-driven handoff.

## 🟡 Medium

### 6. The overlay WebSocket server still lacks clear backpressure handling

- Location:
  `Dotnet/OverlayWebSocket/OverlayServer.cs`
- Current state:
  Receive logic assumes small single-chunk messages, while broadcast logic fire-and-forgets `SendAsync`.
- Why it matters:
  Under higher message rates, exceptions, queued tasks, and extra logging can magnify the load.
- Direction:
  Add message reassembly, bounded send queues, and slow-client backpressure.

### 7. Windows IPC still forwards every packet directly into browser JavaScript

- Location:
  `Dotnet/IPC/IPCClient.cs`
- Current state:
  Incoming pipe messages immediately call `ExecuteScriptAsync("window?.$pinia?.vrcx.ipcEvent", packet)`.
- Why it matters:
  Under bursty traffic, backend throughput is pushed straight into the browser UI thread with no batching.
- Direction:
  Batch or throttle packets before crossing into the page.

### 8. Overlay main loops are still mostly polling-driven

- Location:
  `Dotnet/Overlay/Electron/VRCXVRElectron.cs`
  `Dotnet/Overlay/Cef/VRCXVRCef.cs`
- Current state:
  The Electron path effectively loops near `Thread.Sleep(1)` when active, and the CEF path keeps a short fixed render loop as well.
- Why it matters:
  CPU wakeups continue even when no meaningful work is ready.
- Direction:
  Make “new frame”, “needs redraw”, and “state changed” explicit events instead of constant polling.

### 9. Debug logging defaults are still aggressive and file logging uses `AutoFlush=true`

- Location:
  `Dotnet/Program.cs`
  `Dotnet/Cef/MainForm.cs`
- Current state:
  File and console logging start at a relatively verbose level, and file logging flushes eagerly.
- Why it matters:
  In noisy scenarios this turns into a stream of small synchronous disk writes.
- Direction:
  Lower default verbosity or reserve aggressive flush behavior for explicit diagnostic sessions.

## Notes

- The current non-frontend bottlenecks cluster around overlay rendering, always-on polling work, and screenshot/log subsystems with high IO pressure.
- These issues deserve a separate page because their triggers and fixes are very different from renderer-side UI performance work.

