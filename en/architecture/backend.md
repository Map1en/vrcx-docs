# Backend Architecture Reference

> **This document is for reference only.** The frontend refactor does not need to modify backend code, but understanding the exposed APIs, platform-specific bridging mechanisms, and platform-limited features is essential.

## Platform Overview

VRCX's backend runs on three platforms, each using a different host with a shared C# core:

| Platform | Host | Browser Engine | C# Build Target | Bridge |
|----------|------|---------------|-----------------|--------|
| **Windows** | WinForms (`MainForm.cs`) | CefSharp (Chromium) | `VRCX-Cef.csproj` → WinExe, .NET 10 | CefSharp JS Bindings |
| **Linux** | Electron (`main.js`) | Electron (Chromium) | `VRCX-Electron.csproj` → Library (.cjs), .NET 9 | `node-api-dotnet` + IPC |
| **macOS** | Electron (`main.js`) | Electron (Chromium) | `VRCX-Electron-arm64.csproj` → Library, .NET 9 | `node-api-dotnet` + IPC |

### Build Configuration Differences

| | Windows (Cef) | Linux/macOS (Electron) |
|--|--------|-----|
| OutputType | `WinExe` (standalone executable) | `Library` (.cjs module, loaded by Electron) |
| TargetFramework | `net10.0-windows10.0.19041.0` | `net9.0` |
| Platforms | x64 only | x64 + ARM64 |
| DefineConstants | *(none)* | `LINUX` |
| Excluded Dirs | `AppApi/Electron/`, `Overlay/Electron/` | `Cef/`, `AppApi/Cef/`, `Overlay/Cef/`, `OverlayWebSocket/` |
| Platform-Specific Deps | CefSharp, Silk.NET (D3D11, DXGI), UWP Notifications | `Microsoft.JavaScript.NodeApi` |

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (Vue 3 SPA)                     │
│                   src/ directory (~450 components)            │
│                                                              │
│  window.AppApi / window.WebApi / window.SQLite / ...         │
│  (globals — direct references to backend C# classes)         │
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

The bridge layer is the most critical reference point for frontend development. It determines how frontend JS calls backend C# methods.

### Windows: CefSharp JS Bindings (Sync/Async Direct Binding)

```
Frontend JS                    CefSharp                        C# Object
─────────────────────────────────────────────────────────────────────────
AppApi.OpenLink(url)  ──►  CefSharp Proxy  ──►  AppApiCef.OpenLink(url)
WebApi.Execute(...)   ──►  CefSharp Proxy  ──►  WebApi.Execute(...)
```

**Registration process:**
1. `JavascriptBindings.cs` → Registers C# singletons into CefSharp's JS object repository
2. Frontend calls `CefSharp.BindObjectAsync(...)` to bind objects onto `window`
3. Calls map directly to C# methods with automatic type conversion

```csharp
// JavascriptBindings.cs - Registers all backend services at once
repository.Register("AppApi", Program.AppApiInstance);
repository.Register("WebApi", WebApi.Instance);
repository.Register("VRCXStorage", VRCXStorage.Instance);
repository.Register("SQLite", SQLite.Instance);
repository.Register("LogWatcher", LogWatcher.Instance);
repository.Register("Discord", Discord.Instance);
repository.Register("AssetBundleManager", AssetBundleManager.Instance);
```

### Linux/macOS: node-api-dotnet + Electron IPC (Async Bridge)

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
                                              (C# .NET ↔ Node.js interop)
                                                    │
                                                    ▼
                                            AppApiElectron.OpenLink(url)
```

**Key file chain:**
1. `src/ipc-electron/interopApi.js` → Proxy that auto-converts `InteropApi.ClassName.MethodName(...)` into IPC calls
2. `src-electron/preload.js` → `contextBridge.exposeInMainWorld('interopApi', { callDotNetMethod })` exposes the IPC channel
3. `src-electron/main.js` → `ipcMain.handle('callDotNetMethod', ...)` routes to `InteropApi.callMethod`
4. `src-electron/InteropApi.js` → Uses `node-api-dotnet` to directly instantiate C# classes and call methods

**Unified frontend entry:** `src/plugins/interopApi.js`

```javascript
// Platform detection logic
if (WINDOWS) {
    // CefSharp direct binding → window.AppApi is automatically available
    await CefSharp.BindObjectAsync('AppApi', 'WebApi', ...);
} else {
    // Electron → Map through InteropApi proxy to window
    window.AppApi = InteropApi.AppApiElectron;
    window.WebApi = InteropApi.WebApi;
    // ...
}
```

---

## C# Module Map

### Core Services (Cross-Platform Shared)

All core services run as **singletons** (`static Instance`), initialized via static constructors.

| Module | File | Lines | Description | Frontend Global |
|--------|------|-------|-------------|----------------|
| `WebApi` | `WebApi.cs` | ~526 | HTTP client, VRChat API calls, cookie management, proxy settings, image upload | `window.WebApi` |
| `SQLite` | `SQLite.cs` | ~113 | Database operations, SQL execute/query, `ReaderWriterLockSlim` thread safety | `window.SQLite` |
| `VRCXStorage` | `VRCXStorage.cs` | ~81 | JSON KV storage (`VRCX.json`), debounced save mechanism | `window.VRCXStorage` |
| `LogWatcher` | `LogWatcher.cs` | **1442** | VRChat log file monitoring, real-time parsing of 40+ event types | `window.LogWatcher` |
| `Discord` | `Discord.cs` | ~243 | Discord Rich Presence integration, activity status updates | `window.Discord` |
| `AssetBundleManager` | `AssetBundleManager.cs` | ~245 | VRChat cache management (check/delete/clean/scan) | `window.AssetBundleManager` |
| `ImageCache` | `ImageCache.cs` | ~128 | Image caching with domain whitelist, cache size management | Internal use |
| `ProcessMonitor` | `ProcessMonitor.cs` | ~216 | VRChat process monitoring (start/exit event triggers) | Internal use |
| `AutoAppLaunchManager` | `AutoAppLaunchManager.cs` | ~592 | Auto-launch/close user programs on VRChat start/exit, shortcut parsing | Via AppApi |
| `Update` | `Update.cs` | ~271 | Auto-update download/install/progress checking | Via AppApi |
| `StartupArgs` | `StartupArgs.cs` | ~186 | Startup argument parsing, duplicate instance detection, IPC single-instance management | Internal use |
| `JsonFileSerializer` | `JsonFileSerializer.cs` | ~51 | JSON file serialization/deserialization utility | Internal use |

### IPC Module

| Module | File | Description |
|--------|------|-------------|
| `IPCServer` | `IPC/IPCServer.cs` | Named Pipe server, multi-instance coordination, manages `IPCClient` connections |
| `IPCClient` | `IPC/IPCClient.cs` | Named Pipe client, handles single connection data send/receive |
| `IPCPacket` | `IPC/IPCPacket.cs` | IPC packet definition |
| `VRCIPC` | `IPC/VRCIPC.cs` | Sends launch commands to VRChat via Named Pipe (`VRChatURLLaunchPipe`) |

### ScreenshotMetadata Module

| Module | File | Description |
|--------|------|-------------|
| `PNGFile` | `PNGFile.cs` | PNG file structure parsing |
| `PNGChunk` | `PNGChunk.cs` | PNG chunk data block processing |
| `PNGChunkTypeFilter` | `PNGChunkTypeFilter.cs` | PNG chunk type filtering |
| `PNGHelper` | `PNGHelper.cs` | PNG operation helpers |
| `ScreenshotHelper` | `ScreenshotHelper.cs` | Screenshot metadata writing and processing |
| `ScreenshotMetadata` | `ScreenshotMetadata.cs` | Screenshot metadata model definition |
| `ScreenshotMetadataDatabase` | `ScreenshotMetadataDatabase.cs` | Screenshot metadata database operations |

### AppApi (Platform-Layered Abstraction)

`AppApi` is the most frequently used backend interface by the frontend, using **C# partial class + abstract class** for platform layering:

```
AppApi (abstract partial class)
├── AppApiCommonBase.cs       ← Abstract method declarations (~30 abstract methods)
├── AppApiCommon.cs            ← Cross-platform shared implementation (OpenLink, GetVersion, CustomCss, ...)
├── Common/ImageSaving.cs      ← Image saving logic (stickers/emojis/prints)
├── Common/LocalPlayerModerations.cs  ← VRChat local moderation operations
├── Common/OVRToolkit.cs       ← OVR Toolkit integration (send notifications)
├── Common/Screenshot.cs       ← Screenshot metadata common logic
├── Common/Update.cs           ← Update common logic
├── Common/Utils.cs            ← Utility methods (MD5, FileLength, etc.)
├── Common/VrcConfigFile.cs    ← VRChat config file read/write
├── Common/XSOverlay.cs        ← XSOverlay notification integration
│
├── Cef/ (Windows only)
│   ├── AppApiCef.cs           ← Windows implementation (extends AppApi)
│   ├── Folders.cs             ← Windows-specific paths (AppData, Photos, Cache)
│   ├── GameHandler.cs         ← Windows game process management (launch/exit/SteamVR detection)
│   ├── ImageUploading.cs      ← Windows image upload (signing, cropping)
│   ├── RegistryPlayerPrefs.cs ← Windows registry read/write (VRChat settings)
│   └── Screenshot.cs          ← Windows screenshot processing
│
└── Electron/ (Linux/macOS only)
    ├── AppApiElectron.cs      ← Linux implementation (extends AppApi, many no-ops)
    ├── Folders.cs             ← Linux paths (XDG standard)
    ├── GameHandler.cs         ← Linux game process management (ps/kill)
    ├── RegistryPlayerPrefs.cs ← Wine/Proton registry emulation (reads .reg files)
    └── Screenshot.cs          ← Linux screenshot processing
```

**Abstract interface (AppApiCommonBase.cs) — Frontend-callable API categories:**

```
// ── UI Control ──
ShowDevTools()
SetVR(active, hmdOverlay, wristOverlay, menuButton, overlayHand)
SetZoom(zoomLevel) / GetZoom()
DesktopNotification(boldText, text, image)
SetTrayIconNotification(notify)
FocusWindow() / FlashWindow()
ChangeTheme(value)
RestartApplication(isUpgrade)

// ── File System ──
GetVRChatAppDataLocation() / GetVRChatPhotosLocation()
GetVRChatScreenshotsLocation() / GetVRChatCacheLocation()
OpenVrcxAppDataFolder() / OpenVrcAppDataFolder()
OpenFolderSelectorDialog() / OpenFileSelectorDialog()

// ── Game Control ──
CheckGameRunning() / IsGameRunning() / IsSteamVRRunning()
QuitGame() / StartGame(arguments)

// ── VRChat Registry ──
GetVRChatRegistryKey(key) / SetVRChatRegistryKey(key, value, type)
GetVRChatRegistry() / SetVRChatRegistry(json)

// ── Screenshot ──
AddScreenshotMetadata(path, metadata, worldId, changeFilename)

// ── File Operations ──
MD5File(base64Data) / FileLength(base64Data)
SignFile(base64Data) / ResizeImageToFitLimits(base64Data)
SaveStickerToFile(...) / SavePrintToFile(...) / SaveEmojiToFile(...)
CropPrintImage(filePath)
```

---

## VR Overlay System (Deep Dive)

The VR Overlay is the most complex subsystem in VRCX, with **completely different architectures** on each platform.

### Common Interface

```csharp
// VRCXVRInterface.cs - Both platform VR implementations inherit this
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
// AppApiVrCommon.cs - VR Overlay frontend API interface
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

### Windows Overlay Architecture (Multi-Process + WebSocket)

On Windows, the VR Overlay runs as a **separate child process**, communicating with the main process via WebSocket:

```
┌─────────────────────────────────────────────┐
│           Main Process (VRCX.exe)            │
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
│       ▼  (spawns: VRCX.exe --overlay)       │
│  OverlayServer (WebSocket ws://127.0.0.1:34582/)│
│       │  ↕ OverlayMessage (JSON)            │
└───────┼─────────────────────────────────────┘
        │ WebSocket
        ▼
┌─────────────────────────────────────────────┐
│      Overlay Process (VRCX.exe --overlay)    │
│                                             │
│  OverlayProgram.OverlayMain()               │
│       │                                     │
│       ├── CefService.Init()  // Standalone CEF│
│       │                                     │
│       ├── OverlayClient.Init()              │
│       │     (connects ws://127.0.0.1:34582)  │
│       │     receives UpdateVars / JsFunctionCall│
│       │                                     │
│       ├── VRCXVRCef (VR rendering engine)    │
│       │     ├── D3D11 Device                 │
│       │     ├── OpenVR (SteamVR)             │
│       │     ├── Two rendering modes:         │
│       │     │   ├── New: SharedTexture (GPU→GPU)│
│       │     │   └── Legacy: CPU CopyMemory    │
│       │     ├── HMD Overlay (1024×1024)      │
│       │     └── Wrist Overlay (512×512)      │
│       │                                     │
│       ├── OffScreenBrowser (CefSharp offscreen)│
│       │     ├── Renders vr.html (VR UI)      │
│       │     ├── IRenderHandler implementation │
│       │     ├── OnAcceleratedPaint (new mode) │
│       │     └── OnPaint (legacy mode)        │
│       │                                     │
│       └── AppApiVrCef (VR frontend API)      │
│             ├── SystemMonitorCef             │
│             │   (PerformanceCounter CPU/Uptime)│
│             └── GetVRDevices() / CpuUsage()  │
│                                             │
│  Exit condition: QuitProcess() polls         │
│  connection+active status; exits after 5s    │
│  of no connection or inactivity              │
└─────────────────────────────────────────────┘
```

**OverlayMessage Protocol:**
```csharp
public enum OverlayMessageType {
    OverlayConnected,   // Overlay child process connected
    JsFunctionCall,     // Main process tells Overlay to execute a JS function
    UpdateVars,         // Update Overlay state (Active, HMD, Wrist, ...)
    IsHmdAfk            // HMD AFK status feedback to main process
}

public class OverlayVars {
    Active, HmdOverlay, WristOverlay, MenuButton, OverlayHand
}
```

**OffScreenBrowser Dual-Mode Rendering:**
- **New Mode** (`SharedTextureEnabled=true`): CEF uses GPU shared textures → `OnAcceleratedPaint` directly `CopyResource` to D3D11 texture → submit to OpenVR. 60 FPS.
- **Legacy Mode** (`isLegacy=true`): CEF uses CPU software rendering → `OnPaint` copies pixels to pinned buffer → `RenderToTexture` maps to D3D11 texture. 24 FPS.
- Users can switch to Legacy mode via setting `VRCX_DisableVrOverlayGpuAcceleration=true`.

### Linux Overlay Architecture (Shared Memory + Electron Offscreen)

On Linux, the VR Overlay runs **in the same process**, using Electron offscreen rendering + shared memory:

```
┌──────────────────────────────────────────────────────┐
│                  Electron Process (main.js)            │
│                                                      │
│  main.js                                             │
│       │                                              │
│       ├── createOverlayWindowOffscreen()              │
│       │     ├── BrowserWindow (offscreen: true)       │
│       │     │   ├── Renders vr.html                   │
│       │     │   └── paint event → image.toBitmap()    │
│       │     │                                        │
│       │     └── writeOverlayFrame(buffer)             │
│       │           └── Writes to /dev/shm/vrcx_overlay │
│       │               (OVERLAY_FRAME_SIZE + 1 byte)   │
│       │               byte[0] = ready flag            │
│       │               byte[1..] = BGRA pixel data     │
│       │                                              │
│       └── .NET (node-api-dotnet, same process)        │
│             │                                        │
│             ├── VRCXVRElectron                         │
│             │     ├── OpenVR (SteamVR)                │
│             │     ├── Requires OpenGL context:         │
│             │     │   ├── GLContextWayland (EGL)      │
│             │     │   └── GLContextX11 (GLX)          │
│             │     ├── GLTextureWriter                 │
│             │     │   (glTexSubImage2D → OpenGL tex)   │
│             │     ├── GetLatestOverlayFrame()          │
│             │     │   └── Reads frame data from /dev/shm│
│             │     ├── FlipImageVertically()            │
│             │     │   └── OpenVR requires vertical flip│
│             │     ├── HMD Overlay (1024×1024)          │
│             │     └── Wrist Overlay (512×512)          │
│             │                                        │
│             ├── AppApiVrElectron (VR frontend API)      │
│             │     ├── SystemMonitorElectron            │
│             │     │   (/proc/stat CPU + /proc/uptime)  │
│             │     └── GetExecuteVrOverlayFunctionQueue()│
│             │         (ConcurrentQueue consumed by main)│
│             │                                        │
│             └── ExecuteVrOverlayFunction bridged via   │
│                 ConcurrentQueue between main & VR threads│
│                                                      │
│ Frame dimensions:                                     │
│   Wrist: 512×512, HMD: 1024×1024                     │
│   Combined: 1024×1536 (max_w × (h1+h2))              │
│   Frame size: 1024×1536×4 = 6,291,456 bytes           │
└──────────────────────────────────────────────────────┘
```

**Linux Rendering Pipeline:**
1. Electron `BrowserWindow` uses `offscreen: true` mode, receives `paint` callback
2. Each frame converted to `Bitmap` → written to shared memory `/dev/shm/vrcx_overlay`
3. C# side `VRCXVRElectron.GetLatestOverlayFrame()` reads shared memory
4. Image flipped vertically (OpenVR render coordinates have inverted Y axis)
5. Written to `GLTextureWriter` (OpenGL texture)
6. Submitted to OpenVR as `Texture_t` (ETextureType.OpenGL)

**Linux VR requires an OpenGL context:**
- Auto-detects display server type
- Wayland → `GLContextWayland.cs`: Uses EGL (libEGL.so.1) to create pbuffer surface
- X11 → `GLContextX11.cs`: Uses GLX (libGL.so.1) to create hidden window + GL context

### Overlay Feature Comparison

| Feature | Windows | Linux |
|---------|---------|-------|
| Process Model | Separate child process | Same process |
| Communication | WebSocket (`ws://127.0.0.1:34582`) | Shared Memory (`/dev/shm/vrcx_overlay`) |
| Rendering API | Direct3D 11 (Silk.NET) | OpenGL (P/Invoke) |
| Frame Capture | CefSharp OffScreen (SharedTexture/OnPaint) | Electron offscreen `paint` event |
| GPU-Accelerated Rendering | ✅ (SharedTexture D3D11) | ❌ (CPU pipeline only) |
| Legacy Rendering | ✅ (CPU RtlCopyMemory) | ❌ |
| System Monitoring | PerformanceCounter | /proc/stat + /proc/uptime |
| Frame Rate | 60 FPS (new) / 24 FPS (legacy) | 48 FPS |
| Auto-Exit | 5s no connection/inactive → auto exit | Controlled by `main.js` `disposeOverlay()` |
| HMD AFK Detection | WebSocket feedback to main process | Polls OpenVR |

---

## CEF Host Details (Windows only)

### CefService.cs — Chromium Initialization

- Configures CEF settings: cache path, logging, UserAgent, proxy
- Registers `file://vrcx/` custom scheme (maps to `html/` directory)
- Handles CEF version downgrade detection (auto-deletes userdata on downgrade to prevent crashes)
- Debug mode enables remote debugging port (8089/8090) and Vue Devtools extension loading

### MainForm.cs — Window Management

- WinForms main window hosting CefSharp `ChromiumWebBrowser`
- Manages tray icon, window state save/restore
- Handles `DpiChanged` events
- Uses `WinformThemer` to set Windows dark/light/Midnight themes (via DWM API `DWMWA_USE_IMMERSIVE_DARK_MODE`)

### CEF Handler Classes

| Handler | Purpose |
|---------|---------|
| `CustomRequestHandler` | Blocks unauthorized navigation (only allows `file://vrcx/` and debug mode URLs), handles render process crash recovery |
| `CustomDownloadHandler` | File download dialog |
| `CustomDragHandler` | Drag handling |
| `CustomMenuHandler` | Context menu |
| `NoopDragHandler` | Disables dragging (for VR Overlay) |
| `WinformBase` | WinForms window base class |
| `Wine` | Detects Wine environment (`wine_get_version` P/Invoke) |
| `WinformThemer` | Windows theme switching (Dark/Light/Midnight), window flashing (209 lines) |
| `SubProcess` | CefSharp subprocess launcher (GPU/renderer/utility processes) |

### Program.cs — Entry Point

Windows and Linux share the same `Program.cs`, differentiated by `#if`:

```csharp
public static void Main(string[] args)
{
    BrowserSubprocess.Start();  // CEF subprocess routing

    #if !LINUX
    // Windows: ArgsCheck → duplicate instance detection → Run() → MainForm
    StartupArgs.ArgsCheck(args);
    Run();
    #else
    // Linux: Called by Electron main.js via ProgramElectron.PreInit/Init
    #endif
}
```

---

## Initialization Sequence

### Windows
```
Program.Main()
  → BrowserSubprocess.Start()       // CEF subprocess routing
  → StartupArgs.ArgsCheck()          // Argument parsing, duplicate instance detection
  → Program.SetProgramDirectories()  // Set AppData paths
  → WebApi.SetProxy()                // Proxy configuration
  → CefService.Init()                // Initialize Chromium
  → MainForm.Load()                  // Create window
    → JavascriptBindings             // Register JS bindings
    → Program.Init()                 // Start all services
      → VRCXStorage.Load()
      → SQLite.Init()
      → LogWatcher.Init()
      → Discord.Init()
      → IPCServer.Init()
      → AutoAppLaunchManager.Init()
      → ProcessMonitor.Init()
  → [When SetVR is called]
    → OverlayServer.UpdateVars()     // Start WebSocket server
    → OverlayManager.StartOverlay()  // Spawn child process (VRCX.exe --overlay)
      → OverlayProgram.OverlayMain() (child process)
        → CefService.Init()          // Standalone CEF instance
        → OffScreenBrowser()         // Offscreen render vr.html
        → VRCXVRCef.Init()           // OpenVR initialization
        → OverlayClient.Init()       // WebSocket connect to main process
```

### Linux/macOS
```
main.js (Electron)
  → isDotNetInstalled()              // Check for .NET 9 runtime
  → require('node-api-dotnet')       // Load C# assembly
  → require('./InteropApi')          // Initialize interop layer
  → ProgramElectron.PreInit()        // Set directories and version
  → VRCXStorage.Load()
  → ProgramElectron.Init()           // Configure logging
  → SQLite.Init()
  → AppApiElectron.Init()
  → Discord.Init()
  → WebApi.Init()
  → LogWatcher.Init()
  → SystemMonitorElectron.Init()
  → AppApiVrElectron.Init()
  → createWindow()                   // Create Electron BrowserWindow
  → createTray()
  → installVRCX()                    // AppImage installation flow
  → [When app:updateVr is triggered]
    → createOverlayWindowOffscreen() // Electron offscreen BrowserWindow
    → VRCXVRElectron.SetActive()     // OpenVR init + GL context
```

---

## Conditional Compilation

C# code uses preprocessor directives `#if LINUX` / `#if !LINUX` to switch platform-specific code:

```csharp
// VRCX-Electron.csproj defines:
// <DefineConstants>LINUX</DefineConstants>

#if !LINUX
using CefSharp;         // Windows only
using System.Windows.Forms;
#endif
```

---

## Frontend-Facing API Summary

All global objects directly used by the frontend and their sources:

```
window.AppApi         → AppApiCef (Win) / AppApiElectron (Linux/Mac)
window.WebApi         → WebApi (shared)
window.VRCXStorage    → VRCXStorage (shared)
window.SQLite         → SQLite (shared)
window.LogWatcher     → LogWatcher (shared)
window.Discord        → Discord (shared)
window.AssetBundleManager → AssetBundleManager (shared)
window.AppApiVr       → AppApiVrCef (Win, VR overlay only)
window.AppApiVrElectron → AppApiVrElectron (Linux/Mac)
```

### Electron-Specific APIs (Not via C# Bridge)

Some capabilities bypass the C# backend entirely, provided directly by Electron's `preload.js`:

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

- **All calls are async** (even though CefSharp on Windows appears synchronous, it's actually cross-process communication)
- Method names retain C# PascalCase (e.g., `AppApi.GetVersion()`)
- Return values auto-serialize: C# object → JSON → JS object
- Arrays return as `object[][]` (SQLite result sets)

---

## Frontend Development Reference Notes

### 1. Platform Detection

Frontend code uses the build-time constant `WINDOWS` for platform detection:

```javascript
if (WINDOWS) {
    // Windows-only features
} else {
    // Linux/macOS via Electron
}
```

::: warning Critical Reminder
Many AppApi methods are **no-ops** on the Electron side. For example:
- `ShowDevTools()` → no-op
- `SetZoom()` → no-op (zoom managed by Electron itself)
- `DesktopNotification()` → no-op (Electron handles this via `preload.js`)
- `ChangeTheme()` → no-op
- `SetStartup()` → no-op
- `FlashWindow()` → no-op
- `FocusWindow()` → no-op
- `SetUserAgent()` → no-op
- `SetTrayIconNotification()` → no-op
- `OpenCalendarFile()` → no-op
- `DoFunny()` → no-op
- `RestartApplication()` → no-op

Calling these methods won't throw errors, but they won't have any effect either. For features that need to work cross-platform, frontend fallbacks are needed (via Electron APIs exposed through `preload.js`).
:::

### 2. Calling Backend APIs Safely

```javascript
// ✅ Correct - always await
const version = await AppApi.GetVersion();

// ✅ Correct - VRCXStorage is also async on Electron
const value = await VRCXStorage.Get('VRCX_SomeKey');

// ⚠️ Note - SQLite.Execute returns JSON string on Electron
// On Windows it returns object[][]
// Use ExecuteJson method for Electron compatibility
```

### 3. Backend Constraints When Adding New Features

If you need a new backend API:
1. **Declare the abstract method in `AppApiCommonBase.cs`**
2. **Implement shared logic in `AppApiCommon.cs`** (if applicable)
3. **Implement platform-specific logic in `AppApiCef.cs` and `AppApiElectron.cs`**
4. Windows side: CefSharp automatically exposes the new method
5. Linux side: `node-api-dotnet` also automatically exposes it (reflects the entire class)

### 4. VR Overlay Frontend Constraints

The VR Overlay's frontend page (`vr.html`) has special constraints:
- It communicates with the backend via **`AppApiVr`**, not `AppApi`
- On Windows it runs in a **separate child process**, completely isolated from the main window
- Communication from main window to Overlay uses `AppApi.ExecuteVrOverlayFunction(functionName, json)` — this passes JS function calls via WebSocket (Win) or ConcurrentQueue (Linux)
- Feedback from Overlay to main window is very limited (basically only `IsHmdAfk` status)

---

## Architecture Issues & Weaknesses

### 1. Global State via Singleton Pattern

All C# service classes use `static Instance` singletons, initialized via static constructors. This means:
- No explicit dependency injection between services
- Initialization order has implicit dependencies (e.g., `SQLite.Init()` depends on `VRCXStorage` being loaded)
- Impossible to mock individual services for testing

### 2. Inconsistent Bridge Mechanisms

Windows and Linux/macOS bridging mechanisms are entirely different:
- **Windows** (`CefSharp`): Supports sync/async calls, automatic type conversion, good performance
- **Linux/macOS** (`node-api-dotnet`): All calls are async (IPC), **additional JSON serialization overhead**, long call chain (JS → preload → main → InteropApi → .NET)

This leads to:
- Frontend cannot assume calls are synchronous
- High-frequency call scenarios (e.g., LogWatcher.Get) may have performance bottlenecks on Electron
- Inconsistent error handling — CefSharp exceptions pass through directly, Electron exceptions lose stack traces through IPC serialization

### 3. Numerous No-Op Implementations in `AppApiElectron`

`AppApiElectron` has **12+ no-op methods**, meaning:
- Frontend cannot rely on the backend for these features
- Feature differences are not reflected at the API level (silently ignored, no exceptions)
- Frontend must do feature gating using the `WINDOWS` constant

### 4. Dual VR Overlay Implementations Increase Maintenance Burden

The two platforms use completely different VR Overlay architectures (multi-process WebSocket vs single-process shared memory), with different rendering APIs (D3D11 vs OpenGL):
- Two 800+ line VR implementations (`VRCXVRCef.cs` / `VRCXVRElectron.cs`)
- VR feature changes require modifications in two places
- Linux shared memory frame transfer has a performance ceiling (~48 FPS, no GPU-accelerated path)

### 5. LogWatcher is a Monolithic Giant Class

`LogWatcher.cs` has **1442 lines**, parsing **40+ VRChat log event types**. All parsing logic lives in a single class, making it harder to understand and maintain. However, the frontend interface is simple — just calling `LogWatcher.Get()` to fetch the latest parsed results.

### 6. Conditional Compilation Hurts Code Readability

`#if LINUX` / `#if !LINUX` directives are scattered across multiple shared files (e.g., `Program.cs`, `WebApi.cs`, `SQLite.cs`). Reading the code requires mentally switching between which platform's logic you're looking at.

### 7. Unclear Error Boundaries

Backend exception handling differs by platform:
- CefSharp: Exceptions pass directly to JS Promise rejections
- Electron: Exceptions are caught/re-thrown in `InteropApi.callMethod`, losing stack traces through IPC serialization

Frontend `try/catch` can capture errors, but error message quality is inconsistent between platforms.

### 8. Windows Overlay Child Process Crash Risk

The Overlay child process (`SubProcess.cs`) retries indefinitely on CEF render process crashes (`while(true)`), and `OverlayProgram.QuitProcess()` uses async polling to check connection status, which may prevent timely process exit if the WebSocket connection disconnects abnormally.

---

## Complete File Tree

```
Dotnet/
├── Program.cs                    # Entry point + ProgramElectron (307 lines)
├── WebApi.cs                     # HTTP client (526 lines)
├── SQLite.cs                     # Database operations (113 lines)
├── VRCXStorage.cs                # JSON KV storage (81 lines)
├── LogWatcher.cs                 # Log monitoring (1442 lines)
├── Discord.cs                    # Discord Rich Presence (243 lines)
├── ImageCache.cs                 # Image caching (128 lines)
├── ProcessMonitor.cs             # Process monitoring (216 lines)
├── AutoAppLaunchManager.cs       # Auto-launch management (592 lines)
├── AssetBundleManager.cs         # Cache management (245 lines)
├── Update.cs                     # Auto-update (271 lines)
├── WinApi.cs                     # Windows API P/Invoke (104 lines)
├── StartupArgs.cs                # Startup argument parsing (186 lines)
├── JsonFileSerializer.cs         # JSON file serialization (51 lines)
│
├── AppApi/
│   ├── Common/
│   │   ├── AppApiCommonBase.cs   # Abstract method declarations (abstract partial class)
│   │   ├── AppApiCommon.cs       # Cross-platform shared implementation
│   │   ├── ImageSaving.cs        # Image saving
│   │   ├── LocalPlayerModerations.cs  # Local moderation
│   │   ├── OVRToolkit.cs         # OVR Toolkit notification integration
│   │   ├── Screenshot.cs         # Screenshot common
│   │   ├── Update.cs             # Update common
│   │   ├── Utils.cs              # Utilities (MD5, FileLength, SignFile, ...)
│   │   ├── VrcConfigFile.cs      # VRC config file read/write
│   │   └── XSOverlay.cs          # XSOverlay notification integration
│   ├── Cef/                      # Windows only
│   │   ├── AppApiCef.cs          # Windows AppApi implementation (242 lines)
│   │   ├── Folders.cs            # Windows file paths
│   │   ├── GameHandler.cs        # Windows game management
│   │   ├── ImageUploading.cs     # Windows image upload signing/cropping
│   │   ├── RegistryPlayerPrefs.cs # Windows registry
│   │   └── Screenshot.cs         # Windows screenshot
│   └── Electron/                 # Linux/macOS only
│       ├── AppApiElectron.cs     # Linux AppApi implementation (140 lines, many no-ops)
│       ├── Folders.cs            # Linux paths (XDG)
│       ├── GameHandler.cs        # Linux game management
│       ├── RegistryPlayerPrefs.cs # Wine/Proton registry emulation
│       └── Screenshot.cs         # Linux screenshot
│
├── Cef/                          # Windows only
│   ├── CefService.cs             # CEF initialization config (187 lines)
│   ├── JavascriptBindings.cs     # JS global object registration (20 lines)
│   ├── MainForm.cs               # WinForms main window (257 lines)
│   ├── MainForm.Designer.cs      # WinForms designer auto-generated
│   ├── SubProcess.cs             # CEF subprocess launcher (69 lines)
│   ├── CefCustomRequestHandler.cs  # URL navigation blocking + crash recovery
│   ├── CefCustomDownloadHandler.cs # File download dialog
│   ├── CefCustomDragHandler.cs   # Drag handling
│   ├── CefCustomMenuHandler.cs   # Context menu
│   ├── CefNoopDragHandler.cs     # Disable dragging (for VR Overlay)
│   ├── WinformBase.cs            # WinForms window base class
│   ├── WinformThemer.cs          # Windows theme switching (DWM API, 209 lines)
│   └── Wine.cs                   # Wine environment detection (23 lines)
│
├── IPC/
│   ├── IPCServer.cs              # Named Pipe server (67 lines)
│   ├── IPCClient.cs              # Named Pipe client
│   ├── IPCPacket.cs              # IPC packet
│   └── VRCIPC.cs                 # VRChat URL Launch Pipe (43 lines)
│
├── Overlay/
│   ├── VRCXVRInterface.cs        # VR interface abstraction (18 lines)
│   ├── AppApiVrCommon.cs         # VR API common interface (17 lines)
│   │
│   ├── Cef/                      # Windows VR
│   │   ├── VRCXVRCef.cs          # D3D11 + OpenVR (~848 lines)
│   │   ├── AppApiVrCef.cs        # Windows VR API (87 lines)
│   │   ├── OffScreenBrowser.cs   # CEF offscreen rendering (275 lines)
│   │   ├── OverlayClient.cs      # WebSocket client (123 lines)
│   │   ├── OverlayProgram.cs     # Overlay child process entry (53 lines)
│   │   └── SystemMonitorCef.cs   # Windows PerformanceCounter (149 lines)
│   │
│   ├── Electron/                 # Linux VR
│   │   ├── VRCXVRElectron.cs     # SharedMem + OpenVR (~864 lines)
│   │   ├── AppApiVrElectron.cs   # Linux VR API (88 lines)
│   │   ├── GLContextWayland.cs   # EGL context (Wayland, 204 lines)
│   │   ├── GLContextX11.cs       # GLX context (X11, 170 lines)
│   │   ├── GLTextureWriter.cs    # OpenGL texture writer (106 lines)
│   │   └── SystemMonitorElectron.cs # /proc/stat CPU (208 lines)
│   │
│   └── OpenVR/
│       └── openvr_api.cs         # OpenVR C# bindings (364K)
│
├── OverlayWebSocket/             # Windows only
│   ├── OverlayServer.cs          # WebSocket server (212 lines)
│   ├── OverlayManager.cs         # Overlay child process management (53 lines)
│   ├── OverlayMessage.cs         # Message model (17 lines)
│   ├── OverlayMessageType.cs     # Message type enum (9 lines)
│   └── OverlayVars.cs            # Overlay state variables (10 lines)
│
├── ScreenshotMetadata/
│   ├── PNGFile.cs                # PNG file structure parsing
│   ├── PNGChunk.cs               # PNG chunk data blocks
│   ├── PNGChunkTypeFilter.cs     # PNG chunk type filtering
│   ├── PNGHelper.cs              # PNG operation helpers
│   ├── ScreenshotHelper.cs       # Screenshot processing
│   ├── ScreenshotMetadata.cs     # Screenshot metadata model
│   └── ScreenshotMetadataDatabase.cs # Screenshot metadata DB
│
└── DBMerger/                     # Standalone tool
    ├── Program.cs                # Database merge entry
    ├── Merger.cs                 # Merge logic
    ├── Config.cs                 # Configuration
    └── SqliteExtensions.cs       # SQLite extension methods

src-electron/                     # Electron host (Linux/macOS)
├── main.js                       # Electron main process (927 lines)
├── preload.js                    # Secure context bridge
├── InteropApi.js                 # node-api-dotnet wrapper
├── offscreen-preload.js          # VR Overlay offscreen preload
├── offscreen.html                # VR Overlay page container
└── utils.js                      # Utility functions
```
