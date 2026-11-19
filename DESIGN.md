# Maltose Design System

## 1. Atmosphere & Identity

Maltose is a mint-green technical editorial site: disciplined typography and
clear content structure are softened by a bright, tactile brand atmosphere.
The signature moment is the homepage banner: a full-bleed mint brand surface
with a real illustration that dissolves with scroll into the readable content
shell, and restores when the visitor scrolls back to the top.

## 2. Color

### Palette

The existing CSS custom properties are the source of truth. Components use
semantic variables rather than new literal colors.

| Role             | Token                            | Light                                 | Dark               | Usage                        |
| ---------------- | -------------------------------- | ------------------------------------- | ------------------ | ---------------------------- |
| Page surface     | `--background`                   | `--base-color-primarybg`              | theme dark value   | Document canvas              |
| Elevated surface | `--card`                         | `--base-color-white`                  | theme dark value   | Cards and panels             |
| Primary accent   | `--primary`                      | `--primary-color` (`#00f0a0`)         | theme dark value   | Focus, action, brand energy  |
| Secondary accent | `--accent`                       | `--base-color-lightgreen` (`#90fadc`) | theme dark value   | Hero light and soft emphasis |
| Primary text     | `--foreground`                   | `--base-color-black`                  | theme dark value   | Body and display text        |
| Muted text       | `--muted-foreground`             | semantic color-mix                    | semantic color-mix | Hints and metadata           |
| Border           | `--border`                       | `--base-color-black-10`               | theme dark value   | Dividers and rims            |
| Mint ramp        | `--mint-50` through `--mint-950` | OKLCH ramp                            | same semantic ramp | Brand surfaces and chips     |
| Effect dot       | `--home-dot-color`               | semantic mint mix                     | semantic mint mix  | Official Dotted Glow dots    |
| Effect glow      | `--home-glow-color`              | `--primary`                           | `--primary`        | Official Dotted Glow glow    |

### Rules

- Use semantic variables and the existing mint/magenta/violet/coral/amber
  ramps. Do not add a second primary accent.
- Aceternity demo colors are not copied into the brand surface. Theme values
  are supplied through wrapper props or CSS variables.
- Decorative effect layers never carry meaning and are `aria-hidden`.

## 3. Typography

### Scale

The existing scale is fluid where the surface needs to respond to its
container. Display text uses `clamp()` and tight tracking; body text remains
readable at the site's 18px base size.

| Level           | Token / size                     | Weight  | Line Height              | Usage                  |
| --------------- | -------------------------------- | ------- | ------------------------ | ---------------------- |
| Brand display   | `clamp(3rem, 12vw, 8.5rem)`      | 800     | 0.92                     | Homepage title         |
| Hero lead       | `clamp(1.15rem, 3.4vw, 2.7rem)`  | 800     | 1.18-1.25                | Brand slogan           |
| Section heading | existing `1.25rem` section style | 700     | browser default          | Content headings       |
| Body            | 18px site base                   | 400-700 | existing component rules | Article and cards      |
| Mono overline   | `clamp(0.68rem, 2.4vw, 0.82rem)` | 700     | existing                 | Banner and hero labels |

### Font Stack

- Display: Space Grotesk
- Body: Nunito, MiSans, PingFang SC, Hiragino Sans GB, Microsoft YaHei,
  Noto Sans SC, system sans-serif
- Mono: JetBrains Mono

### Rules

- Keep Chinese display copy together with balanced wrapping where possible.
- Do not introduce Inter or a second display family.
- Meaningful images retain descriptive alt text.

## 4. Spacing & Layout

### Base Unit

The base rhythm is 4px, expressed primarily through Tailwind spacing and
`rem` values. Fluid `clamp()`, intrinsic sizing, and viewport units are layout
mechanics rather than new spacing tokens.

| Token        | Value | Usage                          |
| ------------ | ----- | ------------------------------ |
| `--space-1`  | 4px   | Icon and label gap             |
| `--space-2`  | 8px   | Compact control spacing        |
| `--space-4`  | 16px  | Main content padding           |
| `--space-6`  | 24px  | Tablet/desktop content padding |
| `--space-10` | 40px  | Section separation             |
| `--space-16` | 64px  | Large content rhythm           |
| `--space-20` | 80px  | Hero breathing room            |

### Grid and Scroll Ownership

- The document owns vertical scroll. The fixed Header is viewport-level.
- The homepage brand banner is a `cover`-like viewport surface and owns no
  nested scroll container.
