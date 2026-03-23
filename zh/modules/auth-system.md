# 认证系统

认证系统管理 VRCX 的完整认证生命周期，包括手动登录、自动登录、凭证持久化、双因素认证（2FA）、主密码加密以及登出。它是应用启动时第一个激活的系统，所有其他子系统都依赖 `watchState.isLoggedIn` 来决定是否启动。

```mermaid
graph TB
    subgraph "认证系统"
        AuthStore["authStore<br/>(894 行)"]
        AuthCoord["authCoordinator<br/>(62 行)"]
        AutoLoginCoord["authAutoLoginCoordinator<br/>(78 行)"]
    end

    subgraph "依赖"
        UserCoord["userCoordinator"]
        UpdateLoop["updateLoopStore"]
        ModalStore["modalStore"]
        ConfigRepo["configRepository"]
        Security["security 服务"]
        WebApi["webApiService"]
        WS["websocket.js"]
    end

    AuthStore --> AuthCoord
    AuthStore --> AutoLoginCoord
    AuthCoord --> UserCoord
    AuthCoord --> WS
    AuthCoord --> UpdateLoop
    AutoLoginCoord --> AuthStore
    AuthStore --> ModalStore
    AuthStore --> ConfigRepo
    AuthStore --> Security
    AuthStore --> WebApi
```

## 概览


## 状态结构

```js
// loginForm — 登录表单状态
loginForm: {
    loading: false,         // 认证请求进行中
    username: '',
    password: '',
    endpoint: '',           // 自定义 API 端点（可选）
    websocket: '',          // 自定义 WS 端点（可选）
    saveCredentials: false, // 是否持久化凭证
    lastUserLoggedIn: ''    // 上次成功登录的 userId
}

// enablePrimaryPasswordDialog — 设置主密码的弹窗
enablePrimaryPasswordDialog: {
    visible: false,
    password: '',
    rePassword: ''
}

// 其他响应式状态
credentialsToSave: null,            // 待持久化的凭证
twoFactorAuthDialogVisible: false,  // 2FA 弹窗激活
cachedConfig: {},                   // 最新的 VRC 配置
enableCustomEndpoint: false,        // 自定义 API 开关
attemptingAutoLogin: false          // 自动登录守卫标志
```

## 认证流程

### 手动登录

```mermaid
sequenceDiagram
    participant U as 用户
    participant Auth as authStore.login()
    participant API as authRequest
    participant Handle as handleCurrentUserUpdate
    participant 2FA as promptTOTP / promptEmailOTP
    participant Success as runLoginSuccessFlow

    U->>Auth: 提交用户名 + 密码
    Auth->>API: authRequest.getConfig()
    Auth->>API: request('auth/user', Basic auth)
    API-->>Handle: json 响应

    alt requiresTwoFactorAuth 包含 'emailOtp'
        Handle->>2FA: promptEmailOTP()
        2FA-->>API: verifyEmailOTP({ code })
        API-->>Success: getCurrentUser()
    else requiresTwoFactorAuth (TOTP)
        Handle->>2FA: promptTOTP()
        2FA-->>API: verifyTOTP({ code })
        API-->>Success: getCurrentUser()
    else 无需 2FA
        Handle->>Success: runLoginSuccessFlow(json)
    end

    Success->>Success: applyCurrentUser(json)
    Success->>Success: initWebsocket()
    Success->>Success: updateLoop.setNextCurrentUserRefresh(420)
```

**关键细节：**
- 凭证通过 `btoa(encodeURIComponent(username):encodeURIComponent(password))` 编码为 Basic Auth
- 如果启用了 `saveCredentials` + 主密码，会额外通过 `security.encrypt()` 加密密码
- `credentialsToSave` ref 作为"待写入"缓冲，在登录成功后由 `updateStoredUser()` 消费

### 启动时自动登录

