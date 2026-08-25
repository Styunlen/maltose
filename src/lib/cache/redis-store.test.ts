import { describe, it, expect, beforeEach, vi } from "vitest";
import { RedisStore } from "./redis-store";
import type { CacheEntry } from "./types";

function entry(data: unknown, storedAt = Date.now()): CacheEntry {
  return { data, storedAt };
}

/** Minimal redis client mock (node-redis v5 shape) backed by an in-memory map. */
function makeMockClient() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return "OK";
    }),    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (...keys: unknown[]) => {
      const flat = keys.flat() as string[];
      for (const k of flat) store.delete(k);
      return flat.length;
    }),
    scan: vi.fn(async (cursor: string, opts: { MATCH: string; COUNT: number }) => {
      const pattern = opts.MATCH.replace(/[*]/g, "");
      const keys = [...store.keys()].filter((k) => k.startsWith(pattern));
      return ["0", keys];
    }),
    dbsize: vi.fn(async () => store.size),
    flushDb: vi.fn(async () => {
      store.clear();
      return "OK";
    }),
    quit: vi.fn(async () => "OK"),
  } as any;
}

describe("RedisStore", () => {
  let client: any;
  let store: RedisStore;

  beforeEach(() => {
    client = makeMockClient();
    store = new RedisStore(client);
  });

  it("get reads shared data directly from redis (no local mirror)", async () => {
    client.store.set("graphql:k", JSON.stringify(entry({ x: 1 })));
    expect(await store.get("k")).toEqual({ data: { x: 1 }, storedAt: expect.any(Number) });
  });

  it("set writes to redis with prefix and a TTL cap", async () => {
    await store.set("k", entry({ x: 1 }));
    expect(client.store.get("graphql:k")).toContain('"data"');
    expect(client.set).toHaveBeenCalledWith(
      "graphql:k",
      expect.stringContaining('"data"'),
      { EX: 1800 },
    );
    expect(await store.get("k")).toEqual({ data: { x: 1 }, storedAt: expect.any(Number) });
  });

  it("delete removes key from redis", async () => {
    await store.set("k", entry(1));
    await store.delete("k");
    expect(client.del).toHaveBeenCalledWith("graphql:k");
    expect(await store.get("k")).toBeUndefined();
  });

  it("deleteByPrefix scans and deletes matching keys", async () => {
    await store.set("GetNodeByURI:a", entry(1));
    await store.set("LayoutQuery:b", entry(2));
    await store.deleteByPrefix("GetNodeByURI:");
    expect(await store.get("GetNodeByURI:a")).toBeUndefined();
    expect(await store.get("LayoutQuery:b")).toBeDefined();
    expect(client.scan).toHaveBeenCalledWith(expect.any(String), {
      MATCH: "graphql:GetNodeByURI:*",
      COUNT: 100,
    });
  });

  it("cleanup removes entries older than maxAgeMs", async () => {
    await store.set("old", entry(1, Date.now() - 10_000));
    await store.set("fresh", entry(2));
    const removed = await store.cleanup(5_000);
    expect(removed).toBe(1);
    expect(await store.get("old")).toBeUndefined();
    expect(await store.get("fresh")).toBeDefined();
  });

  it("no-op when client is null, activates after setClient", async () => {
    const lazy = new RedisStore(null);
    expect(await lazy.get("k")).toBeUndefined();
    await lazy.set("k", entry(1)); // no-op, no throw
    lazy.setClient(client);
    await lazy.set("k", entry(2));
    expect(await lazy.get("k")).toEqual({ data: 2, storedAt: expect.any(Number) });
  });

  it("clear and close", async () => {
    await store.set("k", entry(1));
    await store.clear();
    expect(client.flushDb).toHaveBeenCalled();
    await store.close();
    expect(client.quit).toHaveBeenCalled();
  });
});
