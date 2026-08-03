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
 */
export async function connectRedisIfConfigured() {
  if (!REDIS_URL) {
    return null;
  }
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  return redisClient;
}

export default redisClient;
