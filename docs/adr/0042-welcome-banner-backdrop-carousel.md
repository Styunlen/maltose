# ADR-0042: WelcomeBanner Backdrop Random Image Carousel

- Status: Accepted
- Date: 2026-10-14

## Context

The owner asked for the reference blog's WelcomeBanner backdrop: a random
rotation through several images with a slow crossfade ("随机渐变轮播图片",
"也可以参考开发"). Reference measurements: 9 slides, random order per load,
~5.5s per slide, 1.2s crossfade, opacity-based, images stacked in a fixed
backdrop layer. The owner will provide the actual images; none exist in the
repository yet.

## Decision

- A carousel layer inside the fixed WelcomeBanner backdrop: stacked,
  full-bleed images crossfading via opacity only, under a brand-gradient veil
  (the banner gradients at ~0.68 opacity) so the brand tint is preserved.
- Source: `src/assets/banner/` scanned at build via `import.meta.glob`
  (hashed, optimized URLs). Until the owner's images arrive, brand-gradient
  placeholder SVGs (`banner-*.svg`) ship in that folder; dropping real images
  in and rebuilding replaces them (delete the placeholders then).
- Behavior: random order per page load, 5.5s per slide, 1.2s crossfade;
  paused while the tab is hidden or the backdrop is scrolled out of view;
  a single static image under `prefers-reduced-motion`.
- The existing dissolve (ADR-0041 §3) and the Aceternity effect layers stay
  above the carousel; the carousel never receives pointer events and stays
  `aria-hidden`.

## Consequences

- The owner's drop-in flow: place files in `src/assets/banner/`, rebuild, done.
- Placeholder images must be deleted when real photography lands.
- The carousel is inert (no autoplay) under reduced motion and when hidden.

## Alternatives considered

- **URL-list configuration** — adopted in the 2026-11-18 update below (runtime
  `public/banner-urls.json`, remote wallpapers).
- **CSS-generated gradients only** — rejected: the owner wants image content.
- **JS fetch of a manifest at runtime** — rejected: a build-time scan keeps
  the page self-contained and cache-friendly.

## Update — 2026-11-18: runtime URL list (remote wallpapers)

To avoid serving image traffic from the blog server, the carousel now prefers a
runtime URL list:

- `public/banner-urls.json` — an array of `http(s)` URL strings (or objects with
  a `url` field), deduped and capped at 40. Read per request and cached by file
  mtime, so editing it on the server takes effect without a rebuild;
  `BANNER_URLS_FILE` overrides the path. Empty/unreadable/invalid JSON falls
  back to the bundled `src/assets/banner/` placeholders.
- The list is shuffled per request; **all** listed URLs participate in the
  5.5s / 1.2s rotation. Failed images are marked broken and skipped.
- Images load directly from the remote host (e.g. Bing CDN) in the visitor's
  browser with `referrerpolicy="no-referrer"`; the server only serves URLs.
- `node scripts/bing-wallpapers.mjs [count] [market]` refreshes the JSON from
  Bing's `HPImageArchive` API (default 8, `zh-CN`). Run it in the deploy
  directory on the server to update wallpapers without a rebuild, or locally
  and ship the JSON.

