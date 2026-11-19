# Maltose — Domain Context

Headless WordPress blog built with Astro 7 (SSR, Node adapter) + React + Tailwind v4 + shadcn-style components. Data flows: browser → Astro SSR → `/api/graphql-proxy` (signature-verified) → WPGraphQL on `styunlen.cn`.

## Reading this repo

- **ADRs** live in `docs/adr/` (numbered `0001-…` – `0042-…`). Read the ones touching the area you're working in. The most load-bearing: `0024` (in-process LRU cache / SWR), `0025` (hover link preview), `0026` (site stats dashboard + comment geo), `0030` (mutation auth), `0032` (cache driver), `0033` (CI/CD deploy), `0034` (runtime env), `0035` (friends data cache), `0036` (paragraph comments + image placeholders + theme data management), `0040` (homepage banner scroll model; supersedes the ADR-0038 Welcome Gate paradigm), `0041` (site-wide Lenis + banner release-to-snap switch), `0042` (banner backdrop random image carousel).
- **Glossary** lives in `docs/glossary/` (e.g. `lru-cache.md`, `comment-message.md`, `hydration.md`, `stale-content.md`, `paragraph-comment.md`, `welcome-banner.md`).
- **Source aliases**: `@/` → `src/`, `@api` → `src/api`, `@components` → `src/components`, `@lib` → `src/lib`.

## Core architecture

- **Caching**: all GraphQL queries flow through an in-process LRU cache link (`LruLink`, `src/lib/lru-link.ts`) with stale-while-revalidate. Strong-consistency queries (`GetNodeByURI`/`GetPost`) wait for the network; comment mutations invalidate affected cache prefixes (`GetNodeByURI:` / `TimelineStats:` / `HomePosts:` …).
- **WP theme** (`wordpress-theme/`): a "pure function" theme exposing custom GraphQL fields (post views, sticky posts, comment geo `commentGeo`, agent public UA, OTP email, geo stats). IP → geography via offline CIDR tables (`MaltoseIpResolver`); WPGraphQL's native `authorIp` is capability-gated so geo is exposed server-side only.
- **Auth**: Authentik OIDC → WP token (`wp_token` cookie) → `Astro.locals.user` / `wpUserId`. Passwordless OTP + password flows.
- **Comments**: React client components sharing one bubble implementation in `src/components/comment/` (ChatBubble/InlineEditBox/ReplyPopupModal/types). The footer comment section (`CommentSection.tsx`) and the paragraph popup (`ParagraphComments.tsx`) both render chat-bubble UI with Markdown (Cherry editor), reply popups, owner badge (`BLOG_OWNER_USER_IDS`, comma-separated, default `1`), UA/geo chips, and orphan-rebind (author or owner only). Implemented (ADR-0036): **paragraph comments** anchor comments to blocks via `blockReference` (comment_meta, `{ clientId, snippet }`); `clientId` is stabilized by a theme filter (persisted `attrs.clientId` UUID → content-hash fallback) that also rewrites `parentClientId` so the flattened block tree rebuilds correctly; block-level anchoring covers quote/html/table/code/preformatted.
- **Article page** (`Single.astro`): Long-Document hero, stale-content notice (>90 days), tag chips, copyright card, prev/next nav, author card, comments, related posts. Blocks render via `WordPressBlocks` (React island) keyed by `clientId`; images use `LazyImage` (article, blur-up placeholder) vs vanilla-lazyload `.lazy-img` (cards, spinner).
- **Theme data management** (ADR-0036, implemented): `MaltoseDataRegistry` (`includes/class-data-registry.php`) registers all extra-data keys (medium/cleanup/export) for unified export/import/uninstall. Storage stays in native WP tables; OTP-created users get `maltose_otp_user` marker, reclassified as normal once they set a real password.
- **Pagination**: path-based `/page/N` for home / timeline / archive (SEO-friendly) with `rel="canonical"` (query params stripped).
- **Friends**: Legacy `friends.json` and AstraHub are complementary sources. A site appearing in both sources is one friend link, with AstraHub provenance shown as a badge; health is checked once per merged site.
- **Homepage search**: The primary content area exposes a search entry immediately after the hero and before featured content, linking to the full `/search` experience.

## Homepage introduction

- **Homepage entry sequence**: The first homepage page lands directly on the
  brand banner — no welcome gate, no entry click. Scrolling down dissolves the
  banner into the content shell (`progress = scrollY / innerHeight` drives
  backdrop opacity/blur); scrolling back to the top restores it. A fast wheel
  gesture (speed threshold, default 1200px/s over a ~250ms window) switches a
  whole page between banner and content; slow scrolling stays completely free
  and may rest mid-screen. Gestures that start in the content never switch;
  deep upward momentum is absorbed at the content top ("到顶后再滑")
  (speed-threshold page switch, ADR-0041).
- **Site-wide smooth scrolling**: Lenis (reference-site feel, `duration: 1.2`)
  smooths wheel scrolling on every route; touch keeps native scrolling and
  `prefers-reduced-motion` skips Lenis entirely. The instance is exposed as
  `window.__lenis`; programmatic scrolls go through `src/lib/scroll.ts`, and
  inner scrollables are marked `data-lenis-prevent` / `-horizontal` (ADR-0041).
