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

## Update 2026-08-28: Stable block anchoring + comment-section enhancements

### Context

Implementation surfaced two problems and three enhancement requests:

1. **`clientId` is not stable.** The `editorBlocks.clientId` field is served by
   the `wp-graphql-content-blocks` plugin, which calls PHP `uniqid()` on every
   block, every request — it is never read from the block comment delimiter and
   is not persisted anywhere (confirmed in plugin source and README). Manually
   adding `{"clientId":"…"}` to `post_content` is ignored because the resolver
   overwrites the top-level `clientId` key unconditionally (it reads
   `$block['clientId']`, never `$block['attrs']['clientId']`). Paragraph-comment
   anchoring therefore drifted across requests.
2. **Comment timestamps show UTC.** WP stores `comment_date` in the server
   timezone but WPGraphQL returns it without an offset; the frontend
   `dayjs(comment.date).format()` treats it as browser-local time, so visitors
   outside UTC+8 see a 8-hour shift.
3. Enhancement requests: gate the orphan-rebind UI behind permission; show a
   distinct paragraph-quote on anchored comments; fix timezone display.

### Decisions

**A. Stable block anchor (clientId)**

- Register `wpgraphql_content_blocks_resolve_blocks` filter in the theme that
  rewrites each block's `clientId`:
  1. if `attrs.clientId` exists (persisted UUID in `post_content`) → use it;
  2. else fall back to `md5(strip_tags(innerHTML)) . "#" . occurrence-index`
     (stable per content, disambiguates repeated identical paragraphs).
- Save hook (`content_save_pre`) auto-injects a `wp_generate_uuid4()` into any
  block missing `clientId`, writing it back to `post_content` (new posts
  persist from first save).
- One-click migration button on the theme settings page backfills `clientId`
  for all historical posts + pages (skips blocks that already have one).
- Justification: persistent UUID is the only fully stable anchor (Gutenberg's
  own design); the content-hash fallback keeps old posts stable until migrated
  and covers any residual drift. Duplicate-paragraph insertion still shifts the
  hash+index fallback, but identical text means no visible change; the existing
  orphan-rebind flow is the safety net.

**B. Timezone-aware comment times**

- `comment.date` from WP is UTC (no offset). New `src/lib/time.ts` helper:
  parse with `dayjs.utc(date)`, render in visitor-local timezone.
- Display rule: <7 days → relative (`刚刚`/`X 分钟前`/`X 小时前`/`昨天`/`X 天前`);
  ≥7 days → absolute (`MM-DD HH:mm`, cross-year includes `YYYY-`). `title` always
  carries the full local time; `datetime` attribute keeps the raw value.
- Sorting also parses via `dayjs.utc(...)` so order is correct for non-UTC
  visitors.
- Applied site-wide (comment section, article page, sidebar, carousel) via the
  shared helper.

**C. Rebind permission gating**

- Rebind button shows only when the current user is the comment author or a
  blog owner (`isOwn || isOwner`), in both the main list and the reply popup
  (popup now receives `onRebind`). Users without permission see only the
  "原段落已删除" orphan notice. Email-fallback `isOwn` is removed from the rebind
  gate (server only honors `databaseId` matches).

**D. Paragraph quote on anchored comments**

- Anchored comments show a paragraph-quote chip (main list and popup):
  lucide `pilcrow` icon, primary-colour solid left border, faint primary
  background — visually distinct from the reply-quote chip (`.chat-parent-quote`).
  Content is the stored plain-text `snippet` (≤80 chars), CSS-clamped to 2 lines
  with the full text in `title`.
- Clicking scrolls to the anchored block (if it exists) and flashes a
  `.block-ref-highlight` outline for ~2 s. Orphaned anchors render the snippet as
  static text alongside the existing orphan notice; rebind button follows rule C.
- Own comments (`data-align="end"`) get a right-side variant, mirroring the
  reply-quote direction handling.

### Consequences

- Paragraph anchors are stable across requests once migrated; new posts persist
  UUIDs automatically. Migration is idempotent and non-destructive.
- Timestamps are correct per visitor locale site-wide; relative/absolute split
  matches the Q7/Q11/Q22 design.
- Rebind UI is permission-correct in both list and popup.
- Paragraph quotes reuse the already-stored snippet; no schema change.

## Update 2026-08-29: Nested-anchor stability + comment-section crash fix

### Context

Real-world testing surfaced three defects:

1. **Comment section vanishes after a paragraph comment.** The `RefreshComments`
   query used by `CommentSection` on the `maltose:comment-posted` event fetched
   only `databaseId/content/blockReference`. A brand-new comment (no pre-existing
   record to merge rich fields from) therefore rendered with `author` undefined,
   and `ChatBubble`'s unconditional `comment.author.node.*` access threw during
   render. With no error boundary anywhere, React unmounted the whole island.
2. **All nested blocks lost their parents.** Our `applyStableClientId` filter
   rewrote every block's `clientId` to a stable value but did not touch child
   `parentClientId`s. The plugin flattens the block tree *before* our filter
   runs, so every nested block (list items, quote/columns/group children) carried
   a `parentClientId` pointing at the pre-rewrite `uniqid()` — which no longer
   existed in the output. The frontend tree-rebuild (`blockMap.has(parentClientId)`)
   failed for all 37 nested blocks: columns rendered empty, list/quote/group
   content escaped its container, and nested paragraphs lost their anchors.