```mermaid
sequenceDiagram
    participant App as autoLoginAfterMounted
    participant Vrcx as vrcxStore
    participant Config as configRepository
    participant API as authRequest
    participant User as getCurrentUser

    App->>Vrcx: waitForDatabaseInit()
    alt 数据库初始化失败
        Note right of App: 跳过自动登录，<br/>数据库未就绪
    else 数据库初始化成功
        App->>Config: getString('lastUserLoggedIn')
        alt 有保存的用户且未启用主密码
            App->>Config: getSavedCredentials(userId)
            App->>App: applyAutoLoginDelay() [倒计时 toast]
            App->>API: authRequest.getConfig()
            App->>User: getCurrentUser()
        else 启用了主密码
            Note right of App: 跳过自动登录，<br/>显示登录界面
        end
    end
```

> **数据库初始化门控**：`autoLoginAfterMounted()` 和 `handleAutoLogin()`（WebSocket 重连）现在都会在继续之前调用 `vrcxStore.waitForDatabaseInit()`。这确保数据库升级已完成且表已就绪，然后任何登录流程才尝试访问它们。如果数据库初始化失败，自动登录将完全跳过。

### 断线自动重连（WebSocket 关闭时）

当 WebSocket 意外关闭但登录状态仍然有效时：

```mermaid
sequenceDiagram
    participant WS as WebSocket.onclose
    participant Auto as runHandleAutoLoginFlow
    participant Auth as authStore

    WS->>Auto: 5 秒延迟后触发
    Auto->>Auto: 检查 attemptingAutoLogin 守卫
    Auto->>Auto: 检查 ≤3 次/小时 限制
    Auto->>Auth: authStore.relogin(user)
    alt 成功
        Auto->>Auto: toast.success('自动登录成功')
    else 失败
        Auto->>Auto: toast.error('自动登录失败')
    end
```

**频率限制：** 1 小时滚动窗口内最多 3 次自动登录尝试。时间戳存储在 `state.autoLoginAttempts`（Set）中。

### 登录完成

```js
async function loginComplete() {
    await database.initUserTables(userStore.currentUser.id);
    watchState.isLoggedIn = true;         // 触发所有 store watcher
    AppApi.CheckGameRunning();            // 从热重载恢复状态
}
```

设置 `watchState.isLoggedIn = true` 是**主触发器**，它会激活：
- 好友同步 (`friendSyncCoordinator`)
- 通知初始化
- GameLog 处理
- 收藏加载
- 群组初始化
- 所有监听 `watchState.isLoggedIn` 的子系统

### 登出

```mermaid
sequenceDiagram
    participant U as 用户
    participant Auth as authStore.logout()
    participant Modal as modalStore.confirm
    participant Flow as runLogoutFlow

    U->>Auth: 点击登出
    Auth->>Modal: 确认对话框
    Modal-->>Auth: ok
    Auth->>Flow: runLogoutFlow()
    Flow->>Flow: watchState.isLoggedIn = false
    Flow->>Flow: watchState.isFriendsLoaded = false
    Flow->>Flow: watchState.isFavoritesLoaded = false
    Flow->>Flow: closeWebSocket()
    Flow->>Flow: queryClient.clear()
    Flow->>Flow: webApiService.clearCookies()
    Flow->>Flow: updateStoredUser(currentUser)
```

## 双因素认证

VRCX 支持三种 2FA 方式，均使用共享的 `modalStore.otpPrompt()` 对话框：

| 方式 | 函数 | API 端点 | 验证码格式 |
|------|------|---------|-----------|
| TOTP（验证器应用） | `promptTOTP()` | `verifyTOTP` | 6 位数字 |
| 恢复码 OTP | `promptOTP()` | `verifyOTP` | 8 字符，格式 `XXXX-XXXX` |
| 邮箱 OTP | `promptEmailOTP()` | `verifyEmailOTP` | 邮件中的验证码 |

**方式之间的切换：**
- TOTP 对话框有"使用恢复码"按钮 → 切换到 OTP
- OTP 对话框有"使用验证器"按钮 → 切换到 TOTP
- 邮箱 OTP 对话框有"重新发送"按钮 → 调用 `resendEmail2fa()` 清除 cookie 并重新触发登录

## 凭证管理

### 存储结构

凭证存储在 `configRepository`（SQLite）的 `savedCredentials` 键下：

```json
{
    "usr_xxxx": {
        "user": { "id": "usr_xxxx", "displayName": "...", ... },
        "loginParams": {
            "username": "user@example.com",
            "password": "明文或加密文本",
            "endpoint": "",
            "websocket": ""
        },
        "cookies": "..."
    }
}
```