- **Banner backdrop carousel**: The fixed backdrop carries a random image
  carousel (runtime `public/banner-urls.json` remote URLs first, bundled
  `src/assets/banner/` placeholders as fallback, shuffled per request, ~5.5s
  per slide, 1.2s crossfade) under a brand-gradient veil; it pauses while
  hidden and stays static under reduced motion (ADR-0042).
- **Full-bleed brand introduction**: The homepage brand introduction is a
  fixed, `aria-hidden` backdrop (`z-index:-1`) carrying the brand gradients
  and effect layer, with the document scrolling over it. Site navigation and
  sidebars begin after the first viewport rather than covering it; other
  routes keep the normal content-shell relationship.
- **Approved visual effects**: Homepage effects are Aceternity components
  installed through the official component registry. Dotted Glow and
  Background Beams are explicitly approved for this site; the site's settings
  can disable them, and reduced-motion preferences take precedence. The
  effect layer mounts at load and unmounts while the banner is scrolled out
  of view.
- **Homepage chrome states**: On the first homepage page, the desktop Header
  remains visible while scrolling. It has a transparent Banner state only at
  zero document scroll over the full viewport introduction. Any positive
  desktop document scroll changes it to a slightly more compact Content state,
  while the Content background tint strengthens progressively through the
  introduction range. The desktop Header is approximately 80px in Banner state
  and 64px in Content state. Content state uses an opaque theme background
  with light blur and no bottom shadow or border. This is a visual state
  change, not a hide-on-scroll interaction.
- **Desktop sidebar behavior**: Both sidebars are one unified fixed-rail model
  on every route (no per-page layout switching). On the first homepage page
  they are hidden over the full-viewport introduction and fade in linearly
  across the last 80px of it, fully visible at the content top; other routes
  show them immediately. The rails sit below the Header and follow its current
  height. Breakpoints:
  <1280 single column; 1280–1535 left rail + content (right rail hidden with
  no gap placeholder, openable as an overlay from the Header toggle);
  ≥1536 both rails. The right rail groups its widgets into collapsible
  sections (ADR-0043).
- **Left rail content**: Author card (WP blog owner: avatar, display name,
  bio, social links), announcement card (latest announcement; click opens the
  full announcement timeline dialog), a reserved empty area for future
  modules, a Tools group (RSS / about / settings / back-to-top) and the site
  copyright footer. Navigation lives in the Header; the left rail carries no
  navigation group on desktop (mobile sheet keeps it).
- **Announcements**: Managed as the `maltose_announcement` custom post type in
  WordPress — untitled (auto-generated title), publish date / modified date /
  content / sticky flag. The left rail shows the newest (sticky first) one;
  the dialog shows all announcements newest-first as a timeline. The post
  type and its meta are registered in `MaltoseDataRegistry` so the uninstall
  wizard can preview/clean them (ADR-0043).
- **Social links & blog owner**: Configured in WordPress options
  (`maltose_social_links` JSON: label / url / iconType "url"|"iconify" /
  icon; `maltose_owner_user_ids` user IDs) and exposed via
  `RootQuery.siteConfig`; the author card and the comment "blog owner" badge
  share the owner selection. Both options are registered in
  `MaltoseDataRegistry` (ADR-0043).
- **Theme admin app**: A top-level "Maltose" menu in the WordPress admin
  renders a React SPA (independent Vite bundle, committed to
  `wordpress-theme/assets/admin/`). All reads/writes go through the
  `maltose/v1` REST namespace (manage_options + `wp_rest` nonce): settings,
  announcements CRUD, data overview/export/import/cleanup/migration,
  uninstall wizard and orphan-comment overview. The legacy
  "设置 → Maltose" pages are gone; their admin_post handlers remain only as
  compatibility fallbacks. Admin styles use unlayered utilities plus id-scoped
  unlayered form/heading resets so WP core and third-party plugin styles
  (including Tailwind v3 preflights) cannot override them (ADR-0044).
- **Client surfaces**: Desktop and mobile are separate product surfaces.
  They share one URL, but mobile is intentionally deferred and will later use
  its own WebApp-oriented information architecture rather than being treated
  as a CSS-scaled desktop layout. A fixed bottom navigation plus a separate
  More surface is an initial mobile interaction reference. The desktop Banner
  Header behavior currently applies only to the first homepage page.

## Design system

Mint-green theme (user's final choice): `--primary` / `--ring` = `#00f0a0`, `--accent` = `#90fadc`. Five accent ramps (mint / magenta / violet / coral / amber) drive postcard tag & category chips via a deterministic name→hue hash. Typography: Space Grotesk (display) + Nunito (body) + JetBrains Mono (code). `.dark` is scoped via `:global(.dark)` or `html.dark`; note Astro scoped CSS can't nest `.dark` selectors.

## Deployment

GitHub Actions `Deploy Staging` on `develop` push → rsync to server → `pnpm install` + pm2 reload. Push uses SSH port 443. `docs/blog/` is never committed.
