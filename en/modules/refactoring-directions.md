# Refactoring Directions & Progress

This page tracks all discussed, in-progress, or planned refactoring directions.

## Store Purity Refactoring

### Goal

- **Store**: Only manages internal state (state, getters, simple setters)
- **Coordinator**: Handles cross-store orchestration, business flows, side effects

### Current Purity Score

| Rating | Store Count | Percentage |
|--------|-----------|------------|
| 🟢 Pure (0 cross-store writes) | 13 | 35% |
| 🟡 Light (1-4 cross-store writes) | 13 | 35% |
| 🟠 Medium (5-10 cross-store writes) | 7 | 19% |
| 🔴 Heavy (>10 cross-store writes) | 4 | 11% |

**Overall purity: 70%** (up from ~50% before refactoring)

### Completed Store → Coordinator Extractions

| Source Store | New Coordinator | Extracted Functions | Code Reduction |
|-------------|----------------|-------------------|----------------|
| `friend.js` | `friendRelationshipCoordinator.js` + `friendSyncCoordinator.js` | 10 functions | 289 lines (20%) |
| `gameLog/index.js` | `gameLogCoordinator.js` | 6 functions | 564 lines (54%) |
| `vrcx.js` | `vrcxCoordinator.js` | clearVRCXCache | 52 lines (6%) |

---

## Caller Key Caching Strategy

### Implemented Caller Variants

| Caller Key | Purpose | Strategy Difference |
|------------|---------|-------------------|
| `user.dialog` | UserDialog display | staleTime: 120s |
| `user.force` | Force refresh | staleTime: 0 |
| `avatar.dialog` | AvatarDialog display | staleTime: 120s |
| `world.dialog` | WorldDialog display | staleTime: 120s |
| `world.location` | Location/Sidebar display | Default policy |
| `group.dialog` | GroupDialog display | staleTime: 120s |
| `group.force` | Force refresh | staleTime: 0 |

---

## Component Unification (shadcn Item)

### Goal

Migrate custom `div` + standalone CSS card/list item implementations to unified shadcn `Item` component.

### Completed

| Component | Before | After |
|-----------|--------|-------|
| `FavoritesFriendItem.vue` | Custom div + CSS | shadcn `Item` |
| `FavoritesWorldItem.vue` | Custom div + CSS | shadcn `Item` |
| `FavoritesAvatarItem.vue` | Custom div + CSS | shadcn `Item` |
| `FavoritesAvatarLocalHistoryItem.vue` | Custom div + CSS | shadcn `Item` |

---

## User Display Logic Unification

All components migrated to `useUserDisplay` composable. No more direct imports from `shared/utils/user.js`.

**Status: ✅ Complete**