### 主密码加密

当 `enablePrimaryPassword` 为 true 时：
1. **登录时：** 提示输入主密码 → `security.decrypt(storedPassword, primaryPassword)` → 实际密码用于认证
2. **保存时：** `security.encrypt(actualPassword, primaryPassword)` → 存储为密文
3. **禁用时：** 用户输入主密码 → 所有存储的密码解密后以明文重新保存
4. **影响：** 主密码完全**禁用自动登录**

### 迁移

`migrateStoredUsers()` 处理以用户名为 key 的旧数据。它将所有条目重新以 `usr_xxxx` 格式为 key。

## 自定义 API 端点

用于开发/测试，用户可以切换 `enableCustomEndpoint` 来指定：
- 自定义 REST API 端点（替代 `api.vrchat.cloud`）
- 自定义 WebSocket 端点

这些值存储在 `AppDebug.endpointDomain` / `AppDebug.websocketDomain` 中，在任何登录尝试前应用。

## 文件映射

| 文件 | 行数 | 用途 |
|------|------|------|
| `stores/auth.js` | 894 | 所有认证状态、登录/登出、2FA 提示、凭证管理 |
| `coordinators/authCoordinator.js` | 62 | `runLogoutFlow()`、`runLoginSuccessFlow()` |
| `coordinators/authAutoLoginCoordinator.js` | 78 | `runHandleAutoLoginFlow()` 含频率限制 |
| `services/security.js` | — | 通过 Web Crypto API 加密/解密 |
| `services/webapi.js` | — | Cookie 管理、clearCookies、setCookies |
| `services/config.js` | — | SQLite 键值持久化 |

## 关键依赖

| 认证触达 | 方向 | 用途 |
|----------|------|------|
| `userCoordinator` | out → | 登录成功时 `applyCurrentUser()` |
| `updateLoopStore` | out → | 安排下次用户刷新（7分钟） |
| `websocket.js` | out → | `initWebsocket()` / `closeWebSocket()` |
| `watchState` | out → | 设置 `isLoggedIn`、`isFriendsLoaded` 等 |
| `modalStore` | out → | OTP 提示、确认对话框 |
| `notificationStore` | out → | 登出时重置通知初始化状态 |
| `queryClient` | out → | 登出时清除 Vue Query 缓存 |

## 登录页服务器状态告警

登录页 (`Login.vue`) 在 VRChat 服务器有活动问题时，在登录表单上方显示 `<Alert>` 横幅：

- **条件**：`vrcStatusStore.hasIssue === true`
- **变体**：`vrcStatusStore.isMajor` 时为 `destructive`（红色），否则为 `warning`（琥珀色）
- **内容**：显示 `vrcStatusStore.statusText`（来自 Statuspage API 的事件描述）
- **点击**：通过 `vrcStatusStore.openStatusPage()` 打开 VRChat 状态页面

