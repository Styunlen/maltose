# ADR-0037: Structured Logging with pino and Optional ntfy Alerting

- Status: Accepted
- Date: 2026-09-08

## Context

Logging was scattered `console.*` calls across ~40 files (74 active call sites):
debug traces gated behind `import.meta.env.DEV` (silent in staging/production
builds), warnings and errors with ad-hoc text prefixes, no levels, no
structured fields, and no way to route important failures to a phone.

Two needs drove this change:

1. **Observability in staging.** SWR cache behaviour (revalidate events) and
   auth token refresh had debug logs that `astro build` (PROD) permanently
   disabled — exactly where real traffic would exercise them. We wanted
   runtime-controlled levels so staging can enable debug without a rebuild.
2. **Proactive alerting.** The site owner runs a self-hosted ntfy instance and
   wants critical failures (GraphQL/network errors, cache warm failures)
   pushed to a phone.

Evaluated winston vs pino vs a hand-rolled logger, and stream vs worker-thread
transports. See the investigation trail: winston's transports run on the main
thread and its format pipeline is synchronous (2–6x slower in synthetic
benchmarks); pino's `transport()` runs in a worker thread — but that thread
needs a standalone file on disk, which Astro's bundling cannot provide for code
living in `src/` (it is folded into hashed chunks; CI ships only `dist/` plus a
few config files). Fastify/NestJS sidestep this by never bundling
(node_modules stays on the server) and by using main-thread streams in
production.

## Decision

Adopt **pino 10 with a main-thread stream sink** for ntfy — NOT a worker
transport.

1. **Logger module**: `src/lib/logger.ts` creates one pino instance per
   process. Level comes from `process.env.LOG_LEVEL` at module load
   (`trace|debug|info|warn|error`, default `info`). All code imports this
   singleton — no `console.*` for new code.
2. **Output**: stdout is human-readable via **pino-pretty** in ALL
   environments (no log aggregator consumes NDJSON today — revised). Color
   follows `colorette.isColorSupported`: a TTY (dev terminal) gets color, a
   pipe/pm2 log file gets colorless text — so pm2 log files never contain
   ANSI codes while remaining pleasant to read. When `NTFY_URL` is set, a
   custom Writable stream sink is added via `pino.multistream`; the sink
   parses each line back (multistream delivers the same serialized object to
   every destination, so the sink is unaffected by the pretty stdout leg) and
   pushes messages at/above `NTFY_LEVEL` (default `error`) to the self-hosted
   ntfy topic.
3. **Main-thread sink, not worker**: the sink is fire-and-forget `fetch` —
   a slow/unreachable ntfy never delays the request that produced the log.
   Keeping it in-process means the sink code can live in `src/` and be bundled
   like any other module, avoiding the standalone-file requirement of pino
   worker transports under Astro's build (ADR-0034 consequence).
4. **Dedup**: identical messages are suppressed within `NTFY_DEDUP_MS`
   (default 60s) to avoid alert storms during error bursts.
5. **ntfy message formatting**: ntfy has no color channel (HTML is not
   supported; Markdown has no colour syntax), so severity is mapped onto
   ntfy's native dimensions — `Tags` emoji + `Priority` per level
   (error→warning/4, fatal→rotating_light/5) — and the body is structured
   **Markdown** (`Markdown: yes` header), rendered by the ntfy web app and
   Android; the lockscreen Title stays readable plain text. HTTP headers are
   Latin-1 only and ntfy does not URL-decode header values, so the Title is
   stripped to ASCII.
6. **Auth**: ntfy Basic auth (`NTFY_USER`/`NTFY_PASSWORD` →
   `Authorization: Basic base64(user:pass)`) is supported alongside the
   existing Bearer token (`NTFY_TOKEN`); use one or the other.
7. **Migration**: existing `console.*` sites are converted by hand:
   - debug traces (`[TOKEN]`, request start/end) → `logger.debug` (level now
     runtime-controlled; staging sets `LOG_LEVEL=debug`);
   - cache/graphql/network failures → `logger.error`/`warn` (these feed the
     ntfy sink);
   - SWR observability via the previously-unwired `LruLink.onMetrics` hook —
     only `revalidate` events are logged (hit/miss would flood a busy server).

   Initial migration covers the request-path core (middleware token traces,
   Apollo error/logger links, cache warm) so staging immediately gains
   debug-level SWR + auth observability and error alerting. ~61 remaining
   `console.*` sites across API routes and components are migrated incrementally
   as those paths are touched; the pino singleton is the only sanctioned logger
   for new code from this ADR on.

## Consequences

- Staging can observe SWR revalidations and token refreshes by setting
  `LOG_LEVEL=debug` in its `.env` and `pm2 restart` — no rebuild.
- Production failures can reach a phone by setting `NTFY_URL` (plus either
  `NTFY_TOKEN` Bearer or `NTFY_USER`/`NTFY_PASSWORD` Basic auth).
- stdout is pino-pretty text in every environment (colored on a TTY,
  colorless in pm2 files); ntfy receives structured Markdown. Trade-off: the
  raw NDJSON stream is gone, so a future log aggregator (Loki etc.) cannot
  consume pm2's stdout directly — revisit only if one is introduced.
- **Known trade-off**: the ntfy sink runs on the main thread. Fire-and-forget
  HTTP means no caller blocking; the residual cost is JSON parse per error log,
  negligible at SSR volumes. If a future workload needs CPU-heavy transports at
  >10k logs/s, revisit worker transports — but that would require shipping the
  transport as a standalone file in the deployment artifact (see Context).
- pm2's `NODE_ENV=production` is unchanged; `LOG_LEVEL`/`NTFY_*` are separate
  runtime env vars (ADR-0034: eco env block stays minimal, runtime config lives
  in the server `.env`).
- **Gotcha (verified on staging, 2026-09-08)**: pino-pretty's DEFAULT
  destination is a `SonicBoom` on raw **fd 1**, which writes past
  `process.stdout` — pm2 (and other supervisors that capture stdout by
  wrapping the stream, e.g. Next.js) therefore sees NOTHING from the pretty
  stream. Symptoms: ntfy sink works (it is an ordinary Writable) while pm2 log
  files only show Astro's own `console.log`. Local dev never shows this
  (terminal fd 1 == process.stdout). Fix: pass
  `pretty({ destination: process.stdout })` so pino-pretty routes through the
  stream pm2 intercepts (pino-pretty source: an object destination with a
  `.write` is used as-is; only otherwise does it fall back to
  `buildSafeSonicBoom({ dest: opts.destination || 1 })`). Do NOT remove that
  option to "simplify".

## Alternatives considered

- **winston** — rejected: transports on the main thread, synchronous format
  pipeline, no built-in worker offload; would require hand-rolling the async
  discipline the pino sink gets for free. Viable but higher complexity for the
  same result.
- **pino worker transport** — rejected for this project: requires the
  transport as a standalone file loadable by `worker_threads` at runtime.
  Astro bundles `src/` into hashed chunks and CI ships only `dist/` — a
  transport in `src/` would not exist as a file on the server. Workarounds
  (build hook copying to `dist/server/node_modules/`, `__bundlerPathsOverrides`)
  add packaging complexity for a fire-and-forget HTTP sink that does not need
  thread isolation.
- **Hand-rolled logger** — rejected: pino gives structured output, level
  filtering, and child loggers for free; the custom-sink pattern keeps the
  alerting extension point without building a logger from scratch.