- The post-intro content is a `sidebar` shell: fixed side navigation plus a
  fluid main region. The document remains the sole vertical scroll owner.
- Homepage flow: Header visually above the brand banner, then
  `SidebarProvider` content shell. The side rails are one unified fixed-rail
  model on every route; on the first homepage page they are hidden over the
  banner and fade in across the last 80px of it, fully visible at the content
  top (ADR-0043). They never cover the banner.
- Existing content shell max width remains 5xl; the brand banner surface is
  full width.
- Breakpoints remain the existing Tailwind/Sidebar thresholds, with explicit
  verification at 375px, 768px, 1280px, and 1536px. Right rail: hidden with no
  gap placeholder at 1280–1535 (Header toggle opens it as an overlay), fixed
  at ≥1536 (ADR-0043).

## 5. Components

### Full-Bleed Brand Banner

- **Structure**: semantic section with brand copy, shared title lockup, real
  illustration frame, and a bouncing scroll cue, over a fixed decorative
  backdrop carrying brand gradients, rim, the random image carousel
  (`src/assets/banner/`, ADR-0042) under its gradient veil, and the official
  effect layer. The carousel sits at `z-index: -2`, the veil at `-1`, the
  backdrop rim and effects above it; the carousel is `aria-hidden` and never
  receives pointer events.
- **Variants**: light/dark theme, effects on/off, reduced motion, desktop
  split layout and mobile stack; carousel auto-rotates (~5.5s/slide, 1.2s
  crossfade), pauses while the tab is hidden or the banner is scrolled out,
  and stays static under reduced motion.
- **States**: at rest; dissolving with scroll (`opacity: 1 - progress`,
  `blur(20px × progress)`); hidden past one viewport of scroll; restored on
  scroll-up; release-to-snap completes a gesture ending in the transition
  zone to `0` or `H` (ADR-0041).
- **Accessibility**: labelled region with a programmatic-only focus target;
  the backdrop, cue, and carousel are `aria-hidden` and receive no pointer
  events; the content shell is never inert (there is no gate).
- **Motion**: the scroll-linked dissolve, the carousel crossfade, and the
  snap completion are the only banner motions; no entrance keyframes, no
  independent ambient loops beyond the approved Aceternity effects; the cue
  bounce and carousel rotation are removed under reduced motion.
- **Layout**: `cover`-like first viewport in normal document flow; backdrop is
  `position: fixed; z-index: -1`; the document owns scroll.

### Site-Wide Smooth Scrolling (Lenis)

- **Structure**: one Lenis instance per full page load
  (`src/scripts/smooth-scroll.ts`), exposed as `window.__lenis`; the snap
  controller (`src/scripts/banner-snap.ts`) plugs into its `virtualScroll`
  hook; programmatic scrolls prefer it via `src/lib/scroll.ts`.
- **Variants**: desktop wheel smoothing (`duration: 1.2`, reference feel),
  native touch (`syncTouch: false`), and a no-instance mode under reduced
  motion (native scrolling, instant snap completion).
- **Accessibility**: honors `prefers-reduced-motion` live (destroy/create on
  media change); inner scrollables (`data-lenis-prevent*`) keep native
  scrolling.
- **Motion**: standard Lenis wheel easing; page-transition navigation stops
  and restarts the instance around the ClientRouter swap.

### Official Aceternity Effect Layer

- **Structure**: local wrapper composing official `DottedGlowBackground` and
  `BackgroundBeams` components installed from the `@aceternity` registry.
- **Variants**: enabled, persisted disabled (live settings toggle),
  reduced-motion unmounted, and unmounted while the banner is scrolled out of
  view (IntersectionObserver on the banner section).
- **States**: enabled, disabled, theme-resolved, reduced-motion.
- **Accessibility**: `aria-hidden=true`, `pointer-events:none`.
- **Motion**: official Canvas dot loop and official Motion/SVG beams only; no
  local algorithm replacement. Both loops mount at load when enabled and
  unmount when the banner leaves the viewport.
- **Layout**: absolute layer inside the fixed banner backdrop; banner copy
  remains the LCP and interaction layer.
