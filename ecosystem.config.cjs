/**
 * pm2 config for Maltose (Astro SSR server) — dual-environment (ADR-0033).
 *
 * Two apps, one per environment, so a single box can host production AND
 * staging side by side (each on its own PORT). On a split setup each box
 * starts only the app matching its role (deploy.sh selects by name).
 *
 * Cache backend (ADR-0032) — set GRAPHQL_CACHE_DRIVER in the environment:
 *   memory (default): single-process only; cross-process cache NOT coherent.
 *   redis:             shared cache across cluster workers; needs REDIS_URL.
 *   lmdb:              shared embedded cache (no server); best for cluster
 *                      without Redis. All workers open the same LMDB file.
 *
 * Pick the cache driver per app via the env block you uncomment.
 */
module.exports = {
  apps: [
    {
      name: "maltose-production",
      script: "./dist/server/entry.mjs",
      instances: process.env.PM2_INSTANCES || 2,
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1G",
      // Load the deploy-directory .env into the process at runtime (Node
      // --env-file, path relative to pm_cwd = deploy dir). This makes every
      // env var (APP_SECRET, AUTHENTIK_*, GRAPHQL_CACHE_*, …) runtime-mutable:
      // edit .env on the server, `pm2 restart`, done — no rebuild.
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
        GRAPHQL_CACHE_DRIVER: "memory",
      },
      // ── Option A: shared via Redis ────────────────────────────────────
      // env: { NODE_ENV:"production", PORT: 8080, GRAPHQL_CACHE_DRIVER:"redis", REDIS_URL:"redis://localhost:6379", GRAPHQL_CACHE_CLEANUP_MS:"3600000" },
      // ── Option B: shared via LMDB (no Redis) ──────────────────────────
      // env: { NODE_ENV:"production", PORT: 8080, GRAPHQL_CACHE_DRIVER:"lmdb", GRAPHQL_CACHE_PATH:"/var/lib/maltose/graphql-cache", GRAPHQL_CACHE_MAP_SIZE:"67108864", GRAPHQL_CACHE_CLEANUP_MS:"3600000" },
    },
    {
      name: "maltose-staging",
      script: "./dist/server/entry.mjs",
      instances: process.env.PM2_INSTANCES || 2,
      exec_mode: "cluster",
      autorestart: true,
      max_memory_restart: "1G",
      node_args: "--env-file=.env",
      env: {
        NODE_ENV: "production",
        GRAPHQL_CACHE_DRIVER: "memory",
      },
      // ── Option A: shared via Redis ────────────────────────────────────
      // env: { NODE_ENV:"production", PORT: 8081, GRAPHQL_CACHE_DRIVER:"redis", REDIS_URL:"redis://localhost:6379", GRAPHQL_CACHE_CLEANUP_MS:"3600000" },
      // ── Option B: shared via LMDB (no Redis) ──────────────────────────
      // env: { NODE_ENV:"production", PORT: 8081, GRAPHQL_CACHE_DRIVER:"lmdb", GRAPHQL_CACHE_PATH:"/var/lib/maltose/graphql-cache", GRAPHQL_CACHE_MAP_SIZE:"67108864", GRAPHQL_CACHE_CLEANUP_MS:"3600000" },
    },
  ],
};
