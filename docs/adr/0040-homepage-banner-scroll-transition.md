# ADR-0040: Homepage Banner Scroll Transition (Welcome Gate Removal)

- Status: Accepted
- Date: 2026-10-10

## Context

ADR-0038 framed the homepage first visit as a Welcome Gate (intentional or
delayed entry) handing the visitor into a full-bleed Brand Hero. In practice
the gate accumulated a phase chain (typing, waiting, release, effects
suspension, avatar deferral) and drew repeated real-device jank complaints
during the gate window and its exit — even after the effect layers were gated,
the avatar deferred, and the exit blur measured. Profiling attributed the
typing-phase cost to page load/hydration and the exit cost to full-screen
re-raster plus layer remounts.

The owner therefore directed a paradigm replacement (2026-10-10): stop
refining the gate; render the homepage as two sequential surfaces of one
document, mirroring the reference site structure (blog.xhja.cn) — a
full-viewport banner that dissolves on scroll into the content shell, and
restores when the visitor scrolls back to the top. The reference mechanics
were verified in-browser: a fixed backdrop layer at `z-index:-1`,
`progress = scrollY / innerHeight` driving `opacity: 1 - progress` and
`blur(20px * progress)`, native scroll ownership, no scroll snapping, no
wheel hijacking, and no click gate.

## Decision

### 1. The homepage lands directly on the brand banner

The Welcome Gate dialog is removed. The first homepage viewport is the brand
banner: brand copy, illustration, and a bouncing scroll cue. There is no
click/keyboard entry, no auto-entry timer, and no focus trap; the content
shell is never inert. The global Header keeps its Banner/Content states
(ADR-0039).

### 2. The banner is a fixed backdrop that dissolves with scroll

The banner visual layer (`[data-brand-backdrop]`) is a fixed, `aria-hidden`,
`pointer-events:none` backdrop at `z-index:-1` that carries the brand
gradients, rim, and the official Aceternity effect layer. A rAF-throttled
scroll/resize listener computes `progress = clamp(scrollY / innerHeight, 0, 1)`
and applies `opacity: 1 - progress` plus `blur(20px * progress)`; at
`progress >= 1` the backdrop switches to `data-state="hidden"`
(`visibility: hidden`) and restores continuously on scroll-up. The document
remains the sole scroll owner: no smooth-scroll dependency, no scroll-jacking,
no snap points.

### 3. Motion and accessibility policies carry over

`prefers-reduced-motion: reduce` skips the blur channel entirely (opacity fade
only), disables the scroll-cue animation, and never mounts the Aceternity
effect layer. The persisted homepage-effects setting still toggles the effect
layer live (attribute-driven, mutation-observed); reduced motion overrides the
setting. The backdrop and scroll cue never receive pointer events and stay
hidden from assistive technology; the banner section remains a labelled,
programmatically focusable region.

### 4. Effect and avatar mounting are simplified

The Aceternity effect layer mounts at load when enabled and unmounts while the
banner is fully scrolled out of view (IntersectionObserver threshold 0.01 on
the banner section). The Live2D avatar mounts at load on desktop (`lg`+, via
its `min-width: 64rem` gate) when the persisted preference is visible. The
gate-era suspension events (`maltose:welcome-done`, deferred mount timers,
`data-homepage-sidebar-shell`/`inert` wiring) are removed.

### 5. ClientRouter cleanup remains mandatory

The banner scroll script is a `data-astro-rerun` island: it removes its
scroll/resize/media listeners and cancels its rAF on `astro:before-swap`, and
re-initializes on each homepage arrival.

## Consequences

- The Welcome Gate implementation (`WelcomeGate.astro`,
  `WelcomeGateTitle.tsx`, `ui/text-generate-effect.tsx` + test) was
  deleted on 2026-10-14; the banner model supersedes the gate.
- No gate-window load or exit phase exists anymore; the dissolve itself adds
  no measurable cost beyond painting backdrop opacity (measured under 4× CPU
  throttle at DPR2: blur-on ≈ blur-off frame deltas).
- The remaining throttled-device scroll cost is dominated by the approved
  ambient effects (ADR-0038 §2): p50 ≈ 27 ms with effects on vs ≈ 10 ms with
  effects off (Live2D alone ≈ 15 ms), versus the reference site ≈ 8 ms.
  Unthrottled desktop baseline is p50 ≈ 8 ms with zero >33 ms frames. This
  stays accepted debt, now also covered by the live settings toggle and the
  reduced-motion override.
- DESIGN.md §5/§6 and CONTEXT.md "Homepage introduction" describe the banner
  model; Welcome Gate copy is retired from the design docs.

## Alternatives considered

- **Keep the gate and continue optimizing its jank** — rejected by the owner
  directive: the gate phase chain (load-time typing storm, full-screen
  release) was the jank source; removing the paradigm removed the phase.
- **Adopt Lenis smooth scrolling like the reference** — deferred: the
  reference feel is reproduced with zero new dependencies; native scroll keeps
  scrollbar, keyboard, and anchor behavior standard. Revisit separately if the
  owner wants the inertia feel.
- **IntersectionObserver instead of a scroll listener** — rejected: the
  dissolve needs continuous progress values, not threshold crossings; a
  rAF-throttled passive listener is the smallest correct mechanism.
- **Wrap the banner in a sticky section instead of a fixed backdrop** —
  rejected: the visual layer must remain motionless behind moving content;
  `position: sticky` would move the layer with the document.
