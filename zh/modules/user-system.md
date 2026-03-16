# 用户系统

用户系统是 VRCX 数据模型的**核心枢纽**。它管理当前用户状态、所有已知用户的缓存引用、用户对话框（12 标签页的用户详情弹窗），以及将 API 响应桥接到响应式状态的用户 Coordinator。拥有 13 个直接依赖者，对用户系统的修改具有代码库中最大的影响范围。

```mermaid
graph TB
    subgraph "用户系统"
        UserStore["userStore<br/>(747 行)"]
        UserCoord["userCoordinator<br/>(1058 行)"]
        UserEventCoord["userEventCoordinator<br/>(339 行)"]
        UserSessionCoord["userSessionCoordinator<br/>(92 行)"]
    end

    subgraph "关键依赖者 (13)"
        FriendStore["friendStore"]
        InstanceStore["instanceStore"]
        NotificationStore["notificationStore"]
        ModerationStore["moderationStore"]
        SearchStore["searchStore"]
        SharedFeed["sharedFeedStore"]
        GameLogCoord["gameLogCoordinator"]
        FriendCoord["friendPresenceCoordinator"]
        LocationCoord["locationCoordinator"]
    end

    UserCoord --> UserStore
    UserEventCoord --> UserStore
    UserSessionCoord --> UserStore
    UserStore -.-> FriendStore
    UserStore -.-> InstanceStore
    UserStore -.-> NotificationStore
    UserStore -.-> ModerationStore
    UserStore -.-> SearchStore
    UserStore -.-> SharedFeed
    UserStore -.-> GameLogCoord
    UserStore -.-> FriendCoord
    UserStore -.-> LocationCoord
```

## 概览


## 状态结构

### `currentUser` — 当前登录用户

```js
currentUser: {
    // VRC API 字段
    id: '',
    displayName: '',
    currentAvatar: '',
    currentAvatarThumbnailImageUrl: '',
    status: '',               // 'active', 'join me', 'ask me', 'busy', 'offline'
    statusDescription: '',
    bio: '',
    friends: [],              // 好友 userId 数组
    onlineFriends: [],
    activeFriends: [],
    offlineFriends: [],
    homeLocation: '',
    presence: { ... },        // 实时在线数据
    queuedInstance: '',

    // VRCX 计算字段（$ 前缀）
    $isVRCPlus: false,
    $isModerator: false,
    $trustLevel: 'Visitor',
    $trustClass: 'x-tag-untrusted',
    $userColour: '',
    $languages: [],
    $locationTag: '',
    $travelingToLocation: ''
}
```

### `cachedUsers` — 所有已知用户

```js
// 由 userCoordinator.applyUser() 管理
// Key: userId, Value: 响应式用户引用
const cachedUsers = shallowReactive(new Map());
```

通过好友列表、实例玩家列表、搜索结果或 WebSocket 事件遇到的每个用户都会被缓存。缓存使用 `shallowReactive` 以提升性能 — 仅 Map 成员变更触发响应性，个别用户对象的深层属性变更不会。

### `userDialog` — 12 标签页用户详情弹窗

```js
userDialog: {
    visible: false,
    loading: false,
    activeTab: 'Info',       // Info | Worlds | Avatars | Favorites | Groups | Activity | JSON | ...
    id: '',                  // 正在查看的 userId
    ref: {},                 // 缓存的用户引用
    friend: {},              // 好友上下文（如果是好友）
    isFriend: false,
    note: '',                // VRC 用户备注
    memo: '',                // VRCX 本地备忘录
    previousDisplayNames: [],
    dateFriended: '',
    mutualFriendCount: 0,
    mutualGroupCount: 0,
    mutualFriends: [],
    // ... 30+ 个字段用于各标签页
}
```

## 核心 Coordinator

### `userCoordinator.js`（1058 行）

代码库中最大的 coordinator。关键函数：

#### `applyUser(json)` — 实体转换

整个应用中最关键的函数。每次用户数据更新都会经过这里：

```mermaid
graph LR
    Input["API 响应 / WS 事件"] --> Apply["applyUser(json)"]
    Apply --> Sanitize["sanitizeEntityJson()"]
    Apply --> Enrich["计算信任等级、平台、颜色"]
    Apply --> Cache["cachedUsers.set(id, ref)"]
    Apply --> Diff["diffObjectProps(ref, json)"]
    Diff --> Events["runHandleUserUpdateFlow(ref, props)"]
    Apply --> FriendUpdate["runUpdateFriendFlow()"]
```

**处理步骤：**
1. 清理原始 API JSON（`sanitizeEntityJson`）
2. 创建或更新缓存用户 ref
3. 计算派生字段：
   - `$trustLevel` / `$trustClass` — 从 tags 数组
   - `$userColour` — 从自定义标签或信任等级
   - `$platform` / `$previousPlatform` — 从平台字符串
   - `$isVRCPlus` / `$isModerator` / `$isTroll` — 从标签
   - `$languages` — 从语言标签
