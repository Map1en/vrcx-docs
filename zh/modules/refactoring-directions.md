# 重构方向与进度

本页记录所有已讨论、进行中或计划中的重构方向。

## Store 纯净化重构

### 目标

- **Store** 只负责管理内部状态（state、getters、简单 setters）
- **Coordinator** 负责跨 store 编排逻辑、业务流程、副作用

### 当前纯净度评分

| 评分 | Store 数量 | 占比 |
|------|-----------|------|
| 🟢 纯净 (0 跨store写入) | 13 | 35% |
| 🟡 轻度 (1-4 跨store写入) | 13 | 35% |
| 🟠 中度 (5-10 跨store写入) | 7 | 19% |
| 🔴 重度 (>10 跨store写入) | 4 | 11% |

**整体纯净度：70%**（重构前约 50%，提升了约 20 个百分点）

### 已完成的 Store → Coordinator 提取

| 源 Store | 新 Coordinator | 提取的函数 | 减少代码量 |
|----------|---------------|-----------|-----------|
| `friend.js` | `friendRelationshipCoordinator.js` + `friendSyncCoordinator.js` | 10 个函数（addFriendship, handleFriendDelete 等） | 289 行 (20%) |
| `gameLog/index.js` | `gameLogCoordinator.js` | 6 个函数（addGameLogEntry, tryLoadPlayerList 等） | 564 行 (54%) |
| `vrcx.js` | `vrcxCoordinator.js` | clearVRCXCache | 52 行 (6%) |

### 未提取的 Store（及原因）

| Store | 原因 |
|-------|------|
| `photon.js` 🚫 | 事件处理与 photon 逻辑深度耦合，用户决定不动 |
| `instance.js` | `applyInstance` 是 data layer 函数，非编排 |
| `notification/index.js` | 跨 store 交互主要是 UI 流程（sharedFeed + modal） |
| `auth.js` | `modalStore.confirm/prompt` 都是密码/OTP 流程，与 auth 紧耦合 |

### 剩余高耦合热点

| Store | 跨store写入数 | 主要目标 |
|-------|-------------|---------|
| `photon.js` | 13 处 | gameLog, notification, sharedFeed, vr, instance, game |
| `auth.js` | 10 处 | modal (×6), advancedSettings (×4) |
| `vrcx.js` | 10 处 | notification, gameLog, user 等 |
| `instance.js` | 6 处 | user, group, ui, notification |

---

## Caller Key 缓存策略

### 目标

将通用 `queryRequest.fetch('user', ...)` 替换为语义化的 `resource.caller` key（如 `'user.dialog'`），让不同场景使用不同缓存策略。

### 已实现的 Caller 变体

| Caller Key | 用途 | 策略差异 |
|------------|------|---------|
| `user.dialog` | UserDialog 展示 | staleTime: 120s |
| `user.force` | 强制刷新 | staleTime: 0 |
| `avatar.dialog` | AvatarDialog 展示 | staleTime: 120s |
| `world.dialog` | WorldDialog 展示 | staleTime: 120s |
| `world.location` | 位置/Sidebar 展示 | 默认策略 |
| `group.dialog` | GroupDialog 展示 | staleTime: 120s |
| `group.force` | 强制刷新 | staleTime: 0 |

### 替换统计

| 操作 | 数量 |
|------|------|
| 替换为 `user.dialog` | 10 |
| 替换为 `world.location` | 6 |
| 替换为 `world.dialog` | 2 |
| 替换为 `group.dialog` | 4 |
| 替换为 `avatar.dialog` | 1 |
| 保持默认 key 不变 | 11 |
| **总计** | 34 |

---

## 组件统一化重构（shadcn Item 组件）

### 目标

将各种自定义 `div` + 独立 CSS 实现的卡片/列表项统一迁移到 shadcn `Item` 组件。

### 已完成

| 组件 | 迁移前 | 迁移后 |
|------|--------|--------|
| `FavoritesFriendItem.vue` | 自定义 div + CSS | shadcn `Item` |
| `FavoritesWorldItem.vue` | 自定义 div + CSS | shadcn `Item` |
| `FavoritesAvatarItem.vue` | 自定义 div + CSS | shadcn `Item` |
| `FavoritesAvatarLocalHistoryItem.vue` | 自定义 div + CSS | shadcn `Item` |

### 统一结构

```vue
<Item variant="outline" :style="itemStyle">
  <ItemMedia variant="image">
    <img ... />
  </ItemMedia>
  <ItemContent>
    <ItemTitle>名称</ItemTitle>
    <ItemDescription>描述</ItemDescription>
  </ItemContent>
  <ItemActions>
    <!-- DropdownMenu / Checkbox -->
  </ItemActions>
</Item>
```

### 操作菜单模式

- **默认模式**：⋮ 按钮下拉菜单（DropdownMenu）
- **右键菜单**：ContextMenu（内容与 DropdownMenu 共享）
- **编辑模式**：仅显示 Checkbox

### 方向

- `ToolItem` 组件已独立提取（图标居中、描述固定两行）
- `useUserDisplay` composable 已提取，统一用户头像和状态颜色的展示逻辑

---

## 用户展示逻辑统一化

### 目标

将 `userImage()`, `userImageFull()`, `userStatusClass()` 等散落在各组件中的直接 import 统一为 `useUserDisplay` composable。

### 当前状态：✅ 已完成

所有组件已迁移到 `useUserDisplay` composable，不再直接从 `shared/utils/user.js` 导入展示函数。

---

## Auth Store 重构

### 已完成

- 消除重复状态定义（合并冗余的 ref/state）
- 修复未 await 的 Promise 链
- 修复测试 mock 配置

---

## 文件夹命名规范

### 当前成果

- 确认所有文件夹使用 camelCase 命名
- 无单数/复数不一致问题
