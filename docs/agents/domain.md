# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in. (Migrated from the former `docs/decisions/`; both paths referenced it until the 2026-08 consolidation.)

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-…
│   └── 0035-…
├── docs/glossary/
└── src/
```

## Notable path facts

- ADRs are numbered `0001`–`0035` in `docs/adr/`.
- `docs/blog/` holds private draft notes and is **never committed** to git.
- Source aliases: `@/` → `src/`, `@api` → `src/api`, `@components` → `src/components`, `@lib` → `src/lib`.
