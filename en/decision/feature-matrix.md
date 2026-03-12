# Feature Matrix

## User Personas

### Dimension Overview

User behavior is determined by three **independent** dimensions that should not be conflated:

| Dimension | Description |
|-----------|-------------|
| **Display Context** | The physical/virtual environment where VRCX runs — determines available space and interaction precision |
| **Engagement Depth** | How intensely the user interacts with VRCX — not directly correlated with friend count |
| **Usage Timing** | Before VR, during VR, or after VR — strongly correlated with display context |

> **Key Insight**: Friend count ≠ engagement depth. A user with 300 friends may deeply manage avatars and research players; a user with 1000 friends may only glance at Feed in a corner. Very few friends (<50) almost certainly means light usage, but many friends does not imply heavy usage.

### Display Contexts

| Context | Typical Scenario | Window Size | Interaction Capability |
|---------|-----------------|-------------|----------------------|
| **Desktop** | Pre-VR planning, post-VR review, daily use | Medium-Large to fullscreen (800px+) | Full mouse & keyboard |
| **Desktop Small** | Pinned in screen corner alongside other apps | Small (400-600px) | Full mouse & keyboard, but space-constrained |
| **VR Virtual Desktop** | In-game via Virtual Desktop or similar tools | Medium, lower resolution | VR controllers — can click/scroll/type, lower precision |
| **VR Wrist Overlay** | In-game wrist overlay | Very small | Basic taps only |

### Engagement Depths

| Depth | Description | Typical Actions |
|-------|-------------|-----------------|
| **Deep Management** | Active research and management, extended sessions | View player details (registration date, mutual friends), manage/switch avatars, upload avatar photos, review logs, group management |
| **Daily Social** | Purposeful use, moderate interaction | Check friend locations, search players/worlds, handle notifications, browse favorites, switch avatars |
| **Passive Monitoring** | Background app, occasional glance | Check Feed (who came online, who went to an interesting world), server status; occasionally escalate to deeper interaction when something catches attention |

### Usage Timing

| Timing | Associated Context | Description |
|--------|-------------------|-------------|
| **Pre-VR** | Desktop / Desktop Small | Plan where to go, find avatars, check who's online |
| **During VR** | VR Virtual Desktop / Wrist Overlay | View player info, switch avatars, handle notifications, glance at feed |
| **Post-VR** | Desktop / Desktop Small | Review logs, research players, manage favorites — same experience as pre-VR |

### Common Combinations (Actual Personas)

The matrix evaluates features against these three high-frequency combinations:

| Persona | Display Context | Engagement Depth | Usage Timing | Typical Scenario |
|---------|----------------|-----------------|--------------|-----------------|
| **A. Desktop Deep** | Desktop | Deep Management | Pre/Post-VR | Open VRCX to find avatars, research player details (registration date, mutual friends), plan which world to visit, review logs |
| **B. Corner Monitor** | Desktop Small | Passive Monitoring | Always on | Pinned in screen corner, watching Feed for who came online or went to an interesting world, checking server status; occasionally clicking into dialogs for details |
| **C. In-VR Interactive** | VR Virtual Desktop | Daily Social | During VR | In-game: view player details, switch avatars, upload avatar photos, handle notifications |

> **VR Wrist Overlay**: The current implementation is stable and not within scope for redesign. When making overlay-related decisions, reference Persona C with further-narrowed interaction capabilities.

## Feature × Persona Matrix

Legend: ✅ Core (must work well) · 🔶 Enhanced (nice to have) · ⬜ Not needed

