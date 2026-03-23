# VRCX Internal Docs

This documentation has two goals:

- explain the frontend at the structural level instead of drowning in low-value implementation detail
- shorten the path from a feature question or performance complaint to the real code entry points

## Start Here

- [System Overview](/en/architecture/overview): how the app boots, how the major layers cooperate, and which paths matter most
- [Frontend Change Entry Map](/en/architecture/change-entry-map): where to look first when changing a feature
- [Performance Overview](/en/architecture/performance-analysis): what is still a real hotspot, what has already improved, and where priority should go now

## Current Focus

### Architecture

The docs now focus on stable structure rather than volatile counts:

- the startup order in `app.js` and `App.vue`
- the main feature path of `view -> store -> coordinator -> service`
- the realtime update path driven by WebSocket events
- how workers, SQLite, and config persistence connect back into the main thread

### Performance

Performance analysis is centered on user-visible bottlenecks:

- whether typing and filtering paths still trigger full recomputation
- whether large lists do heavy work before virtualization even starts
- whether SQLite paths fall back to `LIKE '%x%'`, `UNION ALL`, or N+1 access patterns
- whether config writes, log processing, or background refresh work happen synchronously in hot interaction paths

### Engineering

The docs follow the boundaries the codebase actually uses:

- `store` owns state and local derivations
- `coordinator` owns cross-store orchestration and side effects
- `service` owns request, database, config, and bridge concerns
- `worker` owns calculations that can be pushed off the main thread

## Reading Guide

- New to the project: start with [System Overview](/en/architecture/overview)
- Changing a page or feature: then read [Frontend Change Entry Map](/en/architecture/change-entry-map)
- Investigating lag, input delay, or list pressure: go straight to [Performance Overview](/en/architecture/performance-analysis) and [Frontend Performance](/en/architecture/performance-frontend)
