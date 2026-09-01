import { open, type Database, type RootDatabase } from "lmdb";
import RateLimiterStoreAbstract from "rate-limiter-flexible/lib/RateLimiterStoreAbstract.js";
import RateLimiterRes from "rate-limiter-flexible/lib/RateLimiterRes.js";

/**
 * LMDB-backed rate limiter (ADR-0032 sibling: shares the cache driver contract).
 *
 * Used when GRAPHQL_CACHE_DRIVER=lmdb: like Redis, LMDB write transactions are
 * serialized at the environment level (single writer), so the read-modify-write
 * inside `transactionSync` is atomic ACROSS all processes that open the same
 * file — pm2 cluster workers share counters without a Redis server.
 *
 * Store format: { value: number, expiresAt: number } where expiresAt is an
 * epoch-ms timestamp, 0 = never expire (duration=0). Mirrors the SQLite
 * limiter's { points, expire } raw result that _getRateLimiterRes consumes.
 *
 * See RateLimiterStoreAbstract for the 4 required methods:
 * _upsert / _get / _delete / _getRateLimiterRes.
 */

export interface RateLimiterLmdbOptions {
  /** Directory for the LMDB environment (default ".cache/ratelimit"). */
  path?: string;
  /** Map size in bytes (default 16MB — counters are tiny). */
  mapSize?: number;
  points?: number;
  duration?: number;
  blockDuration?: number;
  execEvenly?: boolean;
  execEvenlyMinDelayMs?: number;
  keyPrefix?: string;
}

interface LmdbRecord {
  value: number;
  expiresAt: number;
}

export default class RateLimiterLmdb extends RateLimiterStoreAbstract {
  // Public API inherited from RateLimiterAbstract at runtime; the package's
  // TS declarations omit it (only deleteInMemoryBlockedAll is declared), so we
  // re-declare the surface used by callers.
  consume(key: string, points?: number): Promise<RateLimiterRes> {
    return super.consume(key, points);
  }

  private db: Database<LmdbRecord, string>;
  private root: RootDatabase<LmdbRecord>;
  // RateLimiterStoreAbstract's TS declaration omits `points`; the JS runtime
  // has it but we keep our own copy for the resolver below.
  private readonly _limitPoints: number;

  constructor(opts: RateLimiterLmdbOptions) {
    // Required by RateLimiterStoreAbstract: it expects a `storeClient`
    // (validated by the parent's client getter/setter).
    super({
      points: opts.points ?? 4,
      duration: opts.duration ?? 1,
      blockDuration: opts.blockDuration,
      execEvenly: opts.execEvenly,
      execEvenlyMinDelayMs: opts.execEvenlyMinDelayMs,
      keyPrefix: opts.keyPrefix,
      storeClient: {},
    });
    this._limitPoints = opts.points ?? 4;

    this.root = open<LmdbRecord>({
      path: opts.path ?? ".cache/ratelimit",
      mapSize: opts.mapSize ?? 16 * 1024 * 1024,
      // Counters are ephemeral: losing them on crash only allows one extra
      // request through. Skipping fsync keeps each consume() fast.
      noSync: true,
    });
    this.db = this.root.openDB<LmdbRecord, string>({ name: "rate-limit" });
  }

  _getRateLimiterRes(
    rlKey: string,
    changedPoints: number,
    result: LmdbRecord,
  ): RateLimiterRes {
    const res = new RateLimiterRes();
    res.consumedPoints = result.value;
    res.isFirstInDuration = changedPoints === result.value;
    res.remainingPoints = Math.max(this._limitPoints - res.consumedPoints, 0);
    res.msBeforeNext =
      result.expiresAt > 0 ? Math.max(result.expiresAt - Date.now(), 0) : -1;
    return res;
  }

  async _upsert(
    rlKey: string,
    points: number,
    msDuration: number,
    forceExpire = false,
  ): Promise<LmdbRecord> {
    if (!Number.isInteger(points)) {
      throw new Error(
        "Consuming decimal number of points is not supported by this package",
      );
    }

    // Read-modify-write inside one LMDB write transaction. The environment's
    // single-writer lock serializes this across processes, so concurrent
    // consumes from pm2 workers cannot race (equivalent to Redis's Lua script).
    return this.db.transactionSync(() => {
      if (forceExpire) {
        const rec: LmdbRecord = {
          value: points,
          expiresAt: msDuration > 0 ? Date.now() + msDuration : 0,
        };
        this.db.put(rlKey, rec);
        return rec;
      }

      const prev = this.db.get(rlKey);
      const now = Date.now();
      const notExpired =
        prev != null && (prev.expiresAt === 0 || prev.expiresAt > now);
      const rec: LmdbRecord = {
        value: notExpired ? prev!.value + points : points,
        expiresAt: notExpired
          ? prev!.expiresAt
          : msDuration > 0
            ? now + msDuration
            : 0,
      };
      this.db.put(rlKey, rec);
      return rec;
    });
  }

  async _get(rlKey: string): Promise<LmdbRecord | null> {
    const rec = this.db.get(rlKey);
    if (rec == null) return null;
    if (rec.expiresAt > 0 && rec.expiresAt <= Date.now()) return null;
    return rec;
  }

  async _delete(rlKey: string): Promise<boolean> {
    return this.db.remove(rlKey);
  }

  close(): void {
    this.db.close();
    this.root.close();
  }
}