4. Diff 旧值 vs 新值 → 发出变更事件
5. 如适用更新好友状态

#### `applyCurrentUser(json)` — 当前用户水合

比 `applyUser()` 复杂得多 — 220 行。处理：
- 首次登录初始化（`runFirstLoginFlow`）
- 头像切换检测（`runAvatarSwapFlow`）
- 家位置同步（`runHomeLocationSyncFlow`）
- 应用后跨 store 同步（`runPostApplySyncFlow`）
- 好友列表关系更新
- 排队实例处理
- 状态变化检测 → 自动状态切换逻辑

#### `showUserDialog(userId)` — 对话框打开

~260 行处理：
1. 检查缓存中的现有用户数据
2. 从 API 获取最新数据
3. 加载本地数据（备忘录、好友日期、备注、历史显示名）
4. 填充所有对话框字段
5. 获取头像信息、共同好友、共同群组
6. 将位置数据应用到对话框

#### `updateAutoStateChange()` — 自动状态

根据游戏状态自动切换用户状态：
- 游戏运行中 + VR → 设置配置的 VR 状态
- 游戏未运行 → 恢复之前的状态
- 可通过 `generalSettingsStore.autoStateChange` 配置

### `userEventCoordinator.js`（339 行）

单一函数：`runHandleUserUpdateFlow(ref, props)`。这是**变更事件分发器** — 当 `applyUser()` 检测到属性差异时，此函数：

1. 为每种变更类型生成 feed 条目：
   - 状态变更 → feed 条目 + 桌面通知
   - 位置变更（GPS） → feed 条目 + Noty 通知
   - 头像变更 → feed 条目
   - 简介变更 → feed 条目
   - 上线/下线转换 → feed 条目 + VR 通知
2. 通过 `database.addFeedToDatabase()` 写入数据库
3. 推送到 `sharedFeedStore.addEntry()` 用于仪表盘/VR 叠层
4. 处理**170秒待定离线**机制

### `userSessionCoordinator.js`（92 行）

当前用户处理期间触发的四个小流程：

| 函数 | 用途 |
|------|------|
| `runAvatarSwapFlow` | 检测头像切换，记录到历史，追踪穿戴时间 |
| `runFirstLoginFlow` | 一次性设置：清除缓存，设置 currentUser，调用 `loginComplete()` |
| `runPostApplySyncFlow` | 数据应用后同步群组、排队实例、好友关系 |
| `runHomeLocationSyncFlow` | 解析家位置，如对话框可见则更新 |

## 数据流

### 用户更新管线

```mermaid
sequenceDiagram
    participant WS as WebSocket
    participant Pipeline as handlePipeline
    participant Apply as applyUser(json)
    participant Cache as cachedUsers
    participant Diff as diffObjectProps
    participant Events as userEventCoordinator
    participant Feed as sharedFeedStore
    participant DB as database

    WS->>Pipeline: friend-update / friend-online / friend-location / ...
    Pipeline->>Apply: applyUser(content.user)
    Apply->>Cache: 创建或更新 ref
    Apply->>Apply: 计算 $trust, $platform, $color
    Apply->>Diff: diffObjectProps(ref, json)
    Diff-->>Events: runHandleUserUpdateFlow(ref, props)
    Events->>Feed: addEntry(feedEntry)
    Events->>DB: addFeedToDatabase(feedEntry)
```

### WebSocket 事件 → 用户更新

| WS 事件 | 动作 |
|---------|------|
| `friend-online` | 合并 `content.user` 与位置数据 → `applyUser()` |
| `friend-active` | 设置 state='active', location='offline' → `applyUser()` |
| `friend-offline` | 设置 state='offline' → `applyUser()` |
| `friend-update` | 直接 `applyUser(content.user)` |
| `friend-location` | 合并位置字段 → `applyUser()` |
| `user-update` | 自身 `applyCurrentUser(content.user)` |
| `user-location` | 自身 `runSetCurrentUserLocationFlow()` |

## 活跃度热力图

**Activity** 标签页 (`UserDialogActivityTab.vue`) 使用 ECharts 热力图展示用户按 星期×小时 的在线频率。

### 数据源

- 查询 `database.getOnlineOfflineCountByHour(userId)`，聚合 SQLite 中 `Online` 类型的 feed 条目
- 返回 `{ dayOfWeek, hour, count }` 元组，按天（0=周日..6=周六）和小时（0..23）分组
- 显示时重排为周一至周日（行 0=周一 在顶部）

### 功能

