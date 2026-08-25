import type { RedisClientType } from "redis";
import type { CacheEntry, CacheStore } from "./types";

const PREFIX = "graphql:";

/**
 * Shared cache backed by Redis. All ops are async — LruLink awaits them inside
 * its Observable executor, so the client is read/written directly (no local
 * mirror): every process shares the same Redis entries, giving true
 * cross-process data coherence. `deleteByPrefix` scans the key range and deletes.
 *
 * The client may be null at construction (redis not yet connected); until a
 * client is set via `setClient`, ops are no-ops. `setClient` swaps in the
 * connected backend.
 */
export class RedisStore implements CacheStore {
  private client: RedisClientType | null;

  constructor(client: RedisClientType | null = null) {
    this.client = client;
  }

  setClient(client: RedisClientType | null): void {
    this.client = client;
  }

  async get(key: string): Promise<CacheEntry | undefined> {
    if (!this.client) return undefined;
    const raw = await this.client.get(PREFIX + key);
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    if (!this.client) return;
    // Hard TTL cap (30 min) bounds unbounded growth even when the periodic
    // cleanup timer is off; SWR still serves stale from the local mirror.
    await this.client.set(PREFIX + key, JSON.stringify(entry), { EX: 1800 });
  }

  async delete(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(PREFIX + key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    if (!this.client) return;
    const pattern = PREFIX + prefix + "*";
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(cursor, {
        MATCH: pattern,
        COUNT: 100,
      });
      if (keys.length) await this.client.del(keys);
      cursor = next;
    } while (cursor !== "0");
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    if (!this.client) return 0;
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    let cursor = "0";
    do {
      const [next, keys] = await this.client.scan(cursor, {
        MATCH: PREFIX + "*",
        COUNT: 100,
      });
      for (const k of keys) {
        const raw = await this.client.get(k);
        if (raw) {
          try {
            const entry = JSON.parse(raw) as CacheEntry;
            if (entry.storedAt < cutoff) {
              await this.client.del(k);
              removed++;
            }
          } catch {
            /* corrupted entry — skip */
          }
        }
      }
      cursor = next;
    } while (cursor !== "0");
    return removed;
  }

  async clear(): Promise<void> {
    if (!this.client) return;
    await this.client.flushDb();
  }

  async size(): Promise<number> {
    if (!this.client) return 0;
    return this.client.dbsize();
  }

  close(): Promise<void> {
    if (this.client) return this.client.quit();
    return Promise.resolve();
  }
}
