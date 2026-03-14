# Store 边界与修改规则（排除 Photon）

这页只定义主前端 store 的改动规则，不包含 `photon`。

## 核心规则

1. 每个 store 的状态只能由它自己的 action 修改。
2. 跨 store 协作通过 coordinator 编排，不直接写对方状态。
3. View 层只消费 store 状态和 action，不做跨模块业务拼装。

## 为什么必须这样

- 降低副作用扩散，避免“改一处炸全局”。
- 提高可测试性（action 和 coordinator 可独立测）。
- 保持数据流清晰：输入事件 -> coordinator -> owner store -> UI。

## ESLint 已强制的规则

仓库规则已禁止直接写 `*Store.*`：

- 禁止：`xxxStore.foo = ...`
- 禁止：`xxxStore.foo++` / `xxxStore.foo--`

规则位置：`eslint.config.mjs` 的 `no-restricted-syntax`。

## 推荐模式

### 模式 A：同一个 store 内部更新状态

```js
// stores/friend.js
function setFriendState(userId, state) {
    const ctx = friends.value.get(userId);
    if (!ctx) return;
    ctx.state = state;
}
```

### 模式 B：跨 store 逻辑放 coordinator

```js
// coordinators/friendPresenceCoordinator.js
export function runUpdateFriendFlow(userId, stateInput) {
    const friendStore = useFriendStore();
    const sharedFeedStore = useSharedFeedStore();

    friendStore.setFriendState(userId, stateInput);
    sharedFeedStore.addEntry(/* ... */);
}
```

## 反模式（不要做）

```js
// Bad: 在 A store 里直接改 B store 状态
const userStore = useUserStore();
userStore.currentUser = nextUser;
```

```js
// Bad: 在组件里直接拼跨模块副作用
friendStore.setFriendState(id, 'offline');
notificationStore.queueNotificationNoty(noty);
sharedFeedStore.addEntry(noty);
```

上面这种组合逻辑应迁移到 coordinator。

### 模式 C：集中化副作用 Coordinator

对于横切关注点（如搜索索引），用专用 coordinator 作为唯一写入网关：

```js
// coordinators/searchIndexCoordinator.js
import { useSearchIndexStore } from '../stores/searchIndex';

export function syncFriendSearchIndex(ctx) {
    useSearchIndexStore().syncFriend(ctx);
}
```

```js
// coordinators/friendPresenceCoordinator.js
// 业务 coordinator 调用集中 coordinator，而不是直接调用 store
import { syncFriendSearchIndex } from './searchIndexCoordinator';

syncFriendSearchIndex(ctx);
```

> **规则**：只有 `searchIndexCoordinator` 可以 import `useSearchIndexStore` 进行写操作。所有其他 coordinator、store 和 view 必须通过 `searchIndexCoordinator`。

## 边界判定速查

1. 这个状态是谁“拥有”的？  
答案指向 owner store。
2. 这次改动是否涉及 2 个以上 store？  
是 -> 放 coordinator。
3. 只是 UI 展示切换吗？  
优先放 view 本地状态或 UI store。

## 提交前检查

- [ ] 没有直接给其他 store 赋值（通过 lint）。
- [ ] 跨 store 副作用集中在 coordinator。
- [ ] 变更路径可描述为：事件/操作 -> coordinator -> owner action -> UI。
- [ ] 关键路径有测试（至少 1 条成功流 + 1 条异常流）。

## 常见场景对应

| 需求 | 正确放置 |
|------|----------|
| 新增好友卡片字段展示 | `friend` store computed + `FriendsLocations`/`Sidebar` 组件 |
| 新增通知类型 | `notification` store + `websocket` 入口 + 必要 coordinator |
| 改登录后初始化行为 | `App.vue` + `auth/user/friendSync` 协调链 |
| 改布局尺寸与持久化 | `MainLayout` + `useMainLayoutResizable` + appearance settings |
| 新增可搜索实体类型 | `searchIndex` store + `searchIndexCoordinator` + 实体 coordinator |

