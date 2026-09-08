# ADR-0034: Runtime-Read Environment Variables

- Status: Accepted
- Date: 2026-08-25

## Context

All secrets and configuration (APP_SECRET, AUTHENTIK_*, WORDPRESS_API_URL,
GRAPHQL_CACHE_*, PORT, HOST, …) were previously read via `import.meta.env.X`.

Astro 6+ **statically inlines** `import.meta.env.X` at build time
(documented breaking change: "values are always inlined"). The deploy pipeline
builds on the GitHub runner, where no `.env` exists, so every build inlined
`undefined` — the production app silently lost its secrets (e.g. `getSecret()`
in `src/lib/auth/session.ts` threw "APP_SECRET is not configured").

Additionally, editing config required a full rebuild + redeploy.

## Decision

Read all business configuration at **runtime** from `process.env`, and load the
deploy-directory `.env` into the process at startup:

1. **Code**: business variables use `process.env.X` instead of `import.meta.env.X`
   (25 occurrences across 8 files). Built-in flags `DEV` / `PROD` / `SSR` /
   `SITE` remain `import.meta.env.*` — they are compile-time constants and their
   semantics depend on build mode, not runtime.

2. **pm2**: `ecosystem.config.cjs` sets `node_args: "--env-file=.env"` (Node ≥ 20.6).
   The path is relative to `pm_cwd` (the deploy dir), so each pm2 process loads
   that directory's `.env` at boot.

3. **Overrides**: pm2 `env` block (`NODE_ENV`, `GRAPHQL_CACHE_DRIVER`) has
   priority — Node's `--env-file` does **not** overwrite existing environment
   variables (verified empirically).

4. **Listen address**: `.env` also carries `HOST=0.0.0.0` when a reverse proxy
   runs in a Docker container and must reach the app via host-gateway
   (default `localhost` binds `::1` only → nginx returns 502).

## Consequences

- **Deploy-time mutable**: edit the server's `.env`, `pm2 restart`, done — no rebuild.
- New config keys only require an `.env` line + a `process.env.X` read in code.
- CI builds no longer need secrets at build time.
- Reverse-proxy (nginx/caddy) sits in front and terminates TLS; it must reach
  the app through `host.docker.internal` (or an explicit listen address).

## Operational note (2026-09-08): pm2 eco env changes need delete + start

pm2 pins an app's env AND structural definition (script, instances, exec_mode,
node_args) at first `pm2 start ecosystem.config.cjs`. Subsequent deploys that
only run `pm2 reload <name>` / `pm2 restart <name>` operate on that in-memory
snapshot and NEVER re-read the ecosystem file — even when CI rsyncs a fresh
copy over it, and `pm2 save` re-pins the stale definition into `~/.pm2/dump.pm2`
(after which server reboots resurrect the stale env too).

Worse, `pm2 start ecosystem.config.cjs` against an ALREADY-running app
internally degrades to `restartProcessId`: it merges only env values, so env
adds/edits take effect but **structural edits (script, instances, exec_mode,
node_args) and env removals silently do not** (verified empirically 2026-09-08
against pm2 v7.0.3; see pm2 issue #3742 for the long-standing report).

Consequences for this repo:

- `deploy.sh` therefore does `pm2 delete <app>` + `pm2 start ecosystem.config.cjs
  --only <app>` — the only path that re-parses the eco file in full. There is a
  brief downtime on each deploy; acceptable for the two-instance staging box.
- Keep runtime config in the server `.env` (the `--env-file` channel re-reads on
  every worker spawn), NOT in the eco `env:` block — the eco env block is
  `NODE_ENV` only and must stay that way. Any future eco `env:` addition will be
  shadowing-prone and require the same delete+start to take effect.

## Alternatives considered

- **GitHub Action env injection at build time** — rejected: verbose, every new
  key needs workflow changes, still bakes values into the bundle.
- **`astro:env` `getSecret()`** — viable, but requires an `env` schema in
  `astro.config.mjs`, cannot be used in `astro.config.mjs`/scripts, and adds a
  validation gate at runtime; `process.env` is the minimal change (matching the
  existing `src/lib/auth/redis.ts` pattern).
- **Sourcing `.bashrc`/`.zshrc` in env.sh** — rejected: `.zshrc` is zsh syntax
  (bash can't parse), contains side effects (`exec tmux`), and non-interactive
  `.bashrc` returns early.
