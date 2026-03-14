# Store Boundary & Modification Rules (Excluding Photon)

This page defines modification rules for main frontend stores only, excluding `photon`.

## Core Rules

1. Each store's state may only be modified by its own actions.
2. Cross-store collaboration is orchestrated through coordinators, never by directly writing another store's state.
3. The View layer only consumes store state and actions — no cross-module business assembly.

## Why This Matters

- Reduces side-effect propagation, avoiding "change one thing, break everything".
- Improves testability (actions and coordinators can be tested independently).
- Keeps data flow clear: input event -> coordinator -> owner store -> UI.

## ESLint Enforced Rules

The repository rules already forbid direct writes to `*Store.*`:

- Forbidden: `xxxStore.foo = ...`
- Forbidden: `xxxStore.foo++` / `xxxStore.foo--`

Rule location: `eslint.config.mjs` under `no-restricted-syntax`.

## Recommended Patterns

### Pattern A: Update State Within the Same Store

```js
// stores/friend.js
function setFriendState(userId, state) {
    const ctx = friends.value.get(userId);
    if (!ctx) return;
    ctx.state = state;
}
```

### Pattern B: Cross-Store Logic in Coordinators

```js
// coordinators/friendPresenceCoordinator.js
export function runUpdateFriendFlow(userId, stateInput) {
    const friendStore = useFriendStore();
    const sharedFeedStore = useSharedFeedStore();

    friendStore.setFriendState(userId, stateInput);
    sharedFeedStore.addEntry(/* ... */);
}
```

## Anti-Patterns (Don't Do This)

```js
// Bad: Directly modify another store's state from store A
const userStore = useUserStore();
userStore.currentUser = nextUser;
```

```js
// Bad: Assemble cross-module side effects in a component
friendStore.setFriendState(id, 'offline');
notificationStore.queueNotificationNoty(noty);
sharedFeedStore.addEntry(noty);
```

The above combined logic should be moved to a coordinator.

### Pattern C: Centralized Side-Effect Coordinators

For cross-cutting concerns (e.g. search indexing), a dedicated coordinator acts as the sole write gateway:

```js
// coordinators/searchIndexCoordinator.js
import { useSearchIndexStore } from '../stores/searchIndex';

export function syncFriendSearchIndex(ctx) {
    useSearchIndexStore().syncFriend(ctx);
}
```

```js
// coordinators/friendPresenceCoordinator.js
// Business coordinator calls the centralized coordinator, NOT the store directly
import { syncFriendSearchIndex } from './searchIndexCoordinator';

syncFriendSearchIndex(ctx);
```

> **Rule**: Only `searchIndexCoordinator` may import `useSearchIndexStore` for writes. All other coordinators, stores, and views must go through `searchIndexCoordinator`.

## Boundary Decision Quick Reference

1. Who "owns" this state?  
Answer points to the owner store.
2. Does this change involve 2+ stores?  
Yes -> put it in a coordinator.
3. Is it just a UI display toggle?  
Prefer view-local state or UI store.

## Pre-Commit Checklist

- [ ] No direct assignment to other stores' state (enforced by lint).
- [ ] Cross-store side effects are centralized in coordinators.
- [ ] Change path can be described as: event/action -> coordinator -> owner action -> UI.
- [ ] Critical paths have tests (at least 1 success flow + 1 error flow).

## Common Scenario Mapping

| Need | Correct Placement |
|------|-------------------|
| Add new field to friend card display | `friend` store computed + `FriendsLocations`/`Sidebar` components |
| Add new notification type | `notification` store + `websocket` entry + necessary coordinator |
| Modify post-login initialization | `App.vue` + `auth/user/friendSync` coordination chain |
| Change layout size & persistence | `MainLayout` + `useMainLayoutResizable` + appearance settings |
| Add new searchable entity type | `searchIndex` store + `searchIndexCoordinator` + entity coordinator |
