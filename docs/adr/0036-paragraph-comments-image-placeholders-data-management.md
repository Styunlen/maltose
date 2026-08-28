# ADR-0036: Paragraph Comments, Image Placeholders, and Theme Data Management

- Status: Accepted
- Date: 2026-08-28

## Context

Three independent feature areas were designed together through a structured
interview (grill-with-docs) because they share one seam: **extra per-entity data
on WordPress-native records** (comments, posts, users).

1. **Paragraph comments** (Zhihu-style): anchor comments to individual content
   blocks (`CoreParagraph` / `CoreListItem`) instead of only the article footer.
   The blog already renders Gutenberg `editorBlocks` through a React island, and
   every block carries a stable `clientId` (WPGraphQL `editorBlocks.clientId`,
   persisted in block comment delimiters) — a natural anchor key.

2. **Image loading placeholders**: `LazyImage.tsx` (article images) has no
   placeholder animation; `react-lazy-img` class has no CSS rules at all, so
   article images render as a bare 1×1 pixel until swap. PostCard/StickyCarousel
   images use a separate vanilla-lazyload path that already shows a spinner.

3. **Theme data management**: the theme writes to `wp_postmeta` (`views`),
   `wp_usermeta` (`maltose_last_login`, `maltose_needs_profile`), `wp_options`
   (10 `maltose_*` keys), transients (geo stats / OTP / view anti-abuse), plus an
   unbounded PII-bearing OTP log file — with **no uninstall hook and no unified
   cleanup** (existing "数据清理" only deletes the 10 options). Future features
   (comment likes, emoji reactions, paragraph favorites) would add more scattered
   meta.

Real paragraph-length stats (30 posts, 792 paragraphs + 186 list items):
paragraphs p50=43 chars, **p75=75**, p90=112; list items p50=36, p75=66, p90=90.

## Decision

### 1. Paragraph comments — unified stream + optional `blockReference`

- **Data model**: no separate comment stream. Paragraph comments are ordinary
  comments with an optional `blockReference` stored as `comment_meta`
  (`maltose_block_ref`), following the existing `register_graphql_field`
  pattern (`commentGeo` / `agentPublic`).
- **Anchor structure**: `{ clientId, snippet }` — `clientId` locates the block;
  `snippet` is a readable snapshot of the paragraph text at anchor time for
  re-binding. **Snippet = min(full text, 80 chars)**, no compression (see
  Alternatives). 80 chars covers p75 of paragraphs (78%) and p90 of list items.
- **UI**: hover-reveal comment affordance per block (mobile: tap fallback);
  inline expansion below the block showing that block's comments + composer;
  collapse animation; live comment-count +1; replies reuse the existing reply
  popup. SSR emits per-block comment counts (aggregated client-side from the
  existing `GetNodeByURI` comment list — zero extra requests).
- **Two-way sync**: paragraph comments appear in the global comment section and
  vice versa — same data, filtered by anchor.
- **Permissions**: reuse existing auth. All logged-in users can comment on any
  block; re-binding an orphaned comment is limited to **the comment author**
  (blog owner is a superset via `BLOG_OWNER_USER_IDS`).
- **Orphan handling**: when a block's `clientId` no longer exists in the post,
  its comments are "orphaned": shown in the comment section with a
  "段落已删除" marker, and the author can re-bind to any paragraph
  (two entry points: inline re-bind in the comment section, and an admin
  orphan-comment management page). No limit on how many comments anchor to one
  block.
- **Rendering changes**: `WordPressBlocks.tsx` emits `data-block-id={clientId}`;
  `Single.astro` threads comment data down; `create.ts` accepts
  `blockReference`; WP registers the field on `CreateCommentInput` + persists
  via the already-hooked `comment_post` action.

### 2. Image loading placeholders

