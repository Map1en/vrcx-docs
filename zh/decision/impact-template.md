# 影响分析模板

每次计划新功能或重大改动时复制这个模板。写代码前先填完。

## 模板

```markdown
# 影响分析：[功能名称]

**日期**：YYYY-MM-DD
**状态**：规划中 / 进行中 / 已完成 / 已放弃

## 是什么

一句话：这个功能做什么？

## 为什么

解决什么问题？哪个用户画像最受益？

## 影响的 Store

查看[依赖图](/zh/architecture/dependencies)并列出：

| Store | 如何受影响 | 风险 |
|-------|-----------|------|
| | | 🟢 低 / 🟡 中 / 🔴 高 |

## 影响的 Coordinator

| Coordinator | 需要的改动 |
|-------------|-----------|
| | |

## 影响的 View / Component

| 组件 | 改动类型 |
|------|---------|
| | 新增 / 修改 / 删除 |

## 视口兼容性

| 视口 | 行为 |
|------|------|
| 大（1000px+） | |
| 中（600-1000px） | |
| 小（400-600px） | |
| VR 覆盖层 | 不适用 / 描述 |

## 检查清单

- [ ] 检查了[功能矩阵](/zh/decision/feature-matrix)——哪些画像关心？
- [ ] 检查了[布局策略](/zh/decision/layout-strategy)——与设计原则兼容？
- [ ] 检查了[依赖图](/zh/architecture/dependencies)——知道爆炸半径？
- [ ] 需要新的 i18n key？列出来：
- [ ] 影响 updateLoop 的时机？描述：
- [ ] 影响 WebSocket 事件处理？描述：
- [ ] 需要新的 API 调用？列出端点：
- [ ] 需要新的 DB 表结构？描述：
- [ ] 性能影响？（新定时器、大列表、频繁重渲染）
- [ ] VR 模式受影响？（VR 没有 Pinia）

## 考虑过的替代方案

| 方案 | 优点 | 缺点 | 是否选用？ |
|------|------|------|-----------|
| A. | | | |
| B. | | | |

## 决策

_你决定了什么，为什么？_

## 实现后备注

_完成功能后，记录任何意外情况、额外受影响的 store、或未来参考的坑。_
```

---

## 快速参考：常见影响模式

### "我要给好友列表/表格添加新列"

典型影响：
- `friendStore` — 可能需要新的 computed 属性
- `FriendList.vue` — 列定义
- `Sidebar.vue` — 如果在侧边栏显示
- i18n — 列标题文本
- 设置 — 如果列可见性可配置

### "我要添加新的通知类型"

典型影响：
- `notificationStore` — 新类型的处理器（⚠️ 这个 store 有 15 个依赖！）
- `sharedFeedStore` — 如果出现在 feed 中
- `websocket.js` — 如果通过 WebSocket 接收
- i18n — 通知文本
- 通知设置 — 如果用户可以开关
- VR 覆盖层 — 如果应该在 VR 中显示

### "我要添加新设置"

典型影响：
- `settings/{category}.js` — 新的 reactive 属性 + 持久化
- Settings 视图标签页组件 — UI 控件
- 消费组件 — 读取设置
- `config.js` — 默认值
- i18n — 标签 + 描述文本

### "我要修改好友的显示方式"

典型影响：
- `friendStore` — 排序 / computed 属性
- `friendPresenceCoordinator` — 如果状态追踪逻辑变了
- `Sidebar.vue` + `FriendsSidebar` — 侧边栏渲染
- `FriendsLocations.vue` + `FriendLocationCard` — 位置视图
- `FriendList.vue` — 表格渲染
- VR 覆盖层 (`vr/`) — 如果好友显示变了
- i18n — 任何新标签

### "我要改 API 响应处理"

典型影响：
- `api/{entity}.js` — 请求封装
- 对应的 coordinator — `apply*()` 函数
- 实体 store — 数据结构可能变化
- Vue Query 缓存 — `entityCache.js` 新鲜度逻辑
- 所有显示该实体的视图 — 字段名变化
