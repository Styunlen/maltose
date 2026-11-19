# ADR-0043: Unified Fixed-Rail Sidebars with Scroll-Linked Fade-In, Author Card, Announcements and Site Config

- Status: Accepted
- Date: 2026-11-19

## Context

The previous homepage-only "desktop flow" sidebar variant (sidebar content in
the document flow as a sticky column beside the hero) caused visible UI
fragmentation: the sidebars flipped between two mutually exclusive layout
models when navigating across homepage pages, the sticky column's outer
wrapper had no scroll room (`h-fit`) so the sticky never engaged and the left
rail scrolled away under the header, and the header-height offset (64px) did
not track the banner-state header (80px). The owner asked for either a
restoration of the fixed style or a rebuild, and reviewed interactive
prototypes (V1 fixed / V2 glass / V3 restructure) before picking a combination.

## Decision

- **One unified fixed-rail model on every route**: both sidebars render the
  same `position:fixed` rail structure; the desktop-flow variant and the
  `sidebarStartsAfterIntro` layout fork are removed. ClientRouter swaps no
  longer switch the sidebar between layout models.
- **Scroll-linked fade-in on the first homepage page**: the rails are
  `opacity:0; pointer-events:none` over the full-viewport introduction and
  fade in linearly across the last 80px of it, reaching full opacity at the
  content top (H−80 → H) — so a whole-page switch that lands on H shows the
  rails immediately. Driven by a single rAF-on-scroll bridge
  (`RailChromeBridge`) writing `--rail-opacity`/`--rail-pe` CSS variables — no
  React re-renders on scroll, nothing runs while idle. Other routes keep the
  rails visible.
- **Glass finish (V2)**: both rails use a translucent `bg-sidebar/70` with
  `backdrop-blur(18px) saturate(1.25)` via the new `glass` prop on the Sidebar
  primitive.
- **Header owns navigation (V3)**: nav items stay in the Header; the left rail
  desktop content becomes: author card (WP owner: avatar / display name / bio
  / social links), announcement card (newest, sticky first; opens the timeline
  dialog), a reserved empty area for future modules, a Tools group (RSS /
  about / settings / back-to-top) and the site copyright. The mobile sheet
  keeps the navigation group.
- **Right rail collapsible sections**: widgets grouped in the order 登录 →
  日历 → 网站统计 → 动态 → 文章分类 → 标签云 → 文章归档; 「动态」(latest
  posts / latest comments tabs) is the only group open by default. Sections
  are React-controlled (`RailSection`), not `<details>`, because the native
  element misbehaved during hydration.
- **Right rail breakpoints**: `<1280` single column; `1280–1535` left rail +
  content with no gap placeholder (the outer wrapper carries the breakpoint
  classes, so the `sidebar-gap` element hides with it) and a Header toggle
  opens the right rail as an overlay (backdrop + Esc/click to close; the
  overlay provides its own `MotionHighlight` provider because it renders
  outside the Sidebar primitive's provider tree); `≥1536` both rails fixed.
- **Header height tracking**: rail offsets use `--header-height` (64px). The
  banner-state header is 80px, but rails are hidden there; once they fade in
  the header is already in content state, so no overlap occurs. The 80→64
  transition itself is the owner's designed effect and stays.
- **Announcements (WordPress CPT)**: `maltose_announcement`, untitled
  (auto-generated title `公告 · Y-m-d H:i`), publish date / modified date /
  content / sticky meta; exposed through WPGraphQL
  (`MaltoseAnnouncement.sticky`). Announcement content is content-shaped data,
  so it lives in posts rather than options — the management UI (native editor
  today, frontend admin later) edits it, while post state/dates/revisions
  come for free. Registered in `MaltoseDataRegistry` (`post_type` medium) so
  the uninstall wizard previews and cleans it.
- **Social links & blog owner (WordPress options)**: `maltose_social_links`
  (JSON: label / url / iconType "url"|"iconify" / icon) and
  `maltose_owner_user_ids` (user IDs), exposed via `RootQuery.siteConfig`
  (social list + first owner's name / description / avatar url / url). The
  author card and the comment "blog owner" badge share the owner selection.
  Both options are registered in `MaltoseDataRegistry`. The legacy
  `BLOG_OWNER_USER_IDS` env var remains as a migration fallback only.
- **Astro queries fail soft**: `siteConfig` and `maltoseAnnouncements` are
  queried separately from `layoutQuery` (menu + site identity) so a WP
  deployment without the new GraphQL fields degrades gracefully instead of
  failing the whole layout query.

## Consequences

- No more layout-model flip when navigating; the scroll language (dissolve /
  tint / rail fade) is one consistent scroll-linked family.
- The rails hide over the banner, so the wallpaper stays unobstructed; the
  header owns brand + navigation permanently.
- Announcements and social/owner config are WordPress-managed; a later
  frontend admin UI (Argon-style top-level menu) is out of scope here.
- Left rail has an intentional empty area reserved for future modules.

## Alternatives considered

- **Restore the pre-existing fixed rails unchanged** — rejected: they covered
  the banner's left edge, hiding the wallpaper carousel.
- **Keep the in-flow sticky variant and fix its sticky wrapper** — rejected:
  keeps two layout models and the navigation flip.
- **Store announcements in options** — rejected: multi-entry dated content
  with publish/edit semantics belongs in posts; options would require building
  a CRUD UI and manual date handling.
- **ACF or other meta frameworks** — rejected: no such dependency exists; the
  `get_option` + `register_graphql_field` pattern matches the theme's existing
  settings bridge.