这让用户在尝试登录前了解服务器问题，减少因宕机导致的认证失败困惑。参见[状态栏 — 服务器状态严重级别](/zh/modules/status-bar#服务器状态严重级别)了解底层 `vrcStatusStore` 字段。

## 系统语言检测

首次启动时（无已保存的 `VRCX_appLanguage`），登录页通过 `AppApi.CurrentLanguage()` 检测操作系统语言，如果存在匹配的翻译则提示用户切换 VRCX 的语言环境。

- **语言解析**：`localization/index.js` 中的 `resolveSystemLanguage(systemLanguage, languageCodes)` — 先精确匹配 BCP-47 代码，再回退到基础语言，对中文变体有特殊处理（`zh-Hans` → `zh_CN`，`zh-Hant` → `zh_TW`）
- **提示**：确认对话框使用**检测到的语言**渲染（通过 `tForLocale()`），确保用户能阅读
- **防护**：如果用户在提示打开时手动切换语言则跳过；`isActive` 标志防止组件卸载后执行操作
- **文件**：`Login.vue`、`localization/index.js`

## 新手引导欢迎对话框

首次启动的欢迎对话框（`SpotlightDialog.vue`）展示 4 个核心 VRCX 功能：用户资料、右键菜单、仪表盘、快速搜索。首次启动时在挂载后 800ms 显示。

- **持久化**：`configRepository` 中的 `VRCX_onboarding_welcome_seen`（布尔值）
- **设计**：玻璃拟态对话框，每个功能卡片有交错的 `featureAppear` 动画
- **文件**：`components/onboarding/SpotlightDialog.vue`

## What's New 对话框

当用户升级到已注册“What's New”内容的新 VRCX 版本时，会显示对话框突出该版本的关键功能。

### 触发逻辑

```mermaid
sequenceDiagram
    participant Store as vrcxUpdaterStore
    participant Config as configRepository
    participant Releases as whatsNewReleases.js
    participant Dialog as WhatsNewDialog.vue

    Store->>Store: shouldAnnounceCurrentVersion()
    Note over Store: branch='Stable' &&<br/>isRecognizedStableReleaseVersion() &&<br/>lastVersion !== currentVersion

    Store->>Releases: getWhatsNewRelease(currentVersion)
    alt 有 What's New 内容
        Store->>Dialog: whatsNewDialog.visible = true
    else 该版本无内容
        Store->>Store: openChangeLogDialogOnly()
    end
    Store->>Config: setString('VRCX_lastVRCXVersion', currentVersion)
```

### 版本键控

版本内容存储在 `shared/constants/whatsNewReleases.js` 中，作为静态冻结对象：

```js
const whatsNewReleases = Object.freeze({
    '2026.04.05': {
        items: [
            { key: 'quick_search', icon: 'search' },
            { key: 'dashboard', icon: 'layout-dashboard' },
            // ...
        ]
    }
});
```

- **版本归一化**：`normalizeReleaseVersion()` 去除 `VRCX ` 前缀并验证 `YYYY.MM.DD` 格式
- **i18n 键**：`onboarding.whatsnew.releases.{YYYY_MM_DD}.items.{key}.title/description`
- **历史保留**：过去的版本内容保留以备将来参考

### 组件

| 组件 | 用途 |
|------|------|
| `WhatsNewDialog.vue` | 对话框 UI，包含功能卡片 |
| `whatsNewReleases.js` | 版本 → 功能项映射 |
| `vrcxUpdaterStore` | `showWhatsNewDialog()`、`closeWhatsNewDialog()`、`openChangeLogDialogOnly()` |

## 数据库升级对话框

`DatabaseUpgradeDialog.vue` 在数据库版本升级期间显示阻塞性进度对话框。

- **触发**：当 `databaseVersion < targetVersion` 时设置 `vrcxStore.databaseUpgradeState.visible`
- **门控**：`vrcxStore.waitForDatabaseInit()` 返回一个在 `updateDatabaseVersion()` 完成后 resolve 的 Promise。自动登录流程会等待这个 Promise。
- **失败时**：不可关闭的 `modalStore.alert()` 通知用户升级失败，并自动打开 DevTools 以便调试。
- **文件**：`components/dialogs/DatabaseUpgradeDialog.vue`、`stores/vrcx.js`

## 待更新指示器

当 VRCX 有可用更新时，登录页更新按钮上显示红色圆点徽章。

- **数据源**：`vrcxUpdaterStore.pendingVRCXUpdate`（响应式布尔值）
- **文件**：`Login.vue`

## 风险与注意事项

- **`watchState.isLoggedIn` 是主开关。** 在 `loginComplete()` 中设为 `true` 会触发 15+ 个 store 的 watcher。在 `runLogoutFlow()` 中设为 `false` 会触发所有相同 store 的清理。
- **自动登录延迟** (`applyAutoLoginDelay`) 使用倒计时 toast 配合 `workerTimers.setTimeout` — 这是用户可配置的延迟（0-60秒），防止快速重连循环。
- **Cookie 持久化：** `user.cookies` 与凭证一起保存。`relogin()` 时在认证前恢复 cookie 以维持会话 — 如果 cookie 无效，则发起全新认证请求。
- **主密码仅为客户端加密** — 它不提供服务端安全性，只防止本地凭证暴露。
- **数据库初始化门控阻塞自动登录。** 如果 `updateDatabaseVersion()` 失败（如磁盘满、schema 冲突），自动登录将完全跳过以防止损坏状态。
