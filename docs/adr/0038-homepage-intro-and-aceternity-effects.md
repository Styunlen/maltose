# ADR-0038: Full-Bleed Homepage Introduction with Official Aceternity Effects

- Status: Superseded by [ADR-0040](0040-homepage-banner-scroll-transition.md)
  (the Welcome Gate paradigm is removed; the official-Aceternity-effects
  decision in §2 remains in force)
- Date: 2026-09-11

## Context

The homepage needs a welcome entry followed by a full-screen brand
introduction. The first implementation rendered both surfaces inside the
normal `SidebarInset` and used hand-written CSS effects that resembled
Aceternity components. This caused two problems:

1. The fixed sidebars could cover or compete with the full-screen introduction.
2. The implementation did not satisfy the requirement to use Aceternity's
   installable components rather than visual imitations.

The site already has a persisted homepage-effects setting and a
`prefers-reduced-motion` policy. The owner explicitly accepts the measured
cost of Aceternity's Dotted Glow and Background Beams effects, while requiring
the official installation path and review before any modification to copied
component source.

## Decision

### 1. Homepage introduction owns the first viewport

The first-page homepage renders its Welcome Gate and Brand Hero before the
normal sidebar/content shell. The fixed global Header remains available above
the introduction. Left and right sidebars begin with the content shell after
the Brand Hero and must not overlay the introduction. Non-home routes retain
the existing shell layout.

### 2. Effects use official Aceternity components

The project installs Aceternity components through the official `@aceternity`
shadcn registry. The homepage composes the official Dotted Glow Background and
Background Beams components without editing their generated source. Local
wrappers may provide site content, theme values, effect toggling, and layout;
they must not reimplement the component algorithms.

### 3. Interaction and accessibility remain explicit

The Welcome Gate keeps pointer, touch, keyboard, and delayed entry. Keyboard
entry is limited to intentional activation keys, focus is managed across the
gate-to-hero transition, and ClientRouter swap cleanup remains mandatory.
The persisted effects setting can disable decorative effects, while reduced
motion overrides animation regardless of the setting.

## Consequences

- The homepage introduction is no longer constrained by the sidebar grid.
- Sidebar geometry and interaction remain available for the content that
  follows the introduction.
- Aceternity source updates can be pulled through the official installer; local
  visual customization stays in wrappers and composition styles.
- Dotted Glow and Background Beams remain an intentional homepage cost, with a
  user-facing off switch and reduced-motion override.
- Any future change to the generated Aceternity source requires human review
  before implementation.

## Alternatives considered

- **Keep Hero inside `SidebarInset` and raise its z-index** — rejected: this
  hides sidebar interaction under the hero and does not fix the underlying
  layout boundary.
- **Continue with hand-written CSS approximations** — rejected: it does not
  meet the requirement to use the official Aceternity components.
- **Install a separate animation library** — rejected: the repository already
  has the dependencies required by the official Aceternity components.