- **PostCard cover images** (vanilla-lazyload path): shimmer skeleton —
  neutral gray (`--muted` base + light sweep), consistent with the existing
  `Skeleton` component (`animate-pulse` + `bg-accent` precedent). Custom
  `@keyframes shimmer` in `tailwind.css` `@layer anime` (tw-animate-css has no
  shimmer keyframe).
- **Article images** (`LazyImage`): blur-up via solid `--muted` block + existing
  spinner SVG + fade-in on load. Add CSS rules for `img.react-lazy-img`
  (currently none). `LazyImage.tsx` gains an `onLoad`-driven state
  (today it only tracks in-viewport, no transition).
- **No backend changes**: no low-quality placeholder thumbnails from WP.

### 3. Theme data management — unified registry, layered storage

- **Storage stays in native WP tables** (no blanket custom table):
  - post_meta `views` (unchanged key — wp-postviews plugin compatibility),
  - comment_meta `maltose_block_ref` (cascade-deletes with the comment),
  - options (10 fixed `maltose_*` keys),
  - transients (OTP / geo cache / view anti-abuse — TTL self-cleans),
  - **future "who liked this" detail data → dedicated table only then**
    (counts stay in meta; detail/anti-duplicate data gets a table).
- **`MaltoseDataRegistry`** (`includes/class-data-registry.php`): one class
  registers every data definition (key → medium / cleanup class / export
  class). Future features register entries and automatically gain
  export/import/uninstall coverage — this is the answer to "scattered meta
  becomes unmanageable", without over-engineering a generic table.
- **Export/import**: admin page with per-category checkboxes → JSON export;
  import distinguishes **same-site restore** (by ID) vs **cross-site
  migration** (by matchable keys: post slug, block `clientId`; unmatched rows
  reported and skipped).
- **Uninstall**: an uninstall wizard (export ZIP / export-then-keep /
  clean / keep) driven by the registry. **Comments are never auto-deleted**
  (user assets). Entry points: permanent admin page + `switch_theme` hook
  guidance when leaving the theme.
- **OTP-created users**: tagged with `maltose_otp_user` user_meta. A user who
  sets a real password is reclassified as normal (marker removed via hook +
  uninstall-time fallback check). The wizard lists remaining tagged users with
  the warning "these accounts have no real password; deleting them is
  recommended when switching themes".

## Consequences

- Paragraph comments inherit the full existing comment pipeline (auth, geo,
  signature proxy, LRU invalidation on `GetNodeByURI:`), no new comment
  infrastructure.
- Comment data is never destroyed by theme removal; only theme-owned
  registries are cleaned per the wizard choice.
- Future comment-interaction features (likes/emoji) plug into the registry and
  choose meta vs table by data shape (count vs detail).
- Image placeholder styling diverges deliberately per surface (shimmer cards vs
  blur-up article images) — a conscious design decision, not an accident.
- Snippet snapshots cost ~80 B × comments per block; dedup by `clientId`
  aggregation avoids repeating identical snapshots in the UI.

## Alternatives considered

- **Separate paragraph-comment stream** — rejected: duplicates the whole
  comment pipeline (auth/geo/proxy/cache); the existing flat list + `parent`
  hierarchy already supports anchoring as an optional field.
- **Text-selection anchoring (Medium/Zhihu PC style)** — rejected: 3–5× the
  cost (selection→DOM mapping, offset storage, all offsets break on edit);
  block-level `clientId` anchoring survives text edits.
- **Snippet compression (gzip/zstd)** — rejected: at p75 ≈ 75 chars (~225 B),
  compression is net-negative (header + dictionary overhead), breaks
  human-readable export, and per-post volume is negligible (~11 KB for 50
  comments). Dedup, not compression, is the right optimization.
- **Generic custom table for all theme data** — rejected: transients and the
  OTP log still need separate handling; native meta gives cascade delete +
  caching + transactions for free. Only detail-shaped future data (likers)
  warrants a table.
- **Separate plugin for data management** — rejected: the theme is the data
  provider (ADR-0001/0002 precedent); the registry ships inside the theme.
