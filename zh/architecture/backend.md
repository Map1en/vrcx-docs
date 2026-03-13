# Backend Architecture Reference

> **本文档仅供参考。** 前端重构时不需要修改后端代码，但需要理解后端暴露了哪些 API、各平台的桥接机制差异、以及哪些功能在特定平台上不可用。

## Platform Overview

VRCX 后端运行在三个平台上，每个平台使用不同的宿主（Host）+ 同一套 C# 核心逻辑：

| Platform | Host | Browser Engine | C# Build Target | Bridge |
|----------|------|---------------|-----------------|--------|
| **Windows** | WinForms (`MainForm.cs`) | CefSharp (Chromium) | `VRCX-Cef.csproj` → WinExe, .NET 10 | CefSharp JS Bindings |
| **Linux** | Electron (`main.js`) | Electron (Chromium) | `VRCX-Electron.csproj` → Library (.cjs), .NET 9 | `node-api-dotnet` + IPC |
| **macOS** | Electron (`main.js`) | Electron (Chromium) | `VRCX-Electron-arm64.csproj` → Library, .NET 9 | `node-api-dotnet` + IPC |

### Build Configuration Differences

| | Windows (Cef) | Linux/macOS (Electron) |
|--|--------|-----|
| OutputType | `WinExe`（独立可执行程序） | `Library`（.cjs 模块，被 Electron 加载） |
| TargetFramework | `net10.0-windows10.0.19041.0` | `net9.0` |
| Platforms | x64 only | x64 + ARM64 |
| DefineConstants | *(无特殊定义)* | `LINUX` |
| 排除目录 | `AppApi/Electron/`, `Overlay/Electron/` | `Cef/`, `AppApi/Cef/`, `Overlay/Cef/`, `OverlayWebSocket/` |
| 特有依赖 | CefSharp, Silk.NET (D3D11, DXGI), UWP Notifications | `Microsoft.JavaScript.NodeApi` |

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Vue 3 SPA)                     │
│                   src/ directory (~450 components)            │
│                                                              │
│  window.AppApi / window.WebApi / window.SQLite / ...         │
│  (全局变量，对后端 C# 类的直接引用)                              │
└──────────────────────┬───────────────────────────────────────┘
                       │
          ┌────────────┼───────────────────┐
          │            │                   │
    ┌─────▼────┐  ┌────▼──────┐   ┌───────▼───────┐
    │ Windows  │  │  Linux    │   │    macOS      │
    │ (CefSharp)│  │ (Electron)│   │  (Electron)   │
    └─────┬────┘  └────┬──────┘   └───────┬───────┘
          │            │                   │
          ▼            ▼                   ▼
    ┌──────────────────────────────────────────────────────┐
    │             C# Core (.NET 9/10)                      │
    │                                                      │
    │  AppApi · WebApi · SQLite · LogWatcher · Discord      │
    │  VRCXStorage · AssetBundleManager · ProcessMonitor    │
    │  ImageCache · Update · AutoAppLaunchManager · IPC    │
    │  ScreenshotHelper · Overlay/VR                        │
    └──────────────────────────────────────────────────────┘
```

---

## Bridge Layer Detail

桥接层是前端开发最关键的参考点。它决定了前端 JS 如何调用后端 C# 方法。

### Windows: CefSharp JS Bindings (同步/异步直接绑定)

```
Frontend JS                    CefSharp                        C# Object
─────────────────────────────────────────────────────────────────────────
AppApi.OpenLink(url)  ──►  CefSharp Proxy  ──►  AppApiCef.OpenLink(url)
WebApi.Execute(...)   ──►  CefSharp Proxy  ──►  WebApi.Execute(...)
```

**注册过程：**
1. `JavascriptBindings.cs` → 将 C# 单例注册到 CefSharp 的 JS 对象仓库
2. 前端通过 `CefSharp.BindObjectAsync(...)` 绑定对象到 `window` 上
3. 调用直接映射到 C# 方法，类型自动转换

```csharp
// JavascriptBindings.cs - 一次性注册所有后端服务
repository.Register("AppApi", Program.AppApiInstance);
repository.Register("WebApi", WebApi.Instance);
repository.Register("VRCXStorage", VRCXStorage.Instance);
repository.Register("SQLite", SQLite.Instance);
repository.Register("LogWatcher", LogWatcher.Instance);
repository.Register("Discord", Discord.Instance);
repository.Register("AssetBundleManager", AssetBundleManager.Instance);
```

### Linux/macOS: node-api-dotnet + Electron IPC (异步桥接)

```
Frontend JS          Preload.js          main.js (Node)        C# Object
────────────────────────────────────────────────────────────────────────────
InteropApi            ipcRenderer         ipcMain.handle        InteropApi.js
  .AppApi             .invoke(            ('callDotNetMethod',   .callMethod(
  .OpenLink(url)       'callDotNetMethod',  (_, cls, method,      className,
                        'AppApiElectron',     args) => {           methodName,
                        'OpenLink',            interopApi          args)
                        [url])                  .callMethod(...)  )
                                            })
                                                    │
                                                    ▼
                                            node-api-dotnet
                                              (C# .NET ↔ Node.js 互操作)
                                                    │
                                                    ▼
                                            AppApiElectron.OpenLink(url)
```

**关键文件链路：**
1. `src/ipc-electron/interopApi.js` → Proxy 代理，自动将 `InteropApi.ClassName.MethodName(...)` 转换为 IPC 调用
2. `src-electron/preload.js` → `contextBridge.exposeInMainWorld('interopApi', { callDotNetMethod })` 暴露 IPC 通道
3. `src-electron/main.js` → `ipcMain.handle('callDotNetMethod', ...)` 路由到 `InteropApi.callMethod`
4. `src-electron/InteropApi.js` → 使用 `node-api-dotnet` 直接实例化 C# 类并调用方法

**前端统一入口：** `src/plugins/interopApi.js`

```javascript
// 平台判断逻辑
if (WINDOWS) {
    // CefSharp 直接绑定 → window.AppApi 已自动可用
    await CefSharp.BindObjectAsync('AppApi', 'WebApi', ...);
} else {
    // Electron → 通过 InteropApi proxy 映射到 window
    window.AppApi = InteropApi.AppApiElectron;
    window.WebApi = InteropApi.WebApi;
    // ...
}
```

---

## C# Module Map

### Core Services (跨平台共享)

所有核心服务都以**单例模式**运行（`static Instance`），通过静态构造函数初始化。

| Module | File | Lines | Description | Frontend Global |
|--------|------|-------|-------------|----------------|
| `WebApi` | `WebApi.cs` | ~526 | HTTP 客户端，VRChat API 调用、Cookie 管理、代理设置、图片上传 | `window.WebApi` |
| `SQLite` | `SQLite.cs` | ~113 | 数据库操作，SQL 执行/查询，`ReaderWriterLockSlim` 线程安全 | `window.SQLite` |
| `VRCXStorage` | `VRCXStorage.cs` | ~81 | JSON KV 存储 (`VRCX.json`)，防抖保存机制 | `window.VRCXStorage` |
| `LogWatcher` | `LogWatcher.cs` | **1442** | VRChat 日志文件监控，实时解析 40+ 种事件类型 | `window.LogWatcher` |
| `Discord` | `Discord.cs` | ~243 | Discord Rich Presence 集成，活动状态更新 | `window.Discord` |
| `AssetBundleManager` | `AssetBundleManager.cs` | ~245 | VRChat 缓存管理（检查/删除/清理/扫描） | `window.AssetBundleManager` |
| `ImageCache` | `ImageCache.cs` | ~128 | 图片缓存，白名单域名控制，缓存大小管理 | 内部使用 |
| `ProcessMonitor` | `ProcessMonitor.cs` | ~216 | VRChat 进程监控（启动/退出事件触发） | 内部使用 |
| `AutoAppLaunchManager` | `AutoAppLaunchManager.cs` | ~592 | VRChat 启动/退出时自动启动/关闭用户程序，快捷方式解析 | 通过 AppApi 调用 |
| `Update` | `Update.cs` | ~271 | 自动更新下载/安装/进度检查 | 通过 AppApi 调用 |
| `StartupArgs` | `StartupArgs.cs` | ~186 | 启动参数解析、重复实例检测、IPC 单实例管理 | 内部使用 |
| `JsonFileSerializer` | `JsonFileSerializer.cs` | ~51 | JSON 文件序列化/反序列化，通用工具类 | 内部使用 |

### IPC 模块

| Module | File | Description |
|--------|------|-------------|
| `IPCServer` | `IPC/IPCServer.cs` | Named Pipe 服务端，多实例协调，管理 `IPCClient` 连接 |
| `IPCClient` | `IPC/IPCClient.cs` | Named Pipe 客户端，处理单个连接的数据收发 |
| `IPCPacket` | `IPC/IPCPacket.cs` | IPC 数据包定义 |
| `VRCIPC` | `IPC/VRCIPC.cs` | 通过 Named Pipe (`VRChatURLLaunchPipe`) 向 VRChat 发送启动命令 |

### ScreenshotMetadata 模块

| Module | File | Description |
|--------|------|-------------|
| `PNGFile` | `PNGFile.cs` | PNG 文件结构解析 |
| `PNGChunk` | `PNGChunk.cs` | PNG chunk 数据块处理 |
| `PNGChunkTypeFilter` | `PNGChunkTypeFilter.cs` | PNG chunk 类型过滤 |
| `PNGHelper` | `PNGHelper.cs` | PNG 操作辅助工具 |
| `ScreenshotHelper` | `ScreenshotHelper.cs` | 截图元数据写入和处理 |
| `ScreenshotMetadata` | `ScreenshotMetadata.cs` | 截图元数据模型定义 |
| `ScreenshotMetadataDatabase` | `ScreenshotMetadataDatabase.cs` | 截图元数据数据库操作 |

### AppApi (平台分层抽象)

`AppApi` 是前端使用最频繁的后端接口，采用 **C# partial class + 抽象类** 实现平台分层：

```
AppApi (abstract partial class)
├── AppApiCommonBase.cs       ← 抽象方法声明 (~30 个 abstract methods)
├── AppApiCommon.cs            ← 跨平台通用实现 (OpenLink, GetVersion, CustomCss, ...)
├── Common/ImageSaving.cs      ← 图片保存通用逻辑（贴纸/表情/打印图）
├── Common/LocalPlayerModerations.cs  ← VRChat 本地管理操作
├── Common/OVRToolkit.cs       ← OVR Toolkit 集成（发送通知）
├── Common/Screenshot.cs       ← 截图元数据添加通用逻辑
├── Common/Update.cs           ← 更新通用逻辑
├── Common/Utils.cs            ← 工具方法（MD5、文件长度等）
├── Common/VrcConfigFile.cs    ← VRChat 配置文件读写
├── Common/XSOverlay.cs        ← XSOverlay 通知集成
│
├── Cef/ (Windows only)
│   ├── AppApiCef.cs           ← Windows 实现 (继承 AppApi)
│   ├── Folders.cs             ← Windows 特有路径 (AppData, Photos, Cache)
│   ├── GameHandler.cs         ← Windows 游戏进程管理 (启动/退出/SteamVR检测)
│   ├── ImageUploading.cs      ← Windows 图片上传 (签名、裁剪)
│   ├── RegistryPlayerPrefs.cs ← Windows 注册表读写 (VRChat 设置)
│   └── Screenshot.cs          ← Windows 截图处理
│
└── Electron/ (Linux/macOS only)
    ├── AppApiElectron.cs      ← Linux 实现 (继承 AppApi, 多个空实现)
    ├── Folders.cs             ← Linux 路径 (XDG 标准)
    ├── GameHandler.cs         ← Linux 游戏进程管理 (ps/kill)
    ├── RegistryPlayerPrefs.cs ← Wine/Proton 注册表模拟 (读取 .reg 文件)
    └── Screenshot.cs          ← Linux 截图处理
```

**抽象接口 (AppApiCommonBase.cs) — 前端可直接调用的 API 分类：**

```
// ── UI 控制 ──
ShowDevTools()
SetVR(active, hmdOverlay, wristOverlay, menuButton, overlayHand)
SetZoom(zoomLevel) / GetZoom()
DesktopNotification(boldText, text, image)
SetTrayIconNotification(notify)
FocusWindow() / FlashWindow()
ChangeTheme(value)
RestartApplication(isUpgrade)

// ── 文件系统 ──
GetVRChatAppDataLocation() / GetVRChatPhotosLocation()
GetVRChatScreenshotsLocation() / GetVRChatCacheLocation()
OpenVrcxAppDataFolder() / OpenVrcAppDataFolder()
OpenFolderSelectorDialog() / OpenFileSelectorDialog()

// ── 游戏控制 ──
CheckGameRunning() / IsGameRunning() / IsSteamVRRunning()
QuitGame() / StartGame(arguments)

// ── VRChat Registry ──
GetVRChatRegistryKey(key) / SetVRChatRegistryKey(key, value, type)
GetVRChatRegistry() / SetVRChatRegistry(json)

// ── 截图 ──
AddScreenshotMetadata(path, metadata, worldId, changeFilename)

// ── 文件操作 ──
MD5File(base64Data) / FileLength(base64Data)
SignFile(base64Data) / ResizeImageToFitLimits(base64Data)
SaveStickerToFile(...) / SavePrintToFile(...) / SaveEmojiToFile(...)
CropPrintImage(filePath)
```

---

## VR Overlay System (Deep Dive)

VR Overlay 是 VRCX 中最复杂的子系统，两个平台的实现架构**完全不同**。

### 公共接口

```csharp
// VRCXVRInterface.cs - 两个平台的 VR 实现都继承此抽象类
public abstract class VRCXVRInterface
{
    public bool IsHmdAfk;
    public abstract void Init();
    public abstract void Exit();
    public abstract void Refresh();
    public abstract void Restart();
    public abstract void SetActive(active, hmdOverlay, wristOverlay, menuButton, overlayHand);
    public abstract bool IsActive();
    public abstract string[][] GetDevices();
    public abstract void ExecuteVrOverlayFunction(function, json);
    public abstract ConcurrentQueue<KeyValuePair<string, string>> GetExecuteVrOverlayFunctionQueue();
}
```

```csharp
// AppApiVrCommon.cs - VR Overlay 前端 API 接口
public abstract partial class AppApiVr
{
    public abstract void Init();
    public abstract void VrInit();
    public abstract void ToggleSystemMonitor(bool enabled);
    public abstract float CpuUsage();
    public abstract string[][] GetVRDevices();
    public abstract double GetUptime();
    public abstract string CurrentCulture();
    public abstract string CustomVrScript();
    public abstract List<KeyValuePair<string, string>> GetExecuteVrOverlayFunctionQueue();
}
```

### Windows Overlay Architecture (多进程 + WebSocket)

Windows 上 VR Overlay 运行为一个**独立子进程**，通过 WebSocket 与主进程通信：

```
┌─────────────────────────────────────────────┐
│              Main Process (VRCX.exe)         │
│                                             │
│  MainForm.cs (WinForms + CefSharp)          │
│       │                                     │
│       ▼                                     │
│  AppApiCef.SetVR(...)                       │
│       │                                     │
│       ▼                                     │
│  OverlayServer.UpdateVars(...)              │
│       │                                     │
│       ▼                                     │
│  OverlayManager.StartOverlay()              │
│       │                                     │
│       ▼  (启动子进程: VRCX.exe --overlay)     │
│  OverlayServer (WebSocket ws://127.0.0.1:34582/)│
│       │  ↕ OverlayMessage (JSON)            │
└───────┼─────────────────────────────────────┘
        │ WebSocket
        ▼
┌─────────────────────────────────────────────┐
│           Overlay Process (VRCX.exe --overlay) │
│                                             │
│  OverlayProgram.OverlayMain()               │
│       │                                     │
│       ├── CefService.Init()  // 独立CEF实例   │
│       │                                     │
│       ├── OverlayClient.Init()              │
│       │     (连接 ws://127.0.0.1:34582)       │
│       │     接收 UpdateVars / JsFunctionCall  │
│       │                                     │
│       ├── VRCXVRCef (VR 渲染引擎)            │
│       │     ├── D3D11 Device                 │
│       │     ├── OpenVR (SteamVR)             │
│       │     ├── 两种渲染模式:                  │
│       │     │   ├── New: SharedTexture (GPU→GPU)│
│       │     │   └── Legacy: CPU CopyMemory    │
│       │     ├── HMD Overlay (1024×1024)      │
│       │     └── Wrist Overlay (512×512)      │
│       │                                     │
│       ├── OffScreenBrowser (CefSharp offscreen)│
│       │     ├── 渲染 vr.html (VR UI)         │
│       │     ├── IRenderHandler 实现           │
│       │     ├── OnAcceleratedPaint (new mode) │
│       │     └── OnPaint (legacy mode)        │
│       │                                     │
│       └── AppApiVrCef (VR 前端 API)          │
│             ├── SystemMonitorCef             │
│             │   (PerformanceCounter CPU/Uptime)│
│             └── GetVRDevices() / CpuUsage()  │
│                                             │
│  退出条件: QuitProcess() 循环检测连接+活跃状态,  │
│  5秒无连接或非活跃则退出                       │
└─────────────────────────────────────────────┘
```

**OverlayMessage 协议：**
```csharp
public enum OverlayMessageType {
    OverlayConnected,   // Overlay 子进程连接成功
    JsFunctionCall,     // 主进程让 Overlay 执行 JS 函数
    UpdateVars,         // 更新 Overlay 状态 (Active, HMD, Wrist, ...)
    IsHmdAfk            // HMD AFK 状态反馈给主进程
}

public class OverlayVars {
    Active, HmdOverlay, WristOverlay, MenuButton, OverlayHand
}
```

**OffScreenBrowser 双模式渲染：**
- **New Mode** (`SharedTextureEnabled=true`): CEF 使用 GPU 共享纹理 → `OnAcceleratedPaint` 直接 `CopyResource` 到 D3D11 纹理 → 提交给 OpenVR。60 FPS。
- **Legacy Mode** (`isLegacy=true`): CEF 使用 CPU 软件渲染 → `OnPaint` 拷贝像素到 pinned buffer → `RenderToTexture` 映射到 D3D11 纹理。24 FPS。
- 用户可通过设置 `VRCX_DisableVrOverlayGpuAcceleration=true` 切换到 Legacy 模式。

### Linux Overlay Architecture (共享内存 + Electron Offscreen)

Linux 上 VR Overlay 运行在**同一进程**内，使用 Electron offscreen rendering + 共享内存：

```
┌──────────────────────────────────────────────────────┐
│                  Electron Process (main.js)            │
│                                                      │
│  main.js                                             │
│       │                                              │
│       ├── createOverlayWindowOffscreen()              │
│       │     ├── BrowserWindow (offscreen: true)       │
│       │     │   ├── 渲染 vr.html                      │
│       │     │   └── paint event → image.toBitmap()    │
│       │     │                                        │
│       │     └── writeOverlayFrame(buffer)             │
│       │           └── 写入 /dev/shm/vrcx_overlay      │
│       │               (OVERLAY_FRAME_SIZE + 1 字节)    │
│       │               byte[0] = ready flag            │
│       │               byte[1..] = BGRA pixel data     │
│       │                                              │
│       └── .NET (node-api-dotnet, 同进程)               │
│             │                                        │
│             ├── VRCXVRElectron                         │
│             │     ├── OpenVR (SteamVR)                │
│             │     ├── 需要 OpenGL 上下文:               │
│             │     │   ├── GLContextWayland (EGL)      │
│             │     │   └── GLContextX11 (GLX)          │
│             │     ├── GLTextureWriter                 │
│             │     │   (glTexSubImage2D → OpenGL 纹理)  │
│             │     ├── GetLatestOverlayFrame()          │
│             │     │   └── 从 /dev/shm 读取帧数据        │
│             │     ├── FlipImageVertically()            │
│             │     │   └── OpenVR 需要垂直翻转            │
│             │     ├── HMD Overlay (1024×1024)          │
│             │     └── Wrist Overlay (512×512)          │
│             │                                        │
│             ├── AppApiVrElectron (VR 前端 API)          │
│             │     ├── SystemMonitorElectron            │
│             │     │   (/proc/stat CPU + /proc/uptime)  │
│             │     └── GetExecuteVrOverlayFunctionQueue()│
│             │         (ConcurrentQueue 从主线程消费)      │
│             │                                        │
│             └── ExecuteVrOverlayFunction 通过           │
│                 ConcurrentQueue 桥接主线程与VR线程       │
│                                                      │
│ 帧尺寸:                                               │
│   Wrist: 512×512, HMD: 1024×1024                     │
│   Combined: 1024×1536 (max_w × (h1+h2))              │
│   Frame size: 1024×1536×4 = 6,291,456 bytes           │
└──────────────────────────────────────────────────────┘
```

**Linux 渲染管线详解：**
1. Electron `BrowserWindow` 使用 `offscreen: true` 模式，接收 `paint` 回调
2. 每一帧转为 `Bitmap` → 写入共享内存 `/dev/shm/vrcx_overlay`
3. C# 侧 `VRCXVRElectron.GetLatestOverlayFrame()` 读取共享内存
4. 图像垂直翻转（OpenVR 渲染坐标系与屏幕坐标系 Y 轴相反）
5. 写入 `GLTextureWriter`（OpenGL 纹理）
6. 提交给 OpenVR 作为 `Texture_t` (ETextureType.OpenGL)

**Linux VR 需要 OpenGL 上下文：**
- 自动检测显示服务器类型
- Wayland → `GLContextWayland.cs`：使用 EGL (libEGL.so.1) 创建 pbuffer surface
- X11 → `GLContextX11.cs`：使用 GLX (libGL.so.1) 创建隐藏窗口 + GL context

### Overlay Feature Comparison

| Feature | Windows | Linux |
|---------|---------|-------|
| 进程模型 | 独立子进程 | 同进程 |
| 通信机制 | WebSocket (`ws://127.0.0.1:34582`) | 共享内存 (`/dev/shm/vrcx_overlay`) |
| 渲染 API | Direct3D 11 (Silk.NET) | OpenGL (P/Invoke) |
| 帧捕获 | CefSharp OffScreen (SharedTexture/OnPaint) | Electron offscreen `paint` event |
| GPU 加速渲染 | ✅ (SharedTexture D3D11) | ❌ (CPU pipeline only) |
| Legacy 渲染 | ✅ (CPU RtlCopyMemory) | ❌ |
| 系统监控 | PerformanceCounter | /proc/stat + /proc/uptime |
| 帧率 | 60 FPS (new) / 24 FPS (legacy) | 48 FPS |
| 自动退出 | 5s 无连接/非活跃自动退出 | 由 main.js `disposeOverlay()` 控制 |
| HMD AFK 检测 | WebSocket 反馈主进程 | 轮询 OpenVR |

---

## CEF 宿主细节 (Windows only)

### CefService.cs — Chromium 初始化

- 配置 CEF 设置：缓存路径、日志、UserAgent、代理
- 注册 `file://vrcx/` 自定义 scheme（映射到 `html/` 目录）
- 处理 CEF 版本降级检测（降级时自动删除 userdata 防止崩溃）
- Debug 模式下启用远程调试端口 (8089/8090) 和 Vue Devtools 扩展加载

### MainForm.cs — 窗口管理

- WinForms 主窗口，承载 CefSharp `ChromiumWebBrowser`
- 管理托盘图标、窗口状态保存/恢复
- 处理 `DpiChanged` 事件
- 用 `WinformThemer` 设置 Windows 暗色/浅色/Midnight 主题（通过 DWM API `DWMWA_USE_IMMERSIVE_DARK_MODE`）

### CEF Handler 类

| Handler | Purpose |
|---------|---------|
| `CustomRequestHandler` | 阻止非法导航（只允许 `file://vrcx/` 和 debug 模式的 URL），处理渲染进程崩溃重载 |
| `CustomDownloadHandler` | 文件下载弹窗 |
| `CustomDragHandler` | 拖拽处理 |
| `CustomMenuHandler` | 右键菜单 |
| `NoopDragHandler` | 禁用拖拽（VR Overlay 用） |
| `WinformBase` | WinForms 窗口基类 |
| `Wine` | 检测 Wine 环境 (`wine_get_version` P/Invoke) |
| `WinformThemer` | Windows 窗口主题切换（暗色/亮色/Midnight），窗口闪烁 |
| `SubProcess` | CefSharp 子进程启动器（GPU/渲染器/工具进程） |

### Program.cs — 入口点

Windows 和 Linux 共享同一个 `Program.cs`，通过 `#if` 区分：

```csharp
public static void Main(string[] args)
{
    BrowserSubprocess.Start();  // CEF 子进程识别

    #if !LINUX
    // Windows: ArgsCheck → 重复实例检测 → Run() → MainForm
    StartupArgs.ArgsCheck(args);
    Run();
    #else
    // Linux: 由 Electron main.js 调用 ProgramElectron.PreInit/Init
    #endif
}
```

---

## Initialization Sequence

### Windows
```
Program.Main()
  → BrowserSubprocess.Start()       // CEF 子进程路由
  → StartupArgs.ArgsCheck()          // 参数解析、重复实例检测
  → Program.SetProgramDirectories()  // 设置 AppData 路径
  → WebApi.SetProxy()                // 代理配置
  → CefService.Init()                // 初始化 Chromium
  → MainForm.Load()                  // 创建窗口
    → JavascriptBindings             // 注册 JS 绑定
    → Program.Init()                 // 启动所有服务
      → VRCXStorage.Load()
      → SQLite.Init()
      → LogWatcher.Init()
      → Discord.Init()
      → IPCServer.Init()
      → AutoAppLaunchManager.Init()
      → ProcessMonitor.Init()
  → [当 SetVR 被调用]
    → OverlayServer.UpdateVars()     // 启动 WebSocket 服务
    → OverlayManager.StartOverlay()  // 启动子进程 (VRCX.exe --overlay)
      → OverlayProgram.OverlayMain() (子进程)
        → CefService.Init()          // 独立 CEF 实例
        → OffScreenBrowser()         // 离屏渲染 vr.html
        → VRCXVRCef.Init()           // OpenVR 初始化
        → OverlayClient.Init()       // WebSocket 连接主进程
```

### Linux/macOS
```
main.js (Electron)
  → isDotNetInstalled()              // 检测 .NET 9 运行时
  → require('node-api-dotnet')       // 加载 C# 程序集
  → require('./InteropApi')          // 初始化互操作层
  → ProgramElectron.PreInit()        // 设置目录和版本
  → VRCXStorage.Load()
  → ProgramElectron.Init()           // 配置日志
  → SQLite.Init()
  → AppApiElectron.Init()
  → Discord.Init()
  → WebApi.Init()
  → LogWatcher.Init()
  → SystemMonitorElectron.Init()
  → AppApiVrElectron.Init()
  → createWindow()                   // 创建 Electron BrowserWindow
  → createTray()
  → installVRCX()                    // AppImage 安装流程
  → [当 app:updateVr 被触发]
    → createOverlayWindowOffscreen() // Electron offscreen BrowserWindow
    → VRCXVRElectron.SetActive()     // OpenVR 初始化 + GL 上下文
```

---

## Conditional Compilation

C# 代码使用预处理指令 `#if LINUX` / `#if !LINUX` 切换平台特有代码：

```csharp
// VRCX-Electron.csproj 定义了:
// <DefineConstants>LINUX</DefineConstants>

#if !LINUX
using CefSharp;         // Windows only
using System.Windows.Forms;
#endif
```

---

## Frontend-Facing API Summary

前端直接使用的所有全局对象及其来源：

```
window.AppApi         → AppApiCef (Win) / AppApiElectron (Linux/Mac)
window.WebApi         → WebApi (共享)
window.VRCXStorage    → VRCXStorage (共享)
window.SQLite         → SQLite (共享)
window.LogWatcher     → LogWatcher (共享)
window.Discord        → Discord (共享)
window.AssetBundleManager → AssetBundleManager (共享)
window.AppApiVr       → AppApiVrCef (Win, VR overlay only)
window.AppApiVrElectron → AppApiVrElectron (Linux/Mac)
```

### Electron 特有的 API（非 C# 桥接）

有些能力不经过 C# 后端，而是直接由 Electron 的 `preload.js` 提供：

```javascript
window.electron.getArch()
window.electron.getClipboardText()
window.electron.openFileDialog()
window.electron.openDirectoryDialog()
window.electron.desktopNotification(title, body, icon)
window.electron.restartApp()
window.electron.updateVr(...)
window.electron.setTrayIconNotification(notify)
```

### Frontend Calling Conventions

- **所有调用都是异步的**（即使 CefSharp 在 Windows 上看起来像同步，实际也是跨进程通信）
- 方法名保持 C# 的 PascalCase (e.g., `AppApi.GetVersion()`)
- 返回值类型自动序列化：C# object → JSON → JS object
- 数组返回为 `object[][]`（SQLite 结果集）

---

## 前端开发参考建议

### 1. 平台判断

前端代码中使用构建时常量 `WINDOWS` 判断平台：

```javascript
if (WINDOWS) {
    // Windows-only 功能
} else {
    // Linux/macOS 通过 Electron
}
```

::: warning 关键提醒
AppApi 的很多方法在 Electron 端是**空实现**（no-op）。例如：
- `ShowDevTools()` → 空
- `SetZoom()` → 空（zoom 由 Electron 自己管理）
- `DesktopNotification()` → 空（Electron 通过 `preload.js` 自己处理）
- `ChangeTheme()` → 空
- `SetStartup()` → 空
- `FlashWindow()` → 空
- `FocusWindow()` → 空
- `SetUserAgent()` → 空
- `SetTrayIconNotification()` → 空
- `OpenCalendarFile()` → 空
- `DoFunny()` → 空
- `RestartApplication()` → 空

前端调用这些方法时不会报错，但也不会有效果。对于需要跨平台生效的功能，需要在前端做 fallback（通过 `preload.js` 暴露的 Electron API）。
:::

### 2. 安全地调用后端 API

```javascript
// ✅ 正确 - 始终 await
const version = await AppApi.GetVersion();

// ✅ 正确 - 在 Electron 上 VRCXStorage 也是异步的
const value = await VRCXStorage.Get('VRCX_SomeKey');

// ⚠️ 注意 - SQLite.Execute 在 Electron 上返回 JSON 字符串
// Windows 上返回 object[][]
// 已有 ExecuteJson 方法用于 Electron 兼容
```

### 3. 添加新功能时的后端约束

如果你需要新的后端 API：
1. **在 `AppApiCommonBase.cs` 声明抽象方法**
2. **在 `AppApiCommon.cs` 实现通用逻辑**（如果有的话）
3. **在 `AppApiCef.cs` 和 `AppApiElectron.cs` 分别实现平台特有逻辑**
4. Windows 端 CefSharp 会自动暴露新方法
5. Linux 端 `node-api-dotnet` 也会自动暴露（因为它反射整个类）

### 4. VR Overlay 前端约束

VR Overlay 的前端页面 (`vr.html`) 有特殊约束：
- 它通过 **`AppApiVr`** 而非 `AppApi` 和后端通信
- Windows 上它运行在**独立子进程**中，与主窗口完全隔离
- 主窗口到 Overlay 的通信通过 `AppApi.ExecuteVrOverlayFunction(functionName, json)` — 这实际上通过 WebSocket (Win) 或 ConcurrentQueue (Linux) 传递 JS 函数调用
- Overlay 到主窗口的反馈非常有限（基本只有 `IsHmdAfk` 状态）

---

## Architecture Issues & Weaknesses

### 1. 单例模式的全局状态问题

所有 C# 服务类都使用 `static Instance` 单例，通过静态构造函数初始化。这意味着：
- 服务之间没有明确的依赖注入
- 初始化顺序隐式依赖（例如 `SQLite.Init()` 依赖 `VRCXStorage` 已加载）
- 无法 mock 单个服务进行测试

### 2. 桥接层不统一

Windows 和 Linux/macOS 的桥接机制完全不同：
- **Windows** (`CefSharp`): 同步/异步调用都支持，类型转换自动处理，性能好
- **Linux/macOS** (`node-api-dotnet`): 所有调用都是异步的（IPC），**额外有 JSON 序列化开销**，调用链长（JS → preload → main → InteropApi → .NET）

这导致：
- 前端不能假设调用是同步的
- 某些需要高频调用的场景（例如 LogWatcher.Get）可能在 Electron 上有性能瓶颈
- 错误处理不一致——CefSharp 的异常直接传递，Electron 的异常需要跨 IPC 序列化

### 3. `AppApiElectron` 大量空实现

`AppApiElectron` 中约 **12+ 个方法** 是空实现，这意味着：
- 前端无法依赖后端来完成这些功能
- 功能差异没有在 API 层面体现出来（不抛异常，只是静默忽略）
- 前端需要自己通过 `WINDOWS` 常量做 feature gating

### 4. VR Overlay 双套实现增加维护负担

两个平台的 VR Overlay 使用完全不同的架构（多进程 WebSocket vs 单进程共享内存），渲染 API 也不同（D3D11 vs OpenGL），这意味着：
- 两套 800+ 行的 VR 实现 (`VRCXVRCef.cs` / `VRCXVRElectron.cs`)
- 更改 VR 功能需要在两个地方修改
- Linux 通过共享内存传帧有性能上限（~48 FPS，且没有 GPU 加速路径）

### 5. LogWatcher 是单体巨类

`LogWatcher.cs` 有 **1442 行**，解析 **40+ 种 VRChat 日志事件**。所有解析逻辑都在一个类里，增加了理解和维护的难度。但对前端来说接口很简单——只是调用 `LogWatcher.Get()` 获取最新的解析结果。

### 6. 条件编译导致代码阅读困难

`#if LINUX` / `#if !LINUX` 散布在多个共享文件中（如 `Program.cs`, `WebApi.cs`, `SQLite.cs`）。阅读代码时需要心智切换去判断当前看的是哪个平台的逻辑。

### 7. 错误边界不清晰

后端异常的处理方式因平台而异：
- CefSharp: 异常直接传递给 JS 的 Promise rejection
- Electron: 异常在 `InteropApi.callMethod` 中被 catch/re-throw，经过 IPC 序列化后丢失 stack trace

前端的 `try/catch` 能捕获错误，但错误信息质量在两个平台上不一致。

### 8. Windows Overlay 子进程有崩溃风险

Overlay 子进程 (`SubProcess.cs`) 在 CEF 渲染进程崩溃时会无限重试 (`while(true)`)，且 `OverlayProgram.QuitProcess()` 使用异步轮询检测连接状态，如果 WebSocket 连接异常断开可能导致进程无法及时退出。

---

## Complete File Tree

```
Dotnet/
├── Program.cs                    # 入口点 + ProgramElectron (307 lines)
├── WebApi.cs                     # HTTP 客户端 (526 lines)
├── SQLite.cs                     # 数据库操作 (113 lines)
├── VRCXStorage.cs                # JSON KV 存储 (81 lines)
├── LogWatcher.cs                 # 日志监控 (1442 lines)
├── Discord.cs                    # Discord Rich Presence (243 lines)
├── ImageCache.cs                 # 图片缓存 (128 lines)
├── ProcessMonitor.cs             # 进程监控 (216 lines)
├── AutoAppLaunchManager.cs       # 自动启动管理 (592 lines)
├── AssetBundleManager.cs         # 缓存管理 (245 lines)
├── Update.cs                     # 自动更新 (271 lines)
├── WinApi.cs                     # Windows API P/Invoke (104 lines)
├── StartupArgs.cs                # 启动参数解析 (186 lines)
├── JsonFileSerializer.cs         # JSON 文件序列化 (51 lines)
│
├── AppApi/
│   ├── Common/
│   │   ├── AppApiCommonBase.cs   # 抽象方法声明 (abstract partial class)
│   │   ├── AppApiCommon.cs       # 跨平台通用实现
│   │   ├── ImageSaving.cs        # 图片保存
│   │   ├── LocalPlayerModerations.cs  # 本地管理
│   │   ├── OVRToolkit.cs         # OVR Toolkit 通知集成
│   │   ├── Screenshot.cs         # 截图通用
│   │   ├── Update.cs             # 更新通用
│   │   ├── Utils.cs              # 工具 (MD5, FileLength, SignFile, ...)
│   │   ├── VrcConfigFile.cs      # VRC 配置文件读写
│   │   └── XSOverlay.cs          # XSOverlay 通知集成
│   ├── Cef/                      # Windows only
│   │   ├── AppApiCef.cs          # Windows AppApi 实现 (242 lines)
│   │   ├── Folders.cs            # Windows 文件路径
│   │   ├── GameHandler.cs        # Windows 游戏管理
│   │   ├── ImageUploading.cs     # Windows 图片上传签名/裁剪
│   │   ├── RegistryPlayerPrefs.cs # Windows 注册表
│   │   └── Screenshot.cs         # Windows 截图
│   └── Electron/                 # Linux/macOS only
│       ├── AppApiElectron.cs     # Linux AppApi 实现 (140 lines, 多空实现)
│       ├── Folders.cs            # Linux 路径 (XDG)
│       ├── GameHandler.cs        # Linux 游戏管理
│       ├── RegistryPlayerPrefs.cs # Wine/Proton 注册表模拟
│       └── Screenshot.cs         # Linux 截图
│
├── Cef/                          # Windows only
│   ├── CefService.cs             # CEF 初始化配置 (187 lines)
│   ├── JavascriptBindings.cs     # JS 全局对象注册 (20 lines)
│   ├── MainForm.cs               # WinForms 主窗口 (257 lines)
│   ├── MainForm.Designer.cs      # WinForms 设计器自动生成
│   ├── SubProcess.cs             # CEF 子进程启动器 (69 lines)
│   ├── CefCustomRequestHandler.cs  # URL 导航拦截 + 崩溃恢复
│   ├── CefCustomDownloadHandler.cs # 文件下载弹窗
│   ├── CefCustomDragHandler.cs   # 拖拽处理
│   ├── CefCustomMenuHandler.cs   # 右键菜单
│   ├── CefNoopDragHandler.cs     # 禁用拖拽 (VR Overlay 用)
│   ├── WinformBase.cs            # WinForms 窗口基类
│   ├── WinformThemer.cs          # Windows 主题切换 (DWM API, 209 lines)
│   └── Wine.cs                   # Wine 环境检测 (23 lines)
│
├── IPC/
│   ├── IPCServer.cs              # Named Pipe 服务端 (67 lines)
│   ├── IPCClient.cs              # Named Pipe 客户端
│   ├── IPCPacket.cs              # IPC 数据包
│   └── VRCIPC.cs                 # VRChat URL Launch Pipe (43 lines)
│
├── Overlay/
│   ├── VRCXVRInterface.cs        # VR 接口抽象 (18 lines)
│   ├── AppApiVrCommon.cs         # VR API 公共接口 (17 lines)
│   │
│   ├── Cef/                      # Windows VR
│   │   ├── VRCXVRCef.cs          # D3D11 + OpenVR (~848 lines)
│   │   ├── AppApiVrCef.cs        # Windows VR API (87 lines)
│   │   ├── OffScreenBrowser.cs   # CEF 离屏渲染 (275 lines)
│   │   ├── OverlayClient.cs      # WebSocket 客户端 (123 lines)
│   │   ├── OverlayProgram.cs     # Overlay 子进程入口 (53 lines)
│   │   └── SystemMonitorCef.cs   # Windows PerformanceCounter (149 lines)
│   │
│   ├── Electron/                 # Linux VR
│   │   ├── VRCXVRElectron.cs     # SharedMem + OpenVR (~864 lines)
│   │   ├── AppApiVrElectron.cs   # Linux VR API (88 lines)
│   │   ├── GLContextWayland.cs   # EGL 上下文 (Wayland, 204 lines)
│   │   ├── GLContextX11.cs       # GLX 上下文 (X11, 170 lines)
│   │   ├── GLTextureWriter.cs    # OpenGL 纹理写入器 (106 lines)
│   │   └── SystemMonitorElectron.cs # /proc/stat CPU (208 lines)
│   │
│   └── OpenVR/
│       └── openvr_api.cs         # OpenVR C# 绑定 (364K)
│
├── OverlayWebSocket/             # Windows only
│   ├── OverlayServer.cs          # WebSocket 服务端 (212 lines)
│   ├── OverlayManager.cs         # Overlay 子进程管理 (53 lines)
│   ├── OverlayMessage.cs         # 消息模型 (17 lines)
│   ├── OverlayMessageType.cs     # 消息类型枚举 (9 lines)
│   └── OverlayVars.cs            # Overlay 状态变量 (10 lines)
│
├── ScreenshotMetadata/
│   ├── PNGFile.cs                # PNG 文件结构解析
│   ├── PNGChunk.cs               # PNG chunk 数据块
│   ├── PNGChunkTypeFilter.cs     # PNG chunk 类型过滤
│   ├── PNGHelper.cs              # PNG 操作辅助
│   ├── ScreenshotHelper.cs       # 截图处理
│   ├── ScreenshotMetadata.cs     # 截图元数据模型
│   └── ScreenshotMetadataDatabase.cs # 截图元数据 DB
│
└── DBMerger/                     # 独立工具
    ├── Program.cs                # 数据库合并入口
    ├── Merger.cs                 # 合并逻辑
    ├── Config.cs                 # 配置
    └── SqliteExtensions.cs       # SQLite 扩展方法

src-electron/                     # Electron 宿主 (Linux/macOS)
├── main.js                       # Electron 主进程 (927 lines)
├── preload.js                    # 安全上下文桥接
├── InteropApi.js                 # node-api-dotnet 包装
├── offscreen-preload.js          # VR Overlay offscreen preload
├── offscreen.html                # VR Overlay 页面容器
└── utils.js                      # 工具函数
```
