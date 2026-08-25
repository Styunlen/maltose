/**
 * Pluggable cache store contract for LruLink (ADR-0032).
 *
 * LruLink performs its SWR/TTL decisions from the stored `storedAt` age, so a
 * shared backend (redis / lmdb) must serialize `CacheEntry` as-is; each process
 * then sees the same data and the same age → cross-process cache coherence.
 *
 * All methods are async: LruLink awaits the store inside its Observable
 * executor (Apollo Link allows async work in the executor, but request() itself
 * must return an Observable synchronously — see ADR-0032).
 */

export type CacheDriver = "memory" | "redis" | "lmdb";

export interface CacheEntry {
  data: unknown;
  storedAt: number;
}

/**
 * Backend-agnostic cache operations. Implementations:
 *  - memory-store: in-process LRUCache (default, zero deps)
 *  - redis-store: shared via node-redis (multi-instance pm2)
 *  - lmdb-store: shared via mmap-backed LMDB (multi-process, no server needed)
 * Future backends (e.g. sqlite) only need to implement this interface.
 *
 * `get` returns either a synchronous value (memory/lmdb resolve immediately —
 * LruLink serves hot hits in the same synchronous stack, zero microtasks) or a
 * Promise (redis is inherently async). LruLink checks `instanceof Promise`.
 * All other methods are async.
 */
export interface CacheStore {
  get(key: string): CacheEntry | undefined | Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  /** Delete every key that starts with `prefix` (operation-name families). */
  deleteByPrefix(prefix: string): Promise<void>;
  /** Remove entries whose storedAt is older than `maxAgeMs`, return removed count. */
  cleanup(maxAgeMs: number): Promise<number>;
  clear(): Promise<void>;
  size(): Promise<number>;
  close(): Promise<void>;
}
