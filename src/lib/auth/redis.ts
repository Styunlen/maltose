import { createClient } from 'redis';

// Whether a Redis server is configured for this deployment.
// Single-instance deployments can omit REDIS_URL and fall back to
// in-memory rate limiting; multi-instance (pm2 cluster) deployments
// set REDIS_URL to share counters across processes.
const REDIS_URL = process.env.REDIS_URL || '';

const redisClient = createClient({
  url: REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

/**
 * Connect to Redis if a REDIS_URL is configured. Returns the client when
 * configured and connected, or null when Redis is intentionally unused.
 *
 * Bounded connect (2s): node-redis's default reconnectStrategy retries forever
 * when Redis is unreachable, so an unguarded `await connect()` would hang the
 * caller indefinitely (rate limiter init / cache activation). On timeout we
 * destroy the client and return null — the caller falls back to a local
 * limiter/cache. A later call re-creates the client and retries.
 */
const CONNECT_TIMEOUT_MS = 2000;

export async function connectRedisIfConfigured() {
  if (!REDIS_URL) {
    return null;
  }
  if (!redisClient.isOpen) {
    try {
      await Promise.race([
        redisClient.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("redis connect timeout")), CONNECT_TIMEOUT_MS),
        ),
      ]);
    } catch (err) {
      console.warn(
        `[redis] connect failed (${err instanceof Error ? err.message : String(err)}) — using local fallback`,
      );
      redisClient.destroy();
      return null;
    }
  }
  return redisClient;
}

export default redisClient;
