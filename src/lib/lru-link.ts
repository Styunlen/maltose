import { ApolloLink, Observable, type Operation, type FetchResult } from "@apollo/client";
import { createHash } from "node:crypto";
import type { CacheEntry, CacheStore } from "./cache/types";
import { MemoryStore } from "./cache/memory-store";

/*
 * SWR caching link with a pluggable backend (ADR-0032).
 *
 * request() returns an Observable synchronously (Apollo's contract — the core
 * calls .pipe/.subscribe on the return value), but the hit/miss decision runs
 * inside the executor where the store is awaited. This lets a shared backend
 * (redis) be read directly and synchronously-perceived by callers, while
 * memory/lmdb resolve immediately. See ADR-0032 for the Apollo Link async
 * analysis.
 */

export interface LruLinkOptions {
  ttlConfig?: Record<string, number>;
  defaultTtl?: number;
  revalidateThreshold?: number;
  strongConsistency?: Set<string>;
  maxEntries?: number;
  /** Pluggable backend; defaults to an in-process MemoryStore (ADR-0032). */
  store?: CacheStore;
  onMetrics?: (m: { hit: boolean; miss: boolean; revalidate: boolean; operationName: string }) => void;
}

/* Sorts object keys recursively so variables field order is irrelevant. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/*
 * Cache key: "{operationName}:{sha256(stable variables)}[:{userHash}]".
 * The operationName is kept in plaintext so post-mutation invalidation can
 * target whole query families via deleteByPrefix. If the operation carries
 * an Authorization header the token is hashed and appended so anonymous and
 * authenticated users never share a cache entry.
 */
export function makeCacheKey(operation: Operation): string {
  const opName = operation.operationName || operation.query.loc?.source?.body?.slice(0, 64) || "anon";
  const base = `${opName}:${stableStringify(operation.variables ?? {})}`;
  const hash = createHash("sha256").update(base).digest("hex");
  const ctx = operation.getContext() as { headers?: Record<string, string> };
  const auth = ctx.headers?.Authorization;
  if (auth) {
    const userHash = createHash("sha256")
      .update(`user:${auth.replace(/^Bearer\s+/i, "")}`)
      .digest("hex")
      .slice(0, 16);
    return `${opName}:${hash}:${userHash}`;
  }
  return `${opName}:${hash}`;
}

export class LruLink extends ApolloLink {
  private cache: CacheStore;
  private inflight = new Map<string, Promise<void>>();
  private ttlConfig: Record<string, number>;
  private defaultTtlMs: number;
  private threshold: number;
  private strong: Set<string>;
  private onMetrics?: LruLinkOptions["onMetrics"];
  private nextForward?: (op: Operation) => Observable<FetchResult>;

  constructor(opts: LruLinkOptions = {}) {
    super();
    this.ttlConfig = opts.ttlConfig ?? {};
    this.defaultTtlMs = (opts.defaultTtl ?? 60) * 1000;
    this.threshold = Math.min(1, Math.max(0, opts.revalidateThreshold ?? 0.5));
    this.strong = opts.strongConsistency ?? new Set();
    this.onMetrics = opts.onMetrics;
    /*
     * No ttl at the store layer: entries must survive past our per-operation
     * TTL so SWR can return stale data. Expiry is managed by age checks here;
     * MemoryStore's LRU only bounds memory via `max`.
     */
    this.cache = opts.store ?? new MemoryStore(opts.maxEntries ?? 1000);
  }

  private ttlMs(opName: string): number {
    return (this.ttlConfig[opName] ?? this.defaultTtlMs / 1000) * 1000;
  }

  private ageMs(entry: CacheEntry): number {
    return Date.now() - entry.storedAt;
  }

  request(operation: Operation, forward: (op: Operation) => Observable<FetchResult>): Observable<FetchResult> {
    this.nextForward = forward;

    const def = operation.query.definitions[0] as { operation?: string };
    if (def?.operation === "mutation") {
      return forward(operation);
    }

    const key = makeCacheKey(operation);
    const opName = operation.operationName;
    const ttl = this.ttlMs(opName);
    const isStrong = this.strong.has(opName);

    return new Observable((observer) => {
      let cancelled = false;
      let sub: { unsubscribe: () => void } | null = null;

      const run = async () => {
        try {
          // Synchronous stores (memory/lmdb) resolve here in the same JS
          // stack — no microtask hop on hot hits. Async stores (redis) await.
          const res = this.cache.get(key);
          const entry = res instanceof Promise ? await res : res;
          if (cancelled) return;

          // Fresh hit → serve cached; revalidate in background inside window.
          if (entry && this.ageMs(entry) < ttl) {
            const shouldRevalidate = this.ageMs(entry) >= ttl * this.threshold;
            if (shouldRevalidate) {
              this.revalidate(operation, key);
            }
            this.onMetrics?.({ hit: true, miss: false, revalidate: shouldRevalidate, operationName: opName });
            observer.next(entry.data as FetchResult);
            observer.complete();
            return;
          }

          // Expired, non-strong → serve stale now, refresh in background.
          if (entry && !isStrong) {
            this.revalidate(operation, key);
            this.onMetrics?.({ hit: true, miss: false, revalidate: true, operationName: opName });
            observer.next(entry.data as FetchResult);
            observer.complete();
            return;
          }

          // Miss, or expired strong-consistency → hit the network.
          this.onMetrics?.({ hit: false, miss: true, revalidate: false, operationName: opName });
          sub = forward(operation).subscribe({
            next: (result) => {
              if (result && !result.errors) {
                this.cache.set(key, { data: result, storedAt: Date.now() });
              }
              observer.next(result);
            },
            error: async (err) => {
              // Fall back to stale data on network failure.
              const anyEntry = await this.cache.get(key);
              if (anyEntry) {
                observer.next(anyEntry.data as FetchResult);
                observer.complete();
              } else {
                observer.error(err);
              }
            },
            complete: () => observer.complete(),
          });
        } catch (err) {
          observer.error(err as Error);
        }
      };

      run();

      return () => {
        cancelled = true;
        sub?.unsubscribe();
      };
    });
  }

  /* Background refresh, deduped: only one in-flight request per key. */
  private revalidate(operation: Operation, key: string): void {
    if (this.inflight.has(key)) return;
    const forward = this.nextForward;
    if (!forward) return;

    const run = async () => {
      await new Promise<void>((resolve) => {
        setImmediate(() => {
          const sub = forward(operation).subscribe({
            next: (result) => {
              if (result && !result.errors) {
                this.cache.set(key, { data: result, storedAt: Date.now() });
              }
            },
            error: () => resolve(),
            complete: () => resolve(),
          });
        });
      });
    };
    const promise = run();
    this.inflight.set(key, promise);
    promise.finally(() => this.inflight.delete(key));
  }

  deleteKey(key: string): void {
    this.cache.delete(key).catch(() => {});
  }

  deleteByPrefix(prefix: string): void {
    this.cache.deleteByPrefix(prefix).catch(() => {});
  }

  /** Swap the backend after a fail-open retry connects (ADR-0032). */
  setStore(store: CacheStore): void {
    this.cache = store;
  }
}

/** Cache handles for post-mutation invalidation. */
export interface LruCacheApi {
  makeCacheKey: typeof makeCacheKey;
  deleteKey(key: string): void;
  deleteByPrefix(prefix: string): void;
}

export function attachLruCacheApi(link: LruLink): LruCacheApi {
  return {
    makeCacheKey,
    deleteKey: (key) => link.deleteKey(key),
    deleteByPrefix: (prefix) => link.deleteByPrefix(prefix),
  };
}
