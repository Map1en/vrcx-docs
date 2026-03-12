# Favorite System

## System Overview

```mermaid
graph TD
    subgraph Store["favoriteStore"]
        favorites["favorites Map<br/>type → group → items"]
        groups["favoriteGroups<br/>friend / world / avatar"]
    end

    subgraph Coordinator["favoriteCoordinator"]
        ops["• addFavorite()<br/>• removeFavorite()<br/>• moveFavorite()<br/>• renameFavoriteGroup()"]
    end

    subgraph API["api/favorite.js"]
        endpoints["GET /favorites<br/>POST /favorites<br/>DELETE /favorites/{id}<br/>GET /favorites/groups"]
    end

    subgraph Views
        favFriends["Favorites/Friends<br/>Favorite friend groups"]
        favWorlds["Favorites/Worlds<br/>Favorite world groups"]
        favAvatars["Favorites/Avatars<br/>Favorite avatar groups"]
    end

    subgraph Consumers["Other Consumers"]
        friendStore["friendStore<br/>allFavoriteFriendIds<br/>isVIP flags"]
        sidebar["Sidebar<br/>VIP friend section"]
        locations["FriendsLocations<br/>Favorite tab"]
    end

    API --> Store
    Coordinator --> Store
    Coordinator --> API
    Store --> Views
    Store --> Consumers
```

## Favorite Types

VRChat supports three types of favorites, each with their own group structure:

| Type | Max Groups | Items Per Group | Used In |
|------|-----------|----------------|---------|
| **friend** | Dynamic | Dynamic | Sidebar VIP, FriendsLocations |
| **world** | Dynamic | Dynamic | Favorites/Worlds view |
| **avatar** | Dynamic | Dynamic | Favorites/Avatars view |

## How Favorites Interact with Friends

The integration between favorites and the friend system is one of the most cross-cutting concerns:

```mermaid
flowchart LR
    subgraph FavoriteStore
        favGroups["Favorite Groups<br/>(remote from VRChat API)"]
    end
    
    subgraph FriendStore
        localFavs["localFavoriteFriends<br/>(local-only favorites)"]
        allFavIds["allFavoriteFriendIds<br/>(computed: remote + local)"]
        isVIP["friend.isVIP flag<br/>(per friend context)"]
    end
    
    subgraph Settings
        genSettings["generalSettings<br/>VRCX_isFriendsGroupPrivate"]
    end
    
    favGroups --> allFavIds
    localFavs --> allFavIds
    genSettings --> allFavIds
    allFavIds --> isVIP
```

### Remote vs Local Favorites

| Source | Where Stored | Synced | Purpose |
|--------|-------------|--------|---------|
| **Remote** | VRChat API | Yes, across devices | Official VRChat favorite groups |
| **Local** | VRCX local DB | No, this device only | VRCX-specific extra favorites |

The `allFavoriteFriendIds` computed property merges both sources, so the UI treats them identically.

## Favorite Operations

### Add Favorite
```
favoriteCoordinator.addFavorite(type, id, group)
├── Validate: not already in group
├── API: POST /favorites
├── Update favoriteStore
├── If type === "friend":
│   └── friendStore.updateSidebarFavorites()
└── Notification toast
```

### Remove Favorite
```
favoriteCoordinator.removeFavorite(type, id)
├── API: DELETE /favorites/{id}
├── Update favoriteStore
├── If type === "friend":
│   └── friendStore.updateSidebarFavorites()
└── Notification toast
```

### Favorite Group Reordering

Users can reorder favorite groups in the Sidebar settings. This affects:
- Sidebar VIP section ordering
- FriendsLocations "Favorite" tab grouping
- Favorites/Friends view group ordering

## Views

### Favorites/Friends

Data table showing friends organized by favorite group. Features:
- Group tabs/sections
- Click to open UserDialog
- Drag to reorder (within group)
- Remove from favorites

### Favorites/Worlds

Data table with world details:
- Thumbnail, name, author, capacity
- Click to open WorldDialog
- Launch options
- Remove from favorites

### Favorites/Avatars

Data table with avatar details:
- Thumbnail, name, author
- "Switch to" button
- Remove from favorites

## Key Dependencies

| Module | How It Uses Favorites |
|--------|----------------------|
| **friendStore** | Reads favorite IDs to compute VIP friends |
| **Sidebar** | Displays VIP section based on favorite groups |
| **FriendsLocations** | "Favorite" tab filters by favorite groups |
| **userCoordinator** | Updates favorites when user data changes |
| **friendRelationshipCoordinator** | Removes from favorites on unfriend |
| **avatarCoordinator** | Reads avatar favorites |
| **worldCoordinator** | Reads world favorites |
