# Aceternity UI installation research

**Checked:** 2026-09-11  
**Scope:** official Aceternity UI docs/registry; Astro hydration only where relevant.

## Findings

| Topic | Official evidence | Implementation implication |
|---|---|---|
| Initialize shadcn | [Aceternity CLI docs](https://ui.aceternity.com/components/cli#initialization) says `npx shadcn@latest init`; it installs dependencies, `cn`, Tailwind configuration, and CSS variables. | This repository already has shadcn-style utilities and should not re-run `init` blindly; verify `components.json` and `src/lib/utils.ts` first. |
| Add by direct registry URL | [CLI docs](https://ui.aceternity.com/components/cli#installation-through-cli) documents `npx shadcn@latest add https://ui.aceternity.com/registry/[component].json`. | Fallback commands: `npx shadcn@latest add https://ui.aceternity.com/registry/background-beams.json` and `.../dotted-glow-background.json`. |
| Add with namespaced registry | [CLI docs](https://ui.aceternity.com/components/cli#shadcn-cli-3.0) documents adding `"@aceternity": "https://ui.aceternity.com/registry/{name}.json"` under `registries`, then running `npx shadcn@latest add @aceternity/[component]`. | Preferred commands: `npx shadcn@latest add @aceternity/background-beams` and `npx shadcn@latest add @aceternity/dotted-glow-background`, once the registry entry exists. |
| Background Beams | [Component page](https://ui.aceternity.com/components/background-beams#installation) gives `npx shadcn@latest add @aceternity/background-beams`. [Official registry entry](https://ui.aceternity.com/registry/background-beams.json) declares dependency `motion`, and targets `components/ui/background-beams.tsx`. | The repo already has `motion`; preserve the generated React file under the configured shadcn components path (likely `src/components/ui/`) and check the `@/lib/utils` alias. |
| Dotted Glow Background | [Component page](https://ui.aceternity.com/components/dotted-glow-background#installation) gives `npx shadcn@latest add @aceternity/dotted-glow-background`. [Official registry entry](https://ui.aceternity.com/registry/dotted-glow-background.json) has no package dependency and targets `components/ui/dotted-glow-background.tsx`. | The component is a client-side canvas effect. It needs a browser-hydrated React island and a containing element with usable dimensions. |
| Copied source model | Aceternity describes the components as [free, copy-paste components](https://ui.aceternity.com/components), while the registry returns source files into the app rather than a runtime Aceternity package. | Treat the component as application-local copied source: review, format, test, and adapt it locally; do not expect package upgrades to update it automatically. |
| Redistribution/licensing | Aceternity's [license](https://ui.aceternity.com/licence) permits modification and end products, but prohibits redistributing the item/source files as stock assets and says third-party parts retain their own licenses. | Shipping the component inside this site is consistent with an end product. Do not publish the copied component source as a standalone registry/package/template without checking the applicable license. The page is a Pro license page, so confirm terms for the exact free item if redistribution matters. |

## Astro + React relevance

Astro renders framework components statically unless a `client:*` directive is used. The official Astro guide says [`client:load`](https://github.com/withastro/docs/blob/main/src/content/docs/en/guides/framework-components.mdx) hydrates on load, [`client:visible`](https://github.com/withastro/docs/blob/main/src/content/docs/en/reference/directives-reference.mdx) hydrates when entering the viewport, and `client:only` skips server rendering. The registry source for both effects begins with `"use client"`; Dotted Glow additionally uses `useEffect`, `window`, `document`, `ResizeObserver`, `IntersectionObserver`, and `<canvas>` ([registry source](https://ui.aceternity.com/registry/dotted-glow-background.json)).

**Implications:**

- Import each `.tsx` component into an `.astro` page and render it with a client directive; use `client:load` for an above-the-fold hero and `client:visible` for a below-the-fold/deferred background.
- Do not render Dotted Glow as a plain, non-hydrated Astro framework component: its browser setup occurs in effects and otherwise will not run.
- `client:only="react"` is not normally necessary: Astro can server-render the initial React markup and then hydrate it. Consider it only if SSR produces a mismatch or the component is deliberately browser-only.
- Give the absolutely positioned background a positioned parent with explicit/minimum height, and put content above it with z-index/pointer-event handling. Background Beams' SVG is pointer-events-none; Dotted Glow's canvas should likewise not block interaction if used behind content.

## Repository fit

`package.json` already contains `@astrojs/react`, React 19, `motion`, `clsx`, and `tailwind-merge`; see the local [package manifest](../../package.json). The likely missing integration work is therefore the copied component file, an Astro wrapper/use site, and verification of the existing `cn` utility and Tailwind v4 styling—not installing a separate Aceternity runtime package.

## Caveat on source citations

Aceternity publishes the authoritative component source through its live registry JSON. I found no public official Aceternity GitHub repository containing these current registry files, so the component citations above are first-party registry URLs rather than immutable GitHub SHA permalinks. Astro citations use immutable official-docs GitHub paths.
