# ADR-0035: Friends Page iframe Embedding and Shared Cache

- Status: Accepted
- Date: 2026-08-25

## Context

Two problems on the `/friends` page:

1. **Double LayoutShell nesting.** `/wrap-gate` is a WordPress Page served by
   the catch-all `[...uri].astro` route. It embeds `/friends` inside a
   `CoreHtml` block via `<iframe src="./friends">`. Both pages render
   `<MainLayout>` → `<LayoutShell>` (site header, sidebars, progress bars),
   so the iframe content nests a second full shell.

2. **Friend-link health cache was per-process.** `src/lib/friends.ts` cached
   the alive/dead probe results in `globalThis.__friendCache` — an in-process
   module global. Under pm2 cluster (2 instances) each worker ran its own
   probe set and cached independently, unlike the LruLink GraphQL cache which
   uses a pluggable shared backend (memory/redis/lmdb, ADR-0032).

## Decision

### 1. friends renders bare (no LayoutShell)

`src/pages/friends.astro` no longer imports `MainLayout`. It renders a content
fragment only and imports the global styles itself:

```astro
import "@/styles/tailwind.css";
import "@/styles/global.scss";
```

This follows the existing `MaintenancePage.astro` pattern. Users only reach
`/friends` through the wrap-gate iframe, so a full document shell is never
needed. The outer wrap-gate page already provides the site chrome.

### 2. Friends health cache uses the shared CacheStore

`src/api/api.ts` now exports `cacheStore` (the same backend instance used by
LruLink). `src/lib/friends.ts` stores probe results under key `friends:status`
as a `CacheEntry { data, storedAt }` — the same shape LruLink uses, so a shared
backend (lmdb on the staging server) gives cross-process coherence. The old
`globalThis.__friendCache` is removed.

A background refresh lock (`friends:refreshing`, 5 min TTL) keyed in the same
store prevents two pm2 workers from probing simultaneously when the cache is
stale. The lock is best-effort (non-atomic set on some backends); a duplicate
probe run is acceptable.

## Consequences

- `/friends` embedded in `/wrap-gate` shows content only — no nested shell.
- Friend-link health results are shared across pm2 workers when
  `GRAPHQL_CACHE_DRIVER` is a shared backend (redis/lmdb). With `memory` the
  behavior is unchanged (per-process), matching LruLink's documented limit.
- `friends:`-prefixed keys are isolated from GraphQL operation-family
  invalidation (`deleteByPrefix("GetNodeByURI:")`).
- Friends probing still happens in-process (HTTP fetch per link); the cache
  stores the classified result, not the raw JSON.

## Alternatives considered

- **Query-param / Sec-Fetch-Dest detection** for embedding — rejected: the page
  is only ever reached via iframe, so unconditional bare rendering is simpler.
- **Separate friends CacheStore instance** — rejected: reusing the exported
  `cacheStore` guarantees the exact same backend as LruLink.
- **WPGraphQL friends field** — viable but requires WordPress-side changes
  outside this repo; rejected for now.
