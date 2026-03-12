# Impact Analysis Template

Copy this template each time you plan a new feature or significant change. Fill it out before writing code.

## Template

```markdown
# Impact Analysis: [Feature Name]

**Date**: YYYY-MM-DD
**Status**: Planning / In Progress / Completed / Abandoned

## What

One sentence: what does this feature do?

## Why

What problem does it solve? Which user persona benefits most?

## Affected Stores

Check the [dependency graph](/en/architecture/dependencies) and list:

| Store | How It's Affected | Risk |
|-------|-------------------|------|
| | | 🟢 Low / 🟡 Medium / 🔴 High |

## Affected Coordinators

| Coordinator | Change Needed |
|-------------|---------------|
| | |

## Affected Views / Components

| Component | Change Type |
|-----------|-------------|
| | New / Modified / Removed |

## Viewport Compatibility

| Viewport | Behavior |
|----------|----------|
| Large (1000px+) | |
| Medium (600-1000px) | |
| Small (400-600px) | |
| VR Overlay | N/A or describe |

## Checklist

- [ ] Checked [feature matrix](/en/decision/feature-matrix) — which personas care?
- [ ] Checked [layout strategy](/en/decision/layout-strategy) — compatible with design principles?
- [ ] Checked [dependencies](/en/architecture/dependencies) — know the blast radius?
- [ ] New i18n keys needed? Listed them:
- [ ] Affects updateLoop timing? Describe:
- [ ] Affects WebSocket event handling? Describe:
- [ ] Needs new API calls? List endpoints:
- [ ] Needs new DB schema? Describe:
- [ ] Performance impact? (new timers, large lists, frequent re-renders)
- [ ] VR mode affected? (VR has no Pinia)

## Alternatives Considered

| Option | Pros | Cons | Chosen? |
|--------|------|------|---------|
| A. | | | |
| B. | | | |

## Decision

_What did you decide and why?_

## Post-Implementation Notes

_After completing the feature, note anything unexpected, any additional stores affected, or gotchas for future reference._
```

---

## Quick Reference: Common Impact Patterns

### "I'm adding a new column to a friend list / table"

Typical impact:
- `friendStore` — may need new computed property
- `FriendList.vue` — column definition
- `Sidebar.vue` — if displayed in sidebar
- i18n — column header text
- Settings — if column visibility is configurable

### "I'm adding a new notification type"

Typical impact:
- `notificationStore` — handler for new type (⚠️ this store has 15 dependencies!)
- `sharedFeedStore` — if it appears in feed
- `websocket.js` — if received via WebSocket
- i18n — notification text
- Notification settings — if user can toggle it
- VR overlay — if it should show in VR

### "I'm adding a new setting"

Typical impact:
- `settings/{category}.js` — new reactive property + persistence
- Settings view tab component — UI control
- Consuming component — reads the setting
- `config.js` — default value
- i18n — label + description text

### "I'm modifying how friends are displayed"

Typical impact:
- `friendStore` — sorting / computed properties
- `friendPresenceCoordinator` — if state tracking changes
- `Sidebar.vue` + `FriendsSidebar` — sidebar rendering
- `FriendsLocations.vue` + `FriendLocationCard` — location view
- `FriendList.vue` — table rendering
- VR overlay (`vr/`) — if friend display changes
- i18n — any new labels

### "I'm changing the API response handling"

Typical impact:
- `api/{entity}.js` — request wrapper
- Corresponding coordinator — `apply*()` functions
- Entity store — data shape may change
- Vue Query cache — `entityCache.js` recency logic
- All views that display the entity — field name changes