| Feature Area | A. Desktop Deep | B. Corner Monitor | C. In-VR Interactive | Current Status |
|-------------|----------------|-------------------|---------------------|----------------|
| **Sidebar - Friend List** | ✅ | ✅ compact | ✅ | 7 sort options, favorite groups, same-instance grouping |
| **Sidebar - Groups** | ✅ | ⬜ | 🔶 view rooms | Group instance list |
| **FriendsLocations** | ✅ | 🔶 limited | ✅ | Virtual scroll, 5 tabs, card scaling 50-100% |
| **Feed** | ✅ | ✅ primary use | 🔶 | Social timeline with filters |
| **GameLog** | ✅ | ⬜ | ⬜ | Full event history table |
| **FriendList (table)** | ✅ | ⬜ | ⬜ | Data table with search, bulk unfriend |
| **FriendLog** | ✅ | ⬜ | ⬜ | Add/remove/name change history |
| **Search** | ✅ | 🔶 | ✅ | Player/world search |
| **Favorites - Friends** | ✅ | 🔶 | 🔶 | Favorite friend groups |
| **Favorites - Worlds** | ✅ | ⬜ | 🔶 | Favorite world list |
| **Favorites - Avatars** | ✅ | ⬜ | ✅ core switching | Favorite avatar list |
| **MyAvatars** | ✅ manage+upload | ⬜ | ✅ switch+upload | Avatar management, photo upload to VRC (displayed as avatar thumbnail in-game) |
| **Notifications** | ✅ | ✅ compact | ✅ | Invites & friend requests |
| **Moderation** | 🔶 | ⬜ | ⬜ | Block/kick management |
| **Charts** | 🔶 | ⬜ | ⬜ | Instance activity, mutual friends |
| **Tools** | 🔶 | ⬜ | ⬜ | Gallery, screenshot metadata, exports |
| **Settings** | ✅ | 🔶 | ⬜ | 7 tabs of configuration |
| **PlayerList** | ✅ | ⬜ | 🔶 | In-world player tracking |
| **Global Search** | ✅ | ✅ | 🔶 | Ctrl+K quick search |
| **StatusBar** | 🔶 | ✅ server status | ⬜ | Server status indicators |
| **UserDialog** | ✅ deep research | 🔶 escalation from Feed | ✅ view details | 11-tab user detail popup (registration date, mutual friends, etc.) |
| **WorldDialog** | ✅ | 🔶 escalation from Feed | 🔶 | 4-tab world detail popup |
| **GroupDialog** | ✅ managers / 🔶 regular | ⬜ | 🔶 view info | 12-tab group management (see group notes below) |

### Group Feature Notes

Group needs are clearly split but low-change — frozen for now:

- **Group managers**: Use management tools (member management, permissions, etc.) — a deep feature of Persona A
- **Regular group members**: Primarily view group info and group room listings — shallow interaction
- Group features see few new requirements; not every user actively uses groups. Friends/avatars/worlds are more universally needed

### Dialogs and Passive Monitor Escalation

The four main dialogs (User / World / Group / Avatar) are mature and stable — their form factor is unlikely to change significantly. However, Passive Monitor users (Persona B) exhibit **escalation behavior**:

1. See a friend went to an interesting world in Feed → click → WorldDialog
2. See a friend status change in Feed → click → UserDialog
3. See a friend online in Sidebar → click → UserDialog

Dialogs retain their current full-size popup form. When Persona B users trigger a dialog, the "window takeover" experience is accepted.

## Decision Notes

<!-- 
Fill this column when making decisions about features.
Format: YYYY-MM-DD: Decision made and reasoning
-->

| Feature | Decision Record |
|---------|----------------|
| Persona Model | 2026-03-12: Restructured from single-dimension (friend count + window size) to three independent dimensions (Display Context × Engagement Depth × Usage Timing), converged into A/B/C high-frequency combinations. Friend count is not a persona-defining factor. |
| VR Overlay | 2026-03-12: Current implementation is stable, excluded from redesign scope. VR interaction targets Virtual Desktop as the primary design context. |
| Group Features | 2026-03-12: Manager/regular user needs diverge, but direction sees little change — frozen, no major rework planned. |
| Dialog Form Factor | 2026-03-12: Four main dialogs are mature — retain full-size popup form. Persona B accepts "window takeover" on escalation. |
| Avatar Features | 2026-03-12: Avatar switching and photo upload are core needs for In-VR Interactive (Persona C), as VRC's native UI/UX is poor — VRCX fills a supplementary avatar management role. |
| Sidebar | _TODO: Consider information density vs. usability trade-off_ |
| FriendsLocations | _TODO: Tab vs. dashboard approach_ |
| Custom Dashboard | _TODO: Worth building? Persona A benefits most, Persona B may need a simplified version_ |
| Same-Instance Display | _TODO: Show in sidebar favorites or keep separate?_ |

## How to Use This Matrix

1. **Before adding a feature**: Find the row in the matrix. Check the need level for each of the A/B/C personas.
2. **If ⬜ for a persona**: Don't force the feature for that persona — it's explicitly out of scope.
3. **If ✅ for B (Corner Monitor)**: The feature **must** work in ~400px width. Design compact-first.
4. **If ✅ for C (In-VR)**: The feature must work with low-precision interaction (VR controllers). Consider click target size and text readability.
5. **Watch for escalation**: Persona B users will escalate from passive browsing to deep interaction (clicking into dialogs) — ensure this path is smooth.
6. **Update after decisions**: Add a date + note in the Decision Record column so you remember _why_ you chose.
