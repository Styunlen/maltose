# ADR-0039: Desktop Banner Header and Sticky Sidebar States

- Status: Accepted
- Date: 2026-09-11

The first page of the homepage uses a full-viewport Banner introduction before the content shell. Its desktop Header remains visible rather than hiding on scroll: it is transparent and approximately 80px in Banner state only at zero document scroll, then any positive desktop document scroll changes it to an approximately 64px Content state. The Content state uses the project theme background with light blur, no bottom shadow or border, and a tint that strengthens progressively through the introduction range. Desktop sidebars retain their current information architecture, but focused navigation, search, directory, and utility regions may become sticky within the content shell while long lists remain in normal document flow; neither sidebar may cover the Banner.

Mobile is a separate client surface on the same URL, not a CSS-scaled desktop layout. Mobile redesign is deferred and will later use a WebApp-oriented information architecture, with a fixed bottom navigation and a separate More surface as the initial interaction direction.

## Consequences

- The desktop Header needs a Banner/Content visual state boundary scoped to the first homepage page: Banner at zero document scroll, Content at any positive desktop document scroll.
- The Content background tint should strengthen progressively through the introduction range while preserving the opaque theme background and light blur.
- Header height changes must not move the document or create a scroll jump.
- Desktop sticky regions must use the active Content Header height as their top offset.
- Non-home routes and homepage pagination keep the normal Content Header state.
- Mobile work remains outside this desktop refactor and must not be treated as responsive cleanup.

## Considered Options

- **Hide the Header while scrolling down** — rejected: the Header remains available for navigation and utilities.
- **Make the entire left and right sidebars independently scrollable** — rejected: only focused regions should remain visible; long content belongs to the document flow.
- **Reuse the desktop shell with responsive CSS adjustments for mobile** — rejected: mobile is a separate WebApp client surface with its own information architecture.
