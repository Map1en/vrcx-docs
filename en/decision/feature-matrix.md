# Feature Matrix

## User Personas

| Persona | Description | Window Size | Usage Pattern |
|---------|-------------|-------------|---------------|
| **Power Social** | 500+ friends, active in many groups, tracks everyone | Large (1080p+) | App always open, monitors feed constantly |
| **Casual Desktop** | 50-200 friends, checks before/after VR sessions | Medium-Large | Opens occasionally, quick glance at friends |
| **Small Window** | Runs VRCX as sidebar alongside other apps | Small (400-600px) | Needs compact info at a glance |
| **VR User** | Uses wrist overlay while in-game | Wrist overlay | Minimal interaction, glance-only |

## Feature × Persona Matrix

Legend: ✅ Core (must work well) · 🔶 Enhanced (nice to have) · ⬜ Not needed · ⛔ Not suitable

| Feature Area | Power Social | Casual Desktop | Small Window | VR User | Current Status |
|-------------|-------------|----------------|-------------|---------|----------------|
| **Sidebar - Friend List** | ✅ | ✅ | ✅ compact | ⛔ | 7 sort options, favorite groups, same-instance grouping |
| **Sidebar - Groups** | ✅ | 🔶 | ⬜ | ⛔ | Group instance list |
| **FriendsLocations** | ✅ | ✅ | 🔶 limited | ✅ adapted | Virtual scroll, 5 tabs, card scaling 50-100% |
| **Feed** | ✅ | ✅ | 🔶 | ⬜ | Social timeline with filters |
| **GameLog** | ✅ | ⬜ | ⬜ | ⬜ | Full event history table |
| **FriendList (table)** | ✅ | 🔶 | ⬜ | ⬜ | Data table with search, bulk unfriend |
| **FriendLog** | ✅ | 🔶 | ⬜ | ⬜ | Add/remove/name change history |
| **Search** | ✅ | ✅ | ✅ | ⬜ | Player/world search |
| **Favorites - Friends** | ✅ | ✅ | 🔶 | ⬜ | Favorite friend groups |
| **Favorites - Worlds** | ✅ | 🔶 | ⬜ | ⬜ | Favorite world list |
| **Favorites - Avatars** | ✅ | 🔶 | ⬜ | ⬜ | Favorite avatar list |
| **MyAvatars** | 🔶 | 🔶 | ⬜ | ⬜ | Avatar management |
| **Notifications** | ✅ | ✅ | ✅ compact | 🔶 | Invites & friend requests |
| **Moderation** | 🔶 | ⬜ | ⬜ | ⬜ | Block/kick management |
| **Charts** | 🔶 | ⬜ | ⬜ | ⬜ | Instance activity, mutual friends |
| **Tools** | 🔶 | ⬜ | ⬜ | ⬜ | Gallery, screenshot metadata, exports |
| **Settings** | ✅ | ✅ | ✅ | ⬜ | 7 tabs of configuration |
| **PlayerList** | ✅ | 🔶 | ⬜ | ⬜ | In-world player tracking |
| **Global Search** | ✅ | ✅ | ✅ | ⬜ | Ctrl+K quick search |
| **StatusBar** | 🔶 | 🔶 | ⬜ hidden | ⬜ | Server status indicators |
| **UserDialog** | ✅ | ✅ | ✅ | ⬜ | 11-tab user detail popup |
| **WorldDialog** | ✅ | ✅ | 🔶 | ⬜ | 4-tab world detail popup |
| **GroupDialog** | ✅ | 🔶 | 🔶 | ⬜ | 12-tab group management |

## Decision Notes

<!-- 
Fill this column when making decisions about features.
Format: YYYY-MM-DD: Decision made and reasoning
-->

| Feature | Decision Record |
|---------|----------------|
| Sidebar | _TODO: Consider information density vs. usability trade-off_ |
| FriendsLocations | _TODO: Tab vs. dashboard approach_ |
| Custom Dashboard | _TODO: Worth building? Only benefits large-window power users_ |
| Same-Instance Display | _TODO: Show in sidebar favorites or keep separate?_ |

## How to Use This Matrix

1. **Before adding a feature**: Find the row in the matrix. Check which personas care about it.
2. **If ⛔ for any persona**: Don't force it — either skip for that persona or provide a degraded version.
3. **If ✅ for Small Window**: The feature MUST work in ~400px width. Design compact-first.
4. **If ✅ for VR**: The feature must work with minimal interaction (tap/glance only).
5. **Update after decisions**: Add a date + note in the Decision Record column so you remember _why_ you chose.
