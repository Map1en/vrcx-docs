# Performance Overview

> Based on the `VRCX` codebase as of **March 14, 2026**. This page now serves as a current-state overview and navigation hub. Detailed findings are split into frontend and non-frontend pages, each ordered by severity.

## Baseline Scenario

- 4000+ friends
- Large long-lived SQLite databases
- Large screenshot libraries
- VR Overlay active

At this scale, the main performance bottlenecks are no longer just “too many DOM nodes”. The current hotspots are:

- full-data recomputation on the renderer main thread
- frequent synchronous SQLite / `localStorage` / file IO
- full-frame copies and polling inside overlay rendering paths
- legacy query paths and background jobs that still lack batching

## What Changed Since The Old Analysis

### Problems that are now mitigated or no longer deserve top billing

1. `findUserByDisplayName` is no longer only a pure linear scan.

   `src/shared/utils/user.js` now accepts a `cachedUserIdsByDisplayName` index and uses it before falling back to a full scan. It is still a hot path, but it is no longer accurate to document it as the single top bottleneck across the app.

2. Friend list derivation is no longer “five fully sorted copies”.

   `src/stores/friend.js` now maintains `sortedFriends` and uses incremental `reindexSortedFriend()` updates. The old section describing five independent `Array.from(...).sort(...)` computed chains is outdated.

3. The deep-watcher search-index issue has been significantly reduced.

   The repo now has `quickSearchWorker`, `searchIndexStore.version`, and coordinator-driven index updates. The old description of “six deep watchers continuously dragging search performance down” no longer reflects the current architecture. The remaining problem is that one older main-thread quick-search path still exists.

## Current Priority Snapshot

| Severity | Issue | Page |
|----------|------|------|
| 🔴 Critical | SQLite N+1 queries during `MyAvatars` refresh | [Frontend Performance](/en/architecture/performance-frontend) |
| 🔴 Critical | Feed / GameLog / notification search still relies on `LIKE '%x%'` and `UNION ALL` | [Frontend Performance](/en/architecture/performance-frontend) |
| 🔴 Critical | `FriendList` search does full filtering and triggers extra stats on every change | [Frontend Performance](/en/architecture/performance-frontend) |
| 🔴 Critical | Electron overlay does synchronous shared-memory writes and full-frame copies every frame | [Non-Frontend Performance](/en/architecture/performance-non-frontend) |
| 🔴 Critical | `LogWatcher` still uses 1-second polling plus directory scans | [Non-Frontend Performance](/en/architecture/performance-non-frontend) |
| 🟠 High | `FriendsLocations` still rebuilds large datasets before virtualization | [Frontend Performance](/en/architecture/performance-frontend) |
| 🟠 High | Screenshot search/cache paths still combine recursive scans with N+1 cache lookups | [Non-Frontend Performance](/en/architecture/performance-non-frontend) |

## Pages

- [Frontend Performance](/en/architecture/performance-frontend)
- [Non-Frontend Performance](/en/architecture/performance-non-frontend)

## Reading Guide

- If you are chasing UI jank, input lag, or slow list interactions, start with the frontend page.
- If you are chasing overlay frame drops, log-watcher CPU usage, or slow screenshot search, start with the non-frontend page.
