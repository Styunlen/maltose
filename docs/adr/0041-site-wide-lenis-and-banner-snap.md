# ADR-0041: Site-Wide Lenis Inertia and the WelcomeBanner Full-Screen Snap

- Status: Accepted
- Date: 2026-10-14

## Context

The owner asked for the reference blog's interaction feel (blog.xhja.cn): on
the WelcomeBanner, a light scroll should automatically complete a full-screen
switch into the content; at the content top, a light upward scroll should
switch back to the WelcomeBanner. The owner explicitly asked for the
reference's Lenis inertia site-wide, and for the same snap behavior on touch
devices.

Reference measurements (consistent across sessions): Lenis defaults with
`duration: 1.2s`, `smoothWheel: true`, `syncTouch: false`, `wheelMultiplier:
1`, default easing; the reference itself is continuous scrolling with no snap
— the snap is an owner-requested enhancement on top of the same feel.

Existing constraints: ClientRouter swaps the body on navigation; several
inner scrollables exist (settings dialogs, drawer, mobile sidebar sheet, code
blocks/editors, tables); `prefers-reduced-motion` is honored across the site;
programmatic smooth scrolls exist across the comment, article, and sidebar
surfaces.

## Decision

### 1. Lenis site-wide (desktop smoothing, native touch)

`lenis` runs on every page with reference-like defaults (`duration: 1.2`,
default easing, `smoothWheel`), and `syncTouch: false` so touch keeps native
scrolling. One instance per full page load; exposed as `window.__lenis` for
the snap controller and tests. Skipped entirely under
`prefers-reduced-motion` (native scroll; snap completes instantly without
animation). Inner scrollables are marked `data-lenis-prevent`; programmatic
scrolls go through a shared helper that prefers `lenis.scrollTo`.

### 2. The WelcomeBanner snap model (release-to-snap, "松手吸附")

Rest positions are `0` (WelcomeBanner) and `≥ H` (content, where `H` is the
banner height):

- Banner → content: any downward intent completes a full-screen switch to
  `H` on release. A light scroll alone is enough.
- Content top → banner: any upward intent at `H` completes a full-screen
  switch back to `0` on release.
- Deep content → top: upward scrolling is absorbed at `H` (stops there); a
  further deliberate upward gesture at `H` returns to the WelcomeBanner
  ("到顶后再滑" — momentum pass-through was explicitly rejected).
- Mid-gesture reversal cancels; during a completion animation,
  same-direction input is ignored and opposite input cancels/reverses.
- Keyboard PageUp/PageDown follow the same rules. Touch follows the same
  rules via scroll-idle settle so native inertia is respected.

### 3. Transition visuals unchanged

The existing dissolve (backdrop opacity/blur driven by scroll progress) is
the transition visual; the snap only drives the scroll position. The
Reference backdrop carousel (ADR-0042) is an independent backdrop layer.

## Consequences

- The scroll feel changes site-wide (smoothed wheel). Comment jump links,
  anchor jumps, back-to-top, and page-transition scroll resets are routed
  through or verified against Lenis.
- The `html.smooth-scroll` navigation hack is disabled while Lenis is active
  to avoid double-smoothing.
- Touch keeps native scrolling; the snap on touch is settle-based and may
  feel slightly softer than desktop.
- `docs/glossary/welcome-banner.md` defines the domain terms; DESIGN.md §5/§6
  describe the implemented states and timings.

## Alternatives considered

- **fullpage-style pager** — rejected: only the first screen snaps; content
  must scroll freely.
- **CSS scroll-snap** — rejected: cannot express absorb/cancel/direction
  rules, and conflicts with Lenis smoothing.
- **Custom inertia without `lenis`** — rejected: the owner asked for the
  reference's Lenis feel specifically.
- **`syncTouch: true` (Lenis-managed touch)** — deferred: keeps the native
  mobile baseline; revisit if the touch snap feels too soft.
- **Momentum pass-through at the content top** — rejected by the owner
  ("reach the top, then swipe again").

## Update — 2026-11-18: speed-threshold page switch

The release-to-snap interaction above was replaced after an owner review. Slow
wheel gestures now scroll freely and may rest anywhere in the banner; only
gestures whose measured wheel speed crosses the threshold (default 1200px/s,
computed over the last ~250ms with an 80ms minimum span and at least two wheel
events) switch whole pages, and only when the gesture began in the banner.
Gestures that begin in the content never switch; deep-origin upward gestures
still absorb at H and need a fresh gesture to switch back. The completion
animation keeps the velocity-matched Hermite curve with a distance-scaled
duration (0.3–1.2s). Touch page switching is deferred until the mobile web-app
rewrite. Implementation: `switchTarget()` in `src/lib/banner-snap.ts`, speed
tracking in `src/scripts/banner-snap.ts`; `?snapvelocity=` and `?snapfeel=` are
temporary tuning switches.

