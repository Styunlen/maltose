import type { Database, RootDatabase } from "lmdb";
import type { CacheEntry, CacheStore } from "./types";

/**
 * Shared cache backed by LMDB (mmap-based embedded KV). Multiple processes can
 * open the same database file; each process's reads/writes hit the shared mmap
 * directly — true cross-process data sharing without a server. Uses a
 * sub-database to keep only cache entries. Underlying ops are sync
 * (getSync/putSync/removeSync); the async interface wraps them.
 */
export class LmdbStore implements CacheStore {
  private db: Database<CacheEntry, string>;

  constructor(root: RootDatabase<unknown>, name = "graphql-cache") {
    this.db = root.openDB<CacheEntry, string>({ name });
  }

  /** Synchronous on purpose — mmap read serves hot hits in the same JS stack. */
  get(key: string): CacheEntry | undefined {
    return this.db.getSync(key);
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    this.db.putSync(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.db.removeSync(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const end = prefix + "\uffff";
    for (const { key } of this.db.getRange({ start: prefix, end })) {
      if (typeof key === "string") this.db.removeSync(key);
    }
  }

  async cleanup(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    for (const { key, value } of this.db.getRange()) {
      if (value && value.storedAt < cutoff && typeof key === "string") {
        this.db.removeSync(key);
        removed++;
      }
    }
    return removed;
  }

  async clear(): Promise<void> {
    this.db.clearSync();
  }

  async size(): Promise<number> {
    return this.db.getKeysCount();
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }
}
