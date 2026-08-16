import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gql, type Operation } from "@apollo/client";
import { LruLink, makeCacheKey, stableStringify } from "./lru-link";

/* Minimal Operation factory matching Apollo's Operation shape. */
function makeOp(operationName: string, variables: Record<string, unknown> = {}, context: Record<string, unknown> = {}): Operation {
  return {
    operationName,
    variables,
    extensions: {},
    query: gql`
      query ${operationName}($v: String) {
        dummy(v: $v) {
          id
        }
      }
    `,
    setContext: () => ({}),
    getContext: () => context,
  } as unknown as Operation;
}

/** Collect values from an Observable into an array (promise-based). */
function collect<T>(obs: { subscribe: (o: any) => any }): Promise<T[]> {
  return new Promise((resolve) => {
    const out: T[] = [];
    obs.subscribe({
      next: (v: T) => out.push(v),
      complete: () => resolve(out),
      error: () => resolve(out),
    });
  });
}

describe("stableStringify", () => {
  it("produces the same output regardless of key order", () => {
    const a = stableStringify({ b: 1, a: 2, c: { z: 3, y: 4 } });
    const b = stableStringify({ c: { y: 4, z: 3 }, a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it("handles arrays and primitives", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(stableStringify("x")).toBe('"x"');
    expect(stableStringify(null)).toBe("null");
  });
});

describe("makeCacheKey", () => {
  it("is stable when variables field order changes", () => {
    const k1 = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a", first: 10 }));
    const k2 = makeCacheKey(makeOp("GetNodeByURI", { first: 10, uri: "/a" }));
    expect(k1).toBe(k2);
  });

  it("differs when variables differ", () => {
    const k1 = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a" }));
    const k2 = makeCacheKey(makeOp("GetNodeByURI", { uri: "/b" }));
    expect(k1).not.toBe(k2);
  });

  it("keeps operationName as a plaintext prefix for deleteByPrefix", () => {
    const k = makeCacheKey(makeOp("HomePosts", {}));
    expect(k.startsWith("HomePosts:")).toBe(true);
  });

  it("isolates authenticated users from anonymous and from each other", () => {
    const anon = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a" }));
    const userA = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a" }, { headers: { Authorization: "Bearer tokenA" } }));
    const userB = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a" }, { headers: { Authorization: "Bearer tokenB" } }));
    expect(anon).not.toBe(userA);
    expect(userA).not.toBe(userB);
    // Same token → same key regardless of Bearer casing.
    const userA2 = makeCacheKey(makeOp("GetNodeByURI", { uri: "/a" }, { headers: { Authorization: "bearer tokenA" } }));
    expect(userA).toBe(userA2);
  });
});

describe("LruLink cache behavior", () => {
  let link: LruLink;
  let networkCalls: number;
  let forward: ReturnType<typeof makeForward>;

  function makeForward(network: (op: Operation) => Record<string, unknown>) {
    return (op: Operation) => {
      networkCalls++;
      return new (require("@apollo/client").Observable)((observer: any) => {
        observer.next({ data: network(op) });
        observer.complete();
      });
    };
  }

  beforeEach(() => {
    networkCalls = 0;
    link = new LruLink({ defaultTtl: 60, revalidateThreshold: 0.5 });
    forward = makeForward((op) => ({ ok: true, op: op.operationName, ts: Date.now() }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("miss → network, hit → cached without network", async () => {
    const op = makeOp("TestQuery", { a: 1 });
    const first = await collect(link.request(op, forward));
    expect(networkCalls).toBe(1);
    expect(first[0]).toMatchObject({ data: { ok: true } });

    const second = await collect(link.request(op, forward));
    expect(networkCalls).toBe(1); // still 1 — served from cache
    expect(second[0]).toMatchObject({ data: { ok: true } });
  });

  it("does not cache mutations", async () => {
    const mutOp = {
      ...makeOp("RecordPostView", {}),
      query: gql`
        mutation RecordPostView($postId: ID!) {
          recordPostView(input: { postId: $postId }) {
            viewCount
          }
        }
      `,
    } as Operation;
    await collect(link.request(mutOp, forward));
    await collect(link.request(mutOp, forward));
    expect(networkCalls).toBe(2); // every mutation hits network
  });

  it("returns stale + refreshes in background once TTL passes (SWR)", async () => {
    vi.useFakeTimers();
    const op = makeOp("LowVolatility", {});
    await collect(link.request(op, forward)); // network → cache

    // Advance past TTL (60s) + threshold: expired, non-strong → stale + bg refresh.
    vi.advanceTimersByTime(61_000);
    // request goes through with a *captured* forward — use the same forward.
    const stale = await collect(link.request(op, forward));
    expect(stale[0]).toMatchObject({ data: { ok: true } });
    // Background refresh is scheduled via setImmediate — flush it.
    await vi.runAllTimersAsync();
    expect(networkCalls).toBeGreaterThanOrEqual(2); // original + background refresh
  });

  it("refreshes in background inside the revalidate window without blocking", async () => {
    vi.useFakeTimers();
    const op = makeOp("MidVolatility", {});
    await collect(link.request(op, forward)); // network → cache

    // Advance to just past threshold (30s of a 60s TTL) but before expiry.
    vi.advanceTimersByTime(31_000);
    const hit = await collect(link.request(op, forward));
    expect(hit[0]).toMatchObject({ data: { ok: true } });
    await vi.runAllTimersAsync();
    expect(networkCalls).toBeGreaterThanOrEqual(2); // background refresh fired
  });

  it("strong-consistency waits for the network when expired (no stale)", async () => {
    vi.useFakeTimers();
    const strongLink = new LruLink({
      defaultTtl: 60,
      strongConsistency: new Set(["GetNodeByURI"]),
    });
    const strongForward = makeForward((op) => ({ ok: true, fresh: Date.now() }));
    const op = makeOp("GetNodeByURI", { uri: "/a" });

    await collect(strongLink.request(op, strongForward)); // network → cache
    expect(networkCalls).toBe(1);

    vi.advanceTimersByTime(61_000); // fully expired
    // Strong consistency: must NOT return stale, must hit network again.
    const result = await collect(strongLink.request(op, strongForward));
    expect(networkCalls).toBe(2);
    expect(result[0]).toMatchObject({ data: { ok: true } });
  });

  it("dedupes concurrent background refreshes (single in-flight per key)", async () => {
    vi.useFakeTimers();
    const op = makeOp("ConcurrentRefresh", {});
    await collect(link.request(op, forward));
    expect(networkCalls).toBe(1);

    vi.advanceTimersByTime(61_000); // expired → stale + bg refresh
    // Two parallel requests both enter the expired-stale path.
    const [r1, r2] = await Promise.all([
      collect(link.request(op, forward)),
      collect(link.request(op, forward)),
    ]);
    expect(r1[0]).toMatchObject({ data: { ok: true } });
    expect(r2[0]).toMatchObject({ data: { ok: true } });

    await vi.runAllTimersAsync();
    // Original network (1) + exactly ONE background refresh (not two).
    expect(networkCalls).toBe(2);
  });

  it("deleteByPrefix invalidates matching entries", async () => {
    const op1 = makeOp("HomePosts", { first: 10 });
    const op2 = makeOp("MegaQuery", {});
    await collect(link.request(op1, forward));
    await collect(link.request(op2, forward));
    expect(networkCalls).toBe(2);

    link.deleteByPrefix("HomePosts:");
    await collect(link.request(op1, forward)); // miss → network
    await collect(link.request(op2, forward)); // hit → cached
    expect(networkCalls).toBe(3);
  });
});