- **Sources**: [Background Beams](https://ui.aceternity.com/components/background-beams)
  and [Dotted Glow Background](https://ui.aceternity.com/components/dotted-glow-background)
  are installed from the configured `@aceternity` registry; the local wrapper
  only composes them and supplies project tokens.

### Live2D Avatar

- **Variants**: persisted visible/hidden preference, desktop-only mount.
- **Motion**: the WebGL viewer mounts at load on desktop when the persisted
  preference is visible; there is no gate deferral or reveal timer.
- **Layout**: fixed lower-right desktop overlay beneath the banner content; it
  is not mounted where its `lg`-only surface is hidden.

### Post-Intro Sidebar Shell

- **Structure**: global Header, SidebarProvider, left sidebar, SidebarInset,
  right sidebar, footer.
- **Variants**: normal route shell and homepage post-intro shell (rails fade
  in past the banner; ADR-0043).
- **States**: expanded/collapsed desktop sidebar, mobile sheet, route swap,
  right-rail overlay (1280–1535px).
- **Accessibility**: existing sidebar primitives and keyboard shortcut remain;
  the overlay closes on Esc/backdrop; the shell is never inert (no gate
  overlay exists).
- **Motion**: existing sidebar spring and route progress behavior; the rail
  fade-in is scroll-linked (80px range), not timed.
- **Layout**: `sidebar`; document is the scroll owner.

## 6. Motion & Interaction

### Timing

| Type            | Duration                 | Easing                        | Usage                                             |
| --------------- | ------------------------ | ----------------------------- | ------------------------------------------------- |
| Micro           | 100-200ms                | ease-out                      | Existing controls and focus feedback              |
| Standard        | 200-300ms                | ease-in-out                   | Existing panels and route affordances             |
| Banner dissolve | scroll-linked (no timer) | rAF-throttled linear progress | Backdrop opacity/blur through the first viewport  |
| Snap completion | 1.2s (0.35s small steps) | default Lenis easing          | Banner ↔ content full-screen completions          |
| Lenis wheel     | 1.2s                     | default Lenis easing          | Site-wide wheel smoothing                         |
| Carousel slide  | 1.2s crossfade           | ease                          | Backdrop image crossfade (5.5s per slide)         |
| Scroll cue      | 2s, infinite             | ease-in-out                   | Banner resting hint; removed under reduced motion |

### Rules

- Motion serves the scroll transition or a real control state; no decorative
  local loops remain outside the approved Aceternity components.
- `prefers-reduced-motion: reduce` takes precedence over the settings toggle.
- Effect loops are not mounted when effects are disabled, reduced motion is
  active, or the banner is scrolled out of view. Decorative layers do not
  receive pointer events.
- ClientRouter swaps clean every listener, timer, observer, and animation
  frame owned by the banner script or effect wrapper.

## 7. Depth & Surface

### Strategy

Mixed: the content shell uses existing tonal surfaces and subtle borders; the
banner uses layered gradients, a rim, an illustration frame, and theme-colored
shadow. Decorative depth must not become a second navigation layer.

### Rules

- Banner atmosphere is layered behind copy and image, never over interactive
  content.
- The illustration is the focal object; effects support its silhouette instead
  of competing with it.
- Avoid adding broad `backdrop-filter` or unbounded blur. The banner dissolve
  blur is the only sanctioned full-layer blur: scroll-bound, capped at 20px,
  and skipped under reduced motion.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA target: 4.5:1 body contrast / 3:1 large text contrast.
- Every interactive element has keyboard access, visible focus, and pressed or
  active feedback.
- No gate or dialog exists; the content shell is never inert and keeps normal
  focus behavior. The banner stays a labelled, programmatically focusable
  target.
- Reduced motion removes non-essential motion and prevents effect loops from
  mounting.
- No horizontal scrolling at 375px, 768px, 1280px, or 1536px.

### Accepted Debt

| Item                                                    | Location                                       | Why accepted                                                                                                                                  | Owner / Exit                                                            |
| ------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Official Background Beams renders many SVG/Motion paths | `src/components/ui/background-beams.tsx`       | Explicitly approved by the owner after performance testing; cost re-measured during the banner scroll (ADR-0040); source must remain official | Revisit only if real-device QA shows regression                         |
| Official Dotted Glow owns a visible Canvas RAF loop     | `src/components/ui/dotted-glow-background.tsx` | Explicitly approved; wrapper unmounts it for reduced motion/off state and while the banner is out of view                                     | Revisit only if real-device QA shows regression                         |
| External brand illustration is eager-loaded             | `src/components/Hero.astro`                    | It is the first-viewport focal object and must avoid a blank banner                                                                           | Replace with an optimized same-origin asset when the owner supplies one |
