# Web Worker Architecture

The Web Worker system offloads CPU-intensive computations (graph layout, fuzzy search) to dedicated worker threads to prevent UI blocking.

## Overview

| Worker | Status | File |
|--------|--------|------|
| graphLayoutWorker | ✅ Implemented | `src/workers/graphLayoutWorker.js` |
| quickSearchWorker | ✅ Implemented | `src/stores/quickSearchWorker.js` |
| Photon Worker | 📋 Planned | Waiting for `photon.js` rewrite |
| Charts Worker | 📋 Optional | Not a persistent bottleneck |

## Implemented Workers

### graphLayoutWorker (Graph Layout Computation)

**Problem**: `forceAtlas2.assign()` synchronously runs 300-1500 iterations on the main thread, **blocking UI for 1-5 seconds** on graphs with hundreds of nodes.

**Solution**: Move FA2 + noverlap computation to a dedicated Worker.

```mermaid
sequenceDiagram
    participant Vue as MutualFriends.vue
    participant Worker as graphLayoutWorker
    
    Vue->>Worker: postMessage({ type: 'run', ... })
    Note over Worker: FA2 layout computation<br/>300-1500 iterations
    Note over Worker: noverlap de-overlap
    Worker-->>Vue: postMessage({ type: 'result', positions })
    Vue->>Vue: applyGraph(positions)
```

| Item | Details |
|------|---------|
| **Message Protocol** | `{ type: 'run', requestId, graph, settings }` → `{ type: 'result', requestId, positions }` |
| **Race Protection** | Uses `requestId` to prevent concurrent calls from overwriting results |
| **Build Output** | ~82KB |

### quickSearchWorker (Quick Search)

**Problem**: `removeConfusables()` (Unicode normalization + Map lookups + regex) + `localeIncludes()` causes jank on every keystroke with 1000+ friends.

**Solution**: Move search index and search logic entirely to a Worker.

```mermaid
sequenceDiagram
    participant Store as quickSearch.js
    participant Worker as quickSearchWorker
    
    Note over Store: searchIndexStore.version changes
    Store->>Worker: { type: 'updateIndex', payload: { friends, avatars, ... } }
    
    Note over Store: User types query
    Store->>Worker: { type: 'search', payload: { seq, query, ... } }
    Worker-->>Store: { type: 'searchResult', payload: { seq, friends, ... } }
    Note over Store: seq === searchSeq? → update results
```

| Item | Details |
|------|---------|
| **Message Protocol** | `updateIndex` (sync data snapshot) + `search` (execute search) |
| **Race Protection** | Incrementing `searchSeq` counter; stale results are discarded |
| **Build Output** | ~6KB |

## Future Direction

### P2: Photon Event Parsing Worker

`photon.js` (1891 lines, 72KB) is deeply coupled with 18 stores. Current decision: wait for planned rewrite.

### P3: Charts Data Processing Worker

Optional optimization — only triggered on initial load/date switch, not a persistent bottleneck.

### Not Suitable for Workers

| Module | Reason |
|--------|--------|
| **WebSocket handling** | Needs direct Pinia store access |
| **updateLoop** | Requires `AppApi`/`LogWatcher` main-thread bindings |
| **GameLog processing** | Each log entry immediately updates multiple stores |
| **SQLite queries** | `window.SQLite` binding inaccessible from Worker |
