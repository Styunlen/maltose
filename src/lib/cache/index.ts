import { open, type RootDatabase } from "lmdb";
import type { CacheDriver, CacheStore } from "./types";
import { MemoryStore } from "./memory-store";
import { RedisStore } from "./redis-store";
import { LmdbStore } from "./lmdb-store";

export type { CacheDriver, CacheEntry, CacheStore } from "./types";
export { MemoryStore } from "./memory-store";
export { RedisStore } from "./redis-store";
export { LmdbStore } from "./lmdb-store";

export interface CacheStoreConfig {
  driver: CacheDriver;
  /** LMDB database path (lmdb driver). */
  path?: string;
  /** LMDB map size in bytes (default 64MB). */
  mapSize?: number;
  /** LRU max entries for the memory fallback (default 1000). */
  maxEntries?: number;
  /** ms between periodic cleanup() runs; 0 disables (default 0). */
  cleanupIntervalMs?: number;
  /** Max entry age for cleanup() (default 10 min). */
  cleanupMaxAgeMs?: number;
  /** Milliseconds between failed-backend retries (default 60s). */
  retryIntervalMs?: number;
  /** Optional synchronous redis client provider (default: connectRedisIfConfigured). */
  redisClient?: () => Promise<import("redis").RedisClientType | null>;
  /** Called when a fail-open retry reconnects — swap the live store here. */
  onReconnect?: (store: CacheStore) => void;
}

const RETRY_LOGS: Partial<Record<CacheDriver, number>> = {};

/*
 * LruLink is constructed synchronously at module load, so the store factory
 * must be sync too. memory and lmdb open synchronously. redis returns a
 * RedisStore with a null client; connectRedisIfConfigured() + setClient() are
 * driven async by the caller (see api.ts / startCacheRedis).
 */
export function createCacheStoreSync(
  cfg: CacheStoreConfig,
): { store: CacheStore; driver: CacheDriver } {
  switch (cfg.driver) {
    case "memory":
      return { store: new MemoryStore(cfg.maxEntries ?? 1000), driver: "memory" };
    case "redis":
      return { store: new RedisStore(null), driver: "redis" };
    case "lmdb":
      return initLmdbSync(cfg);
    default:
      return { store: new MemoryStore(cfg.maxEntries ?? 1000), driver: "memory" };
  }
}

let lmdbRoot: RootDatabase | null = null;

function initLmdbSync(cfg: CacheStoreConfig) {
  try {
    if (!lmdbRoot) {
      lmdbRoot = open({
        path: cfg.path ?? ".cache/graphql",
        mapSize: cfg.mapSize ?? 64 * 1024 * 1024,
      });
    }
    return { store: new LmdbStore(lmdbRoot), driver: "lmdb" as const };
  } catch (err) {
    return failOpen("lmdb", cfg, err);
  }
}

function failOpen(
  driver: Exclude<CacheDriver, "memory">,
  cfg: CacheStoreConfig,
  err: unknown,
): { store: CacheStore; driver: CacheDriver } {
  const msg = err instanceof Error ? err.message : String(err);
  const last = RETRY_LOGS[driver] ?? 0;
  if (Date.now() - last > (cfg.retryIntervalMs ?? 60_000)) {
    console.warn(
      `[cache] ${driver} backend unavailable (${msg}) — falling back to in-memory; will retry every ${(cfg.retryIntervalMs ?? 60_000) / 1000}s`,
    );
    RETRY_LOGS[driver] = Date.now();
  }
  scheduleRetry(driver, cfg);
  return { store: new MemoryStore(cfg.maxEntries ?? 1000), driver: "memory" };
}

const retryTimers = new Map<CacheDriver, NodeJS.Timeout>();

function scheduleRetry(driver: Exclude<CacheDriver, "memory">, cfg: CacheStoreConfig) {
  if (retryTimers.has(driver)) return;
  const timer = setTimeout(() => {
    retryTimers.delete(driver);
    try {
      const next = createCacheStoreSync(cfg);
      // Swap the live store only when the retry actually reconnected (i.e. the
      // backend returned its own driver, not another memory fallback).
      if (next.driver === driver) {
        cfg.onReconnect?.(next.store);
      }
    } catch {
      scheduleRetry(driver, cfg);
    }
  }, cfg.retryIntervalMs ?? 60_000);
  retryTimers.set(driver, timer);
}

/** Start periodic stale-entry cleanup. Returns a stop function. */
export function startCleanupTimer(store: CacheStore, cfg: CacheStoreConfig): () => void {
  const intervalMs = cfg.cleanupIntervalMs ?? 0;
  if (intervalMs <= 0) return () => {};
  const maxAgeMs = cfg.cleanupMaxAgeMs ?? 10 * 60 * 1000;
  const timer = setInterval(() => {
    store.cleanup(maxAgeMs).catch(() => {});
  }, intervalMs);
  return () => clearInterval(timer);
}

/**
 * Connect the Redis backend (redis driver) and attach the client to the store.
 * Caller-driven (api.ts) since LruLink is constructed synchronously. Returns
 * true once connected; on failure warns and returns false (store stays a
 * no-op until retried).
 */
export async function startCacheRedis(
  store: RedisStore,
  cfg: CacheStoreConfig,
): Promise<boolean> {
  try {
    const { connectRedisIfConfigured } = await import("@lib/auth/redis");
    const client = await connectRedisIfConfigured();
    if (!client) {
      console.warn("[cache] redis driver requested but REDIS_URL not configured");
      return false;
    }
    store.setClient(client);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[cache] redis connect failed (${msg}) — cache stays inactive; retrying`);
    setTimeout(() => {
      startCacheRedis(store, cfg).catch(() => {});
    }, cfg.retryIntervalMs ?? 60_000);
    return false;
  }
}