3. **Raw-HTML blocks (quote/html/table/code/preformatted) had no comment affordance.**
   Only `CoreParagraph`/`CoreListItem` were commentable.

### Decisions

**A. Full-field refresh + error boundary (bug 1).**

- `RefreshComments` now requests the same field set as `GetNodeByURI` (id,
  databaseId, parentId, parentDatabaseId, content, author, date, agentPublic,
  agent, commentGeo, blockReference) so brand-new comments render completely.
- `CommentSection` is wrapped in a new `ErrorBoundary` so a single malformed
  record can never unmount the entire section again.

**B. Rewrite `parentClientId` alongside `clientId` (bug 2).**

- `applyStableClientId` now runs in three passes over the *flattened* block
  array: (1) assign stable `clientId` per block (persisted `attrs.clientId`
  UUID first, content-hash+seq fallback), (2) collect an old→new clientId map,
  (3) rewrite every block's `parentClientId` through that map. This restores
  tree integrity for all nesting (lists, columns, quotes, groups, tables) and
  makes nested paragraphs independently anchorable again.
- The earlier `fixInnerBlocks` recursion was removed: it assumed nested
  `innerBlocks` were still attached, but the plugin flattens before our filter.

**C. Broaden block-level commentability (bug 3a).**

- Commentable block types extended from `{CoreParagraph, CoreListItem}` to also
  include `CoreQuote/CorePullquote, CoreHtml/CoreFreeform, CoreTable, CoreCode,
  CorePreformatted`. These anchor the whole block (their content is a raw HTML
  string without per-paragraph clientIds); snippet = stripped text of the block.
- Nested `CoreParagraph`s inside a quote become independently anchorable once
  decision B restores their parentClientId linkage.

**D. Unify paragraph-panel and footer interactions (bug 3b).**

- Extracted `ChatBubble`, `InlineEditBox`, `ReplyPopupModal`, `FlatComment`,
  `buildCommentMap`, `groupByAuthor` out of `CommentSection.tsx` into
  `src/components/comment/` shared module. Both the footer comment section and
  the paragraph popup now render the same bubbles with the full interaction set
  (avatar, author, time, UA/geo, reply, edit, delete, paragraph-quote chip,
  orphan rebind).
- `ParagraphComments` now builds `FlatComment`s via `buildCommentMap`, groups by
  author, renders `ChatBubble`, and wires edit through the shared edit-store
  with a new `"panel"` scope. Its refresh query was completed to the full field
  set and merged (not wholesale-replaced) so new comments render completely.
- The footer section's rendered output is unchanged (same components, same
  props flow); only the import origin moved.

### Consequences

- Comment section survives refresh of brand-new comments; a render exception in
  one bubble shows a fallback instead of killing the whole island.
- All 121 blocks in the test post rebuild their tree correctly (37 nested,
  0 orphaned); columns/lists/quotes render their children again.
- Quote/html/table/code/preformatted blocks show a hover comment affordance;
  list items each get an independent anchor.
- Historical posts do not need re-migration: the parentClientId rewrite is
  request-time and idempotent.
- Paragraph panel and footer share one bubble implementation — interaction
  stays consistent by construction; future comment-feature changes touch one
  module instead of two diverging copies.

## Update 2026-08-29b: Composer unification + nested-trigger + panel animation

### Context

Three follow-up defects from the shared-bubble refactor:

1. **Compose box mismatch.** The paragraph popup's new-comment box was a native
   `<textarea>` (`.paragraph-comment-form__input`) while the footer used the
   Cherry MarkdownEditor with a full toolbar. Editing existing comments was
   already unified (both use the shared `InlineEditBox`), but composing new
   comments had diverged.
2. **Nested trigger overlap.** Both a quote and its inner paragraph carry a
   `.block-comment-trigger` (absolutely positioned at the host's top-right).
   Hovering the inner paragraph satisfies `.block-comment-host:hover` on both
   the outer and inner hosts, so two buttons appeared simultaneously at the
   quote's top-right corner.
3. **Panel position flicker.** `@keyframes slide-up` animates `translateY`
   only, which takes over the `transform` property during the animation and
   drops the `.paragraph-comment-panel--floating`'s `translateX(-50%)` centering.
   The panel first appeared shifted right (its left edge at the viewport
   centre), then snapped left to centre when the animation ended.

### Decisions

**A. Shared `CommentComposer` (bug 1).**

- New `src/components/comment/Composer.tsx` exports `CommentComposer`: a single
  compose interaction (Cherry MarkdownEditor, reply-target chip + cancel,
  error display, submit → `/api/comments/create` → dispatch
  `maltose:comment-posted`). Both the footer and the paragraph popup render it.
- Props cover both surfaces: `postDatabaseId`, `parent`/`replyTargetName`/
  `onCancelReply` (reply state), `blockReference` (paragraph anchoring),
  `onPosted` (clear + refresh callback). The popup's "login to comment" CTA
  stays gated by `canComment` outside the composer.
- `InlineEditBox` remains separate: editing fetches raw content, pre-fills via
  `setMarkdown`, and saves to the update route — a different lifecycle.

**B. Suppress outer trigger on nested hover (bug 2).**

- Two CSS rules work together to show exactly one trigger per hover point:
  - `.block-comment-host:hover > .block-comment-trigger` — only the directly
    hovered host's own trigger responds (changed from a descendant-space
    selector, which let an outer host's `:hover` light up every nested
    trigger inside it).
  - `.block-comment-host:has(.block-comment-host:hover) > .block-comment-trigger
    { display: none }` — hovering an inner block hides the outer host's
    trigger.
