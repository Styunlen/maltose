import { LRUCache } from "lru-cache";
import type { CacheEntry, CacheStore } from "./types";

/** In-process LRU store — the default backend. Per-process, zero deps. */
export class MemoryStore implements CacheStore {
  private cache: LRUCache<string, CacheEntry>;

  constructor(maxEntries = 1000) {
    this.cache = new LRUCache<string, CacheEntry>({ max: maxEntries });
  }

  /** Synchronous on purpose — hot hits serve in the same JS stack (see CacheStore). */
  get(key: string): CacheEntry | undefined {
    return this.cache.get(key);
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const k of this.cache.keys()) {
      if (k.startsWith(prefix)) this.cache.delete(k);
    }
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const [k, v] of this.cache.entries()) {
      if (v.storedAt < cutoff) {
        this.cache.delete(k);
        removed++;
      }
    }
    return removed;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
