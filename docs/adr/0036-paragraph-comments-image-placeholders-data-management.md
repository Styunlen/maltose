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
