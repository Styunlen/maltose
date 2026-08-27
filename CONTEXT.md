# Maltose — Domain Context

Headless WordPress blog built with Astro 7 (SSR, Node adapter) + React + Tailwind v4 + shadcn-style components. Data flows: browser → Astro SSR → `/api/graphql-proxy` (signature-verified) → WPGraphQL on `styunlen.cn`.

## Reading this repo

- **ADRs** live in `docs/adr/` (numbered `0001-…` – `0035-…`). Read the ones touching the area you're working in. The most load-bearing: `0024` (in-process LRU cache / SWR), `0025` (hover link preview), `0026` (site stats dashboard + comment geo), `0030` (mutation auth), `0032` (cache driver), `0033` (CI/CD deploy), `0034` (runtime env), `0035` (friends data cache).
- **Glossary** lives in `docs/glossary/` (e.g. `lru-cache.md`, `comment-message.md`, `hydration.md`, `stale-content.md`).
- **Source aliases**: `@/` → `src/`, `@api` → `src/api`, `@components` → `src/components`, `@lib` → `src/lib`.

## Core architecture

- **Caching**: all GraphQL queries flow through an in-process LRU cache link (`LruLink`, `src/lib/lru-link.ts`) with stale-while-revalidate. Strong-consistency queries (`GetNodeByURI`/`GetPost`) wait for the network; comment mutations invalidate affected cache prefixes (`GetNodeByURI:` / `TimelineStats:` / `HomePosts:` …).
- **WP theme** (`wordpress-theme/`): a "pure function" theme exposing custom GraphQL fields (post views, sticky posts, comment geo `commentGeo`, agent public UA, OTP email, geo stats). IP → geography via offline CIDR tables (`MaltoseIpResolver`); WPGraphQL's native `authorIp` is capability-gated so geo is exposed server-side only.
- **Auth**: Authentik OIDC → WP token (`wp_token` cookie) → `Astro.locals.user` / `wpUserId`. Passwordless OTP + password flows.
- **Comments**: React client component (`CommentSection.tsx`) with chat-bubble UI, Markdown (Cherry editor), reply popups, owner badge (`BLOG_OWNER_USER_IDS`, comma-separated, default `1`).
- **Article page** (`Single.astro`): Long-Document hero, stale-content notice (>90 days), tag chips, copyright card, prev/next nav, author card, comments, related posts.
- **Pagination**: path-based `/page/N` for home / timeline / archive (SEO-friendly) with `rel="canonical"` (query params stripped).

## Design system

Mint-green theme (user's final choice): `--primary` / `--ring` = `#00f0a0`, `--accent` = `#90fadc`. Five accent ramps (mint / magenta / violet / coral / amber) drive postcard tag & category chips via a deterministic name→hue hash. Typography: Space Grotesk (display) + Nunito (body) + JetBrains Mono (code). `.dark` is scoped via `:global(.dark)` or `html.dark`; note Astro scoped CSS can't nest `.dark` selectors.

## Deployment

GitHub Actions `Deploy Staging` on `develop` push → rsync to server → `pnpm install` + pm2 reload. Push uses SSH port 443. `docs/blog/` is never committed.