- Net effect: hovering any point of a nested structure (quote + inner
  paragraph) reveals exactly one affordance — the innermost hovered host's.
  Nested blocks keep their independent anchors (no data-model change).

**C. Fix `slide-up` to preserve centering (bug 3).**

- `@keyframes slide-up` now animates `translateX(-50%) translateY(20px)` →
  `translateX(-50%) translateY(0)`, so the floating panel keeps its horizontal
  centering throughout the slide. The keyframes are used only by
  `.paragraph-comment-panel`, so editing in place is safe.

### Consequences

- Compose interaction is identical in the footer and the paragraph popup (same
  editor, same reply chip, same submit); future compose changes touch one file.
- Nested commentable blocks no longer show overlapping triggers; the innermost
  hovered block's affordance wins.
- The paragraph panel opens without a horizontal flicker; the slide-in effect
  is preserved.

## Update 2026-08-30: Paragraph-panel comment styles out of scope

### Context

The paragraph popup's comment list rendered with different styles than the
footer comment section even though both used the same `ChatBubble` component.
Bubbles had no padding, no hover background, and the header/content spacing was
off.

### Decision

**Scope the chat styles to both containers.**

All custom `.chat-*` rules were nested under `#comments-section` (a ~500-line
block). The paragraph panel portals to `document.body`, so its `ChatBubble`s
fell outside that scope and only inherited Tailwind base classes. Fix: extend
the selector to `#comments-section, .paragraph-comment-panel { … }` and the two
dark-mode badge overrides to also target `.paragraph-comment-panel`. The panel's
`ReplyPopupModal` (rendered inside `#comments-section` via `position: fixed`)
was already covered.

### Consequence

Paragraph-panel bubbles render with the exact same padding, header gap, content
background, hover state, and dark-mode badges as the footer. Shared component +
shared style scope = consistent look by construction.

## Update 2026-08-31: Styled hover tooltips (comment time + GitHub heatmap)

### Context

1. Comment timestamps carried a native `title` attribute (full absolute time)
   but no styled popover — the hover affordance was a bare browser tooltip.
2. The timeline GitHub heatmap rendered its own popover absolutely positioned
   against the widget container (`left: 50%`), so it always appeared at the
   container's horizontal centre regardless of which cell was hovered.

### Decisions

**A. Reuse the existing global Tooltip system.**

- Both surfaces now use `animate-ui/components/tooltip` (`TooltipProvider` +
  `TooltipTrigger`/`TooltipContent`), which already implements
  `getBoundingClientRect` + `position: fixed` + animated arrow positioning.
- Comment timestamp: the `<time>` element is wrapped in `TooltipTrigger`; the
  tooltip shows the full absolute time plus a relative-phrase line
  (`formatCommentTime` now returns a `relative` field). Native `title` removed
  to avoid double tooltips. `CommentTooltipProvider` (shared config,
  openDelay 700 / closeDelay 300) wraps each comment island.
- GitHub heatmap: each cell is a `TooltipTrigger` with `openDelay 0` (immediate,
  GitHub-style). This fixes the popover position by construction — the tooltip
  anchors to the hovered cell's rect instead of the container centre.

### Consequence

- Each Astro island renders its own `TooltipProvider` instance: React context
  cannot cross island boundaries, so a single layout-level provider would not
  reach the comment islands. The shared `CommentTooltipProvider` shares config
  code, not context state.

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

## Update 2026-09-01: Dark-mode contrast, theme flash, login responsive, SSR latency

### Context

Four follow-up issues reported after the rc.1 release:

1. **Dark-mode own-comment contrast** — own-comment bubbles (data-align=end)
   have a bright-green `--primary` background that does NOT darken in dark
   mode, but `--primary-foreground` resolves to `#ffffff26` (white 15% opacity,
   via `--base-color-blackbtn`'s dark value). Text on the green bubble dropped
   to ~1.3:1 contrast (WCAG AA needs 4.5:1).
2. **Theme flash on SPA navigation** — Astro ClientRouter's `swapRootAttributes`
   copies the new SSR document's `<html>` attributes onto the live document,
   stripping the `dark` class (SSR output has no class — the server doesn't
   know the client theme), and the head inline theme script does NOT re-run
   (deduped by `textContent`). Every navigation flashed light→dark once the
   React island re-hydrated and re-applied the theme.
3. **Login page on mobile** — the card was fixed `width: 400px`, overflowing a
   375px viewport by ~107px; `body { overflow-x: clip }` then cut it off.
   Switching login tabs also caused a width jump.
4. **Perceived slow loading** — SPA navigation goes through SSR (ClientRouter
   fetches the next page's rendered HTML; no client GraphQL fetch). The wait
   is the SSR render: cold-cache first visit was ~4.4s (TTFB 574ms), article
   queries were STRONG_CONSISTENCY + 30s TTL so every read re-hit WordPress.

### Decisions

**A. Fix dark-mode own-comment contrast (CSS only).**

- `html.dark` overrides for `[data-align="end"]` bubble text (`--md-*` vars,
  h1-h6/p/li/td/th/blockquote/pre/code/strong/em), links, and `@mention`
  forced to `#000`. The bubble background stays bright green in dark mode, so
  black text matches the light-mode look (11:1 contrast). The comment submit
  button (same `--primary` bg + `--primary-foreground` pairing) is also fixed.

**B. Re-apply theme after ClientRouter swap.**

- `MainLayout.astro` listens for `astro:after-swap` and `astro:page-load` and
  re-applies the theme from localStorage/system preference, restoring the
  `dark` class that `swapRootAttributes` removed.

**C. Login card responsive.**

- `LoginForm` card: `width: 400` → `maxWidth: 400, width: 100%` +
  `box-sizing: border-box`. Card width is now container-driven (no overflow,
  no tab-switch width jump).

**D. SSR latency.**

- Parallelize the three independent SSR queries in `Single.astro`
  (layoutQuery / getRandomPosts / getAdjacentPosts) via `Promise.allSettled`
  — total ≈ slowest, not the sum.
- Raise article query TTLs (GetNodeByURI/GetPost 30s → 300s): mutation paths
  (create/update/delete/rebind comment) already invalidate those prefixes
  explicitly, so freshness after writes is guaranteed by invalidation, not TTL;
  a longer TTL makes repeated reads hit the in-process LruLink cache instead
  of WordPress every time.
- Add a thin top navigation progress bar (YouTube-style) shown on
  `astro:before-preparation`, removed on `astro:after-swap`/`astro:page-load`,
  so SPA navigation has visible feedback. Located by query on removal (the
  swap replaces `<body>`, so a captured element reference would go stale).

### Consequence

- Dark-mode own comments are readable again; submit buttons match.
- SPA navigation keeps the user's theme with no light→dark flash.
- The login card fits mobile viewports and tab switches don't shift width.
- SSR warm reads hit the cache (measured TTFB 574ms → 168ms); cold starts
  benefit from parallel queries; navigation shows a progress bar.

## Update 2026-09-05: All-SWR cache + boot-time warm-up

### Context

Playwright diagnosis of a <100 PV/day blog showed warm reads are already fast
(article ~0.09s, home ~0.03s) but **cold-cache first visits are slow**
(article ~1.9s, timeline ~2.9s): every SSR query misses LruLink and waits on
WordPress. A WPGraphQL subscription/WebSocket path was explored and rejected
(core has no subscription support; experimental plugin requires a Node sidecar
+ Redis and is not production-ready). A WP→Astro webhook was also rejected:
it requires the WP server to reach the Astro process, which is not guaranteed
for other developers on their local machines (no frp). The chosen direction:
solve the cold/warm asymmetry with the cache itself.

### Decisions

**A. Empty STRONG_CONSISTENCY — every query is SWR.**

- `GetNodeByURI`/`GetPost` removed from the strong-consistency set. An expired
  entry now serves stale immediately while a background refresh runs, so reads
  never block on the network once an entry exists.
- Freshness after writes is guaranteed by mutation-path invalidation (comment
  create/update/delete/rebind call `deleteByPrefix`), not by strong reads.

**B. Tiered TTLs.**

- Site-wide chrome (LayoutQuery, MegaQuery, timeline/stats families,
  MaltoseSettings): 600s — low volatility, almost always cache hits.
- Article queries (GetNodeByURI/GetPost) and home/random lists: 180s — shorter
  bounds the stale window; reads still never block (SWR).

**C. Boot-time warm-up.**

- `warmCache()` in `src/api/api.ts` fills the site-wide queries on server
  boot (layout, mega-query with homepage params, homepage posts, timeline
  stats, comment totals). Called once from `middleware.ts` on the first
  request, production only (dev restarts too often and re-evaluates its module
  graph). Fire-and-forget; failures are logged, the page still renders cold.

### Measured results (production `node dist/server/entry.mjs`)

| Scenario | First (cold) | Warm |
|---|---|---|
| Home (site data, warmed) | ~0.2s (after boot warm) | 0.03s |
| Article | 1.9s | 0.09s |
| Timeline | 2.9s | 0.13s |

### Consequence

- Every repeated visit is a cache hit (<0.15s). First visits to a *specific*
  URL still wait on WordPress (URLs are not enumerable to warm), but the
  site-wide chrome that every page needs is warm from boot.
- No external dependency: pure Astro-side cache tuning; works for any developer
  without frp or webhook reachability.

## Update 2026-09-05b: Dev-mode right-sidebar first-frame flash

### Context

On the local dev server the right sidebar (SidebarRight) flashed in ~0.1s
after first paint on every full reload — the main content looked full-width,
then the fixed sidebar appeared and the layout reflowed. Production
(dev.styunlen.cn) never showed it. Playwright could not reproduce it after
`domcontentloaded` (the flash is in the first-frame → DCL window).

### Diagnosis (C — deep dive)

- Both dev and prod SSR the sidebar content into the HTML identically; the
  difference is pure CSS timing.
- **Dev**: Astro inlines every component's CSS as `<style data-vite-dev-id>`
  **after** the user-written head content. On a 645 KB streamed HTML (head
  alone 369 KB) the first paint can happen before the Tailwind rules for the
  sidebar (`.hidden` / `.2xl:flex` / `.fixed`, injected at ~byte 25800) arrive,
  so the fixed sidebar renders unstyled/in-flow then jumps.
- **Prod**: CSS is extracted to a render-blocking `<link>` near the top of a
  280 KB HTML, so the first paint waits for it — no flash.
- Astro explicitly injects dev styles to "avoid FOUC" (source comment); the
  PR to make dev serve external CSS was declined (#10894). Vite's
  `cssCodeSplit` and Astro's `build.inlineStylesheets` are build-time only.
  `is:inline` styles keep their source position, before the injected dev CSS.

### Decisions

**A. First-frame critical CSS (dev-flash fix).**

- `MainLayout.astro` head starts with `<style is:inline>` forcing the right
  sidebar container (`[data-slot="sidebar-container"][data-side="right"]`) to
  `display:none` and, at ≥1536px, `display:flex !important`. `!important`
  beats the later-injected Tailwind `.hidden` (same specificity, later source
  otherwise wins). The sidebar therefore occupies its slot from the first
  paint in dev; prod is unaffected (harmless duplicate).
- Rule must stay in sync with SidebarRight.tsx / animate-ui sidebar.tsx
  breakpoint classes.

**B. Astro upgrade.**

- astro 7.1.3 → 7.3.1, @astrojs/node 11.0.2 → 11.1.5 (routine maintenance;
  no specific dev-CSS fix identified in the changelog, but staying current).

### Consequence

- Dev reloads no longer flash/reflow the right sidebar; the is:inline rules
  sit at byte ~894 of the head, well before the injected Tailwind (~25800).
- Production output unchanged in behaviour; the extra inline CSS is negligible.

## Update 2026-09-06: Mobile paragraph-comment affordance

### Context

On touch devices the paragraph-comment hover affordance was shown for every
block at once (`@media (hover: none) { .block-comment-trigger { opacity: 1 } }`)
— 87 always-visible buttons flooded the article on mobile.

### Decisions (interview with the user; "参考知乎")

- **Blocks with comments** (`[data-comment-count]`) always show their count
  chip — it is the entry point into the existing discussion.
- **Blocks without comments** show no affordance until they become the touch
  "focus" block; touching a paragraph pins it (`.has-focus`), and the chip
  appears so the reader can tap to open an empty composer.
- **Touch focus tracking** in ParagraphComments: `touchstart` pins the block
  under the finger; `touchmove` re-pins at most every 100 ms (chip follows a
  slow scroll without jittering). The focus lingers after the finger lifts
  until a new touch pins another block. Listeners are bound unconditionally
  (desktop mice never fire touch events, so no `matchMedia` gate needed).
- CSS scoped to `@media (hover: none)`; desktop hover behaviour unchanged.

### Consequence

- Mobile shows at most one affordance (the focused block) plus count chips on
  blocks that already have comments — no more flooded article.
- Desktop hover interactions are untouched.

## Update 2026-09-07: Count chip occludes paragraph text — moved to text-flow end

### Context

The always-visible count chip on `[data-comment-count]` blocks was anchored to
the block's top-right corner (`right: 0.5rem; top: 0.5rem` in `@media
(hover: none)`). On a long paragraph whose first line runs to the container's
right edge, the chip sat on top of that text and occluded ~5–6 characters
(post-1838 example: 52×26 px chip over the first line's right end).

### Research (web references)

Surveyed how content platforms anchor a "this text has discussion" affordance:
Zhihu 划线评论, WeChat 公众号 划线/划线评论, Feishu Help Center, Yuque, and
two independent blog implementations. **None anchor a persistent chip inside
the block's top-right corner over the text.** They use either (a) inline
text-level markers (underline + end-of-sentence icon that flows with the text)
or (b) markers in a gutter/sidebar outside the text column. In-block corner
floating is a documented failure mode (occludes text; overlapping controls in
nested structures).

### Decisions (interview with the user)

- **Single-chip, text-flow-end placement for CoreParagraph** (chosen over a
  dual-chip design and over CSS-only repositioning): the chip is rendered as
  an inline tail *inside* the paragraph's text flow. On touch it settles at the
  end of the last text line; on desktop it is pulled back out of flow with
  `position: absolute` to the host's outer top-right, preserving the old hover
  behaviour.
- **React structure**: content is wrapped in a `<span dangerouslySetInnerHTML>`
  and the chip follows as a sibling inside the `<p>`. React forbids children
  next to `dangerouslySetInnerHTML` on one element, hence the span. Content is
  phrasing-only in practice (verified over 275 paragraphs across 7 posts — all
  children were inline; the only `wrappedInP` cases were empty paragraphs).
  WPGraphQL returns raw `post_content` without kses normalisation, so the span
  wrap relies on the editor/paste pipeline keeping paragraph content inline —
  imports/migrations can still produce block-level content (Gutenberg #48232).
  The 2 `wrappedInP` empty-paragraph cases keep the old div path (no tail).
- **Scope correction** (Q5): only CoreParagraph gets the inline tail. CoreQuote/
  CoreList/CoreCode etc. render their content via `dangerouslySetInnerHTML`
  over an opaque HTML string with no safe React insertion point, so they keep
  the wrapper-level overlay chip. This narrows the fix to the leaf block where
  the occlusion was reported.
- **Nested suppression stays pure CSS**: a paragraph inside a quote is its own
  host; when the quote is hovered the outer overlay chip is suppressed by
  `:has(.block-comment-host:hover)`, and when the inner paragraph is hovered
  its inline chip shows while the quote's overlay chip is hidden. Verified on
  real nested DOM (10 nested hosts in post-1838).

### Trade-off (measured)

An inline chip always occupies flow space even at `opacity: 0`; `display:none`
would lose the in-flow end-of-line position and cause layout jump on focus.
Measured over 53 inline-tail paragraphs (offsetHeight A/B, chip hidden vs
shown): only 3 paragraphs change height (by one line, 31–32 px) — those whose
last line happens to be full enough that the chip forces a wrap. The commented
paragraph itself measured zero change. Desktop is unaffected (chip is
`absolute`, out of flow).

### Consequence

- Touch: the count chip sits at the end of the paragraph's last line, never
  over text. Desktop hover behaviour and position are unchanged.
- Article typography is preserved except rare one-line pushes on full last
  lines (accepted; ~6% of paragraphs, never on the commented one in tests).
- The chip remains clickable via the existing document-level delegation (moved
  element is still matched by `closest('.block-comment-trigger')`).

### Follow-up 2026-09-07: container blocks (quote/table/code) get a block-level marker

The inline-tail fix only fits leaf text blocks whose content is phrasing-safe.
Container blocks (CoreQuote/CoreList/CoreTable/CoreCode/CoreHtml/CorePreformatted)
render raw block-level HTML strings via `dangerouslySetInnerHTML` — there is no
safe React insertion point inside their text, and wrapping block content in a
`<span>` would corrupt the HTML. A second variant handles them:

- **`block-comment-host--block-tail`**: the chip is rendered as a wrapper
  sibling **after** the container content. On touch it becomes `position:
  static` (a block-level marker below the quote/table/code, `margin-top:
  0.5rem`); on desktop it stays `position: absolute` at the host's outer
  top-right via `.block-comment-host { position: relative }` — DOM order is
  irrelevant for out-of-flow elements, so the moved node does not change the
  desktop hover affordance.
- Verified on the one real commented container in post-1838 (an Alert quote):
  touch chip sits below the container with zero text overlap; desktop hover
  still shows it at the outer top-right; `:has()` nested suppression (outer
  chip hidden while an inner paragraph host is hovered) is preserved.
- CoreListItem keeps the inline span-host overlay (list items are short;
  no block marker inside a `<li>`).

### Follow-up 2026-09-07: whole-block hosts return to top-right + highlight frame

User review of the below-container block marker: for whole-block comments
(code/table/quote) a chip below the container reads worse than the top-right
overlay. Final shape:

- **Inline-tail stays** for CoreParagraph (end of last text line, all devices).
- **`block-comment-host--block`** (quote/table/code/html/pre): the chip is an
  absolute overlay at the host's top-right again — where it reads as "this
  entire container".
- **Highlight frame**: whenever the chip shows (host `:hover` on desktop;
  `[data-comment-count]` / `.has-focus` / `:focus-within` on touch) the host is
  framed by a `::before` box (`inset: -5px`, 1.5 px primary border, radius 8 px).
  The pseudo-element is used instead of `outline` because outline cannot be
  transitioned — the frame fades in/out over 0.18 s in sync with the chip,
  so the user sees the comment targets the whole block.
- **Nested suppression covers the frame**: when any inner host is showing its
  affordance (hover / count chip / focus), the outer block's chip AND frame
  both stand down — only the innermost comment target is indicated.
- CoreParagraph (inline-tail) paragraphs never get the frame.

### Follow-up 2026-09-07: image blocks + list-item line-end + hover-gap fix

- **CoreImage is now commentable** as a whole-block host (--block): chip at the
  top-right + highlight frame, same as quote/table/code. CoreImage itself
  needed no change — the wrapper carries the anchor/chip.
- **CoreListItem joins the inline-tail path**: its chip renders inside the
  `<li>` right after the item text (before any nested list), so list items
  show the affordance at the end of the line like paragraphs do, instead of
  the old right-side overlay.
- **Hover-gap fix (desktop)**: the whole-block chip floats outside the host
  (`right: -2.25rem`), leaving a ~10 px dead zone between the host edge and
  the chip. Moving the mouse across it dropped `:hover` and dismissed the
  affordance mid-flight. Two combined mitigations:
  1. **Delayed hide** — the chip's exit transition carries a 0.25 s delay
     (`transition: opacity .18s ease .25s` in the hidden state); showing stays
     instant (the shown-state rules override with a delay-less transition).
     Measured: chip stays fully visible ~280 ms after the trigger is removed,
     then fades over 180 ms.
  2. **Hover bridge** — a transparent `::before` hit-area on the chip extends
     `1rem` leftward from the chip's left edge across the gap. The chip is a
     DOM child of the host, so while the pointer is over the bridge the host
     stays `:hover` and the affordance cannot dismiss. Verified by walking a
     mouse path host→chip: opacity holds at 1 across the former dead zone.

### Follow-up 2026-09-07: whole-block hosts nested in columns lost their frame

Blocks nested in CoreColumns render through `WordPressBlocks noWrapper=true`,
which routed every commentable block into the light `span` host branch —
designed for CoreListItem. Whole-block types (quote/table/code/image) nested
in columns therefore became `span.block-comment-host--inline` overlay hosts
with no highlight frame. Fixed by branching the `noWrapper && commentable`
path on intent:

- Inline-tail types (CoreParagraph / CoreListItem) keep the `span` inline host.
- Whole-block types get a `div.block-comment-host--block` host even when
  nested, restoring the top-right chip and the `::before` frame. Verified:
  columns-hosted tables/images now show both chip and outline on the same
  triggers as top-level blocks.

### Follow-up 2026-09-07: line-end chip must not wrap to its own line

A text-flow inline chip wraps to its own line when the paragraph's text fills
the line — the remaining gap is smaller than the chip. A **zero-width anchor**
fixes it: the chip is wrapped in an inline-block span with `width: 0` and
`overflow: visible`. The line box measures the anchor as zero wide, so a full
line never pushes the chip down; the chip paints just right of the anchor
(text end) and overflows the container by a few px. Measured: an 18-char
full-width line keeps the anchored chip on the line (chip x at line end,
overflow ~8 px) where the unanchored chip wrapped to the next line.

The inline-tail chip was also redesigned as a **compact single SVG** — a
rounded-square bubble (`message-square` path) with the count rendered as SVG
`<text>` inside it (font-size adapts: 1 digit 9, 2 digits 7.5, 3+ digits 6.5).
At 15×15 px it is ~⅓ the old 52 px pill width, so the anchored overflow is
tiny and mobile `body { overflow-x: clip }` never cuts it. The transparent
icon (no border/bg) sits at 0.55 opacity at rest, full `--primary` when shown
(host hover / count / focus). Whole-block and list overlay chips keep the pill
shape with the `span.block-comment-count`.



### Update 2026-09-08: unify chip UI, focus-gated frame, sub-reply popup, spacing

Three fixes after on-site testing (post-1846 demo):

1. **One SVG bubble for both entry points.** The whole-block overlay chip still
   used the old pill (`border/bg` + a `span.block-comment-count`); the inline
   chip was a separate compact SVG. Both now call the same `commentBubble()`
   builder: a `message-square` path whose **right side only** widens with digit
   count (24 → 24+5·(n−1) viewBox) while the left edge, bottom run and tail
   stay fixed — widening the whole path naive-deformed it into a trapezoid.
   Digit sits at `x = width/2`, `y = 10.5`, `dominant-baseline: central`;
   measured dead-centre with 8–11 units of right padding at 1/2/3 digits, so
   counts never overflow the bubble. The old `span.block-comment-count` HTML
   and its pill CSS were deleted.

2. **Highlight frame only on interaction.** The `--block ::before` frame was
   shown for `[data-comment-count]` hosts permanently; now it lights only on
   `:hover` / `.has-focus` / `:focus-within`. Commented blocks rest showing
   just their chip.

3. **Paragraph-panel sub-reply opens the thread popup.** ChatBubble's `↳ N`
   child-count chip was wired to `startReply` (compose a reply) instead of
   showing the child thread. The panel now opens the shared `ReplyPopupModal`
   (same behaviour as the footer section); `onStartReply` (the footer reply
   button) still composes in place. Edit-scope coordination: the modal requests
   edits with a `popup` scope but they resolve to `panel`.

4. **Quoted-paragraph spacing.** Two paragraphs inside a quote measured a 32 px
   gap — the global `.wp-block-paragraph` bottom margin (1.25rem) stacked on
   the Alert grid gap and the item's own 8 px top margin. Quote paragraphs now
   use `margin: 0.5rem 0` → 20 px paragraph gap with balanced container padding.

**Deferred (architecture debt):** inline-tail leaf blocks (paragraph / list
item) nested in a container are currently wrapped in a `<span>` host — invalid
HTML (`span > p`, `span > li`, and `ul > span > li` break list-item CSS).
Evaluated options; the clean end state is **hybrid self-host**: inline-tail
anchors (data-block-id, host class, `.has-focus`) live on the `<p>`/`<li>`
themselves, while whole-block types keep their `div` host (their raw-HTML leaf
elements cannot hold a React chip child and need a positioned container for the
frame/absolute chip). To be done as its own change; see BlockRenderer's
`noWrapper && commentable && useInlineTail` branch.

### Design 2026-09-08 (rev B): hybrid self-host + generic end-adornment slot

Decision (final, supersedes the provisional self-host direction in the Deferred
note above): implement hybrid self-host with a GENERIC leaf-component contract,
not a comment-specific prop. Two requirements drove the choice:

1. The leaf components (CoreParagraph, CoreListItem) must NOT grow comment
   vocabulary — comment/favorite/agreement features all want a trailing
   affordance on the same blocks, so the slot is a general mechanism, not a
   comment one.
2. HTML validity still forces the anchor onto the block's own element.

So the change is split into a generic rendering contract (this ADR) and the
comment feature that consumes it (all the previous Update sections).

#### Generic contract (block leaf components)

- Rename the `commentTail` prop to **`endAdornment`** (types.ts). It is "one or
  more trailing controls rendered at the end of the block's text flow". The
  comment bubble becomes the FIRST consumer; paragraph favorite + agreement
  (like) controls are planned consumers — they mount into the same slot without
  touching leaf components.
- Leaf components adopt one rule: they merge an incoming `className` and
  spread a **`rootProps`** passthrough onto their root element (p/li/div).
  Channel split: **host classes travel the existing `className` channel**
  (BlockRenderer appends `block-comment-host --inline-tail` to the class list
  it already passes every block); **`rootProps` carries only `data-*` state
  markers** (`data-block-id`, `data-comment-count`, future feature markers).
  Keeping host classes in `className` avoids a second class-merge path in every
  leaf; keeping `rootProps` data-only makes it type-safe and grep-able. This is
  the exact mechanism that lets BlockRenderer stay the decision centre while
  the anchor physically lands on the block element.

```ts
// types.ts (shape)
interface BlockRendererProps {
  block: SupportedBlock;
  className?: string;
  children?: React.ReactNode;
  noWrapper?: boolean;
  dataBlockId?: string;
  commentsByBlock?: Record<string, number>;
  onCommentClick?: (clientId: string) => void;
  /** Generic trailing-control slot — renders after the block's own text.
   *  Comment bubble today; paragraph favorite / agreement controls later. */
  endAdornment?: React.ReactNode;
  /** DOM data-contract for the root element: block-interaction state markers
   *  (data-block-id, data-comment-count today; favorite/agreement later).
   *  Leaf spreads onto its own root; BlockRenderer decides the values. */
  rootProps?: {
    "data-block-id"?: string;
    "data-comment-count"?: string;
  };
}
```

- This keeps ALL comment logic in BlockRenderer (the decision centre, 27
  references, oracle 2026-09-07): it computes commentability, host classes,
  wrapper attrs, and passes them via the generic `rootProps`/`endAdornment`
  channels. Leaves never name a comment concept.

#### Current DOM and the three invalid shapes

- Top-level paragraph: `div.wp-block-wrapper.my-8.block-comment-host
  --inline-tail[data-block-id] > p` — valid, visually redundant wrapper.
- Nested paragraph (quote/columns inner): `span.block-comment-host--inline
  [data-block-id] > p` — INVALID (`span` phrasing > `p` flow).
- Nested list item: `ul > span[data-block-id] > li` (recurse) — INVALID
  (`ul` direct child must be `li`); theme `ul > li` selectors break.
- Whole-block (quote/table/code/html/pre): div host — valid, unchanged.

#### Target DOM

- Top-level paragraph: `div.wp-block-wrapper.my-8` (layout ONLY, as for every
  non-comment block) `> p.wp-block-paragraph.block-comment-host--inline-tail
  [data-block-id]` — `endAdornment` bubble inside the `<p>` flow.
- Nested paragraph: plain `<p>` self-host, no wrapper.
- List item (any depth): `<li class="block-comment-host--inline-tail"
  [data-block-id]>` — `ul > li` restored.
- Whole-block: unchanged div host.
- `wrappedInP` paragraph (content pre-wrapped in `<p>` by WP): its early-return
  `<div>` also receives `rootProps` (data-block-id + host classes) and the
  `endAdornment`, restoring the currently-lost comment entry (pre-existing bug).

#### Per-file change contract

- **types.ts:** rename `commentTail` → `endAdornment`; add `rootProps`.
- **BlockRenderer.tsx:** `noWrapper && commentable && useInlineTail` stops
  wrapping — renders `<Component>` directly, handing it `endAdornment` plus
  `rootProps` (data markers) and appending the host classes to `className`.
  Top-level branch keeps the `my-8` layout wrapper but strips comment
  classes/data from it, forwarding them to the leaf through the same two
  channels. Whole-block branch untouched. `commentAffordance` wraps the bubble
  in the zero-width `.block-comment-anchor` as today.
- **CoreParagraph.tsx / CoreListItem.tsx:** render `endAdornment` after content
  (rename only) and spread `rootProps` onto the root (merge className). No
  comment vocabulary enters these files.
- **global.scss:** one host shape per affordance. `.block-comment-host
  --inline-tail > .block-comment-anchor` replaces the paragraph + list-item
  selector pairs (`> .wp-block-paragraph >` and `.block-comment-host--inline >
  li >`). Legacy absolute-overlay `.block-comment-host--inline` CSS block is
  deleted (no DOM left for it). `:has(.block-comment-host:hover)` nested
  suppression unchanged (self-hosted inner p is still a `.block-comment-host`).

#### Impact matrix

- SSR/hydration — HIGHEST RISK: wrapper removal changes DOM depth; SSR and
  client hydrate must match. Verify whole-page hydration on quote/columns/list
  pages.
- Top-level vertical rhythm: `my-8` stays on layout wrapper → unchanged.
- Snippet / scroll fidelity improve (anchor is now the exact p/li).
- Whole-block & non-commentable paths: zero change.
- List marker rendering shifts to correct `ul > li` — verify visually.
- Rename `commentTail` → `endAdornment` touches 4 source files + this ADR
  (grep-verified: types.ts, CoreParagraph, CoreListItem, BlockRenderer).

#### Test checklist

1. HTML validity: no `span>p`, `span>li`, `ul>span`; `[data-block-id]` ∈
   {P, LI, DIV-whole-block}; ids unique; quote inner paragraphs each get their
   own id beside the quote's.
2. Top-level paragraph baseline: hover chip, rest state for commented blocks,
   panel anchored at `p.getBoundingClientRect().bottom`, unchanged rhythm.
3. Quote inner paragraph: hover quote shows quote chip/frame and suppresses
   inner; hover inner paragraph lights only it; panel under inner p; rebind
   snippet = pure paragraph text; 20 px paragraph gap preserved.
4. List: `ul > li` structure, marker intact, outer vs nested li hover
   suppression, chip hit area at line end.
5. Whole-block smoke (unchanged path).
6. Touch: `.has-focus` lands on the p/li under the finger; inner/outer
   migration.
7. `pnpm test` (67) + `pnpm build`; hydration-mismatch console scan.
8. Optional: promote validity + focus checks into a persistent playwright
   script (currently paragraph-comment regression is manual playwright only).

#### Extension note (favorite / agreement features)

`endAdornment` accepts multiple sibling controls: BlockRenderer (or a future
adornment-composition layer) mounts `[<CommentChip/>, <FavoriteChip/>, <LikeChip/>]`
into the single slot. Each control is an independent island/delegation target
keyed by the block's `data-block-id`; no leaf component changes. A future
feature adds: (a) a chip component, (b) its state marker in `rootProps`
(`data-favorite-count`-style), (c) its click delegation in the article mount.
The CSS host/anchor/frame machinery is shared as-is.