| 功能 | 详情 |
|------|------|
| **热力图** | 7×24 网格，颜色强度映射到事件数量 |
| **峰值统计** | 在图表上方显示最活跃的日期和时间段 |
| **深色模式** | 通过 `isDarkMode` watch 适配配色方案 |
| **刷新** | 手动刷新按钮；标签页激活时自动加载 |
| **右键菜单** | 右键保存图表为 PNG |
| **空状态** | 无在线事件时显示 `DataTableEmpty` |

### 持久化

无持久化 — 数据从 feed 数据库只读获取。

## UserDialog 标签页搜索

四个 UserDialog 标签页现在支持**客户端搜索**，通过文本输入过滤显示列表：

| 标签页 | 搜索范围 | 实现方式 |
|--------|---------|----------|
| **共同好友** | `displayName` | 过滤 `mutualFriends` 数组 |
| **群组** | `name` | 跨所有群组分类（自己的、共同的、其余的）作为扁平列表过滤；搜索时隐藏分类标题 |
| **世界** | `name` | 过滤 `userWorlds` 数组 |
| **收藏世界** | `name` | 跨所有子标签页过滤；搜索时隐藏子标签导航 |

搜索不区分大小写，对所有用户资料可见（不仅限于当前用户）。

## 社交状态预设

用户可以保存并快速应用社交状态预设（status + statusDescription 组合）。

### 架构

```
useStatusPresets() composable
├── presets: ref([])              // 响应式预设数组
├── addPreset(status, desc)       // 添加，返回 'ok' | 'exists' | 'limit'
├── removePreset(index)           // 按索引删除
├── getStatusClass(status)        // CSS 类映射
└── MAX_PRESETS = 10              // 硬性限制
```

### 数据流

- **存储**：`configRepository` key `VRCX_statusPresets`（JSON 数组）
- **加载**：首次调用 `useStatusPresets()` 时懒加载
- **应用**：点击预设填充 `socialStatusDialog.status` 和 `socialStatusDialog.statusDescription`
- **删除**：悬停显示每个预设标签上的 X 按钮

### 访问入口

| 位置 | 交互方式 |
|------|----------|
| **SocialStatusDialog** | 保存当前状态为预设；点击预设应用；悬停删除 |
| **FriendsSidebar**（右键菜单） | 从子菜单快速应用预设 |

## 最近操作指示器

在 UserDialog 操作下拉菜单中，最近执行的操作（邀请、好友请求）旁边会显示一个时钟图标。

### 架构

```
useRecentActions.js composable（模块级状态）
├── recordRecentAction(userId, actionType)   // 记录时间戳
├── isActionRecent(userId, actionType)       // 检查是否在冷却期内
└── clearRecentActions()                     // 重置全部
```

### 追踪的操作

`Send Friend Request`、`Request Invite`、`Invite`、`Request Invite Message`、`Invite Message`

### 设置

| 设置 | Key | 默认值 |
|------|-----|--------|
| 启用 | `VRCX_recentActionCooldownEnabled` | `false` |
| 冷却时间（分钟） | `VRCX_recentActionCooldownMinutes` | `60`（范围：1–1440） |

### 存储

使用 `@vueuse/core` 的 `useLocalStorage('VRCX_recentActions', {})` 存储在 `localStorage`。Key 格式：`${userId}:${actionType}` → 时间戳（ms）。过期条目在读取时惰性清理。

## 文件映射

| 文件 | 行数 | 用途 |
|------|------|------|
| `stores/user.js` | 747 | 用户状态、userDialog、cachedUsers、备注、语言对话框 |
| `coordinators/userCoordinator.js` | 1058 | `applyUser`、`applyCurrentUser`、`showUserDialog`、`updateAutoStateChange` |
| `coordinators/userEventCoordinator.js` | 339 | `runHandleUserUpdateFlow` — 变更事件分发器 |
| `coordinators/userSessionCoordinator.js` | 92 | 头像切换、首次登录、应用后同步 |

## 风险与注意事项

- **`applyUser()` 在每次用户数据更新时被调用。** 性能至关重要 — 避免在此添加昂贵的计算。
- **`cachedUsers` 使用 `shallowReactive`。** 个别用户属性不具有响应性。组件必须使用完整 ref 或特定的 computed 属性。
- **`userDialog` 有 30+ 个字段。** 它实际上是一个子 store。对对话框逻辑的修改必须考虑所有 12 个标签页。
- **`$trustLevel` 计算**依赖于解析 VRChat 标签。如果 VRC 更改标签格式，这会静默失效。
- **`currentTravelers`**（Map）追踪当前正在移动的好友。由 `sharedFeedStore.rebuildOnPlayerJoining()` 重建，并被深度监听。
- **自动状态切换**会自动修改用户的 VRChat 状态。这是一个**破坏性操作**，会改变服务端状态 — 此处的 bug 会直接影响用户的社交存在感。
