import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStore } from "./memory-store";
import type { CacheEntry } from "./types";

function entry(data: unknown, storedAt = Date.now()): CacheEntry {
  return { data, storedAt };
}

describe("MemoryStore", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(100);
  });

  it("get returns synchronously for hot hits", () => {
    store.set("a", entry({ x: 1 }));
    const res = store.get("a");
    expect(res instanceof Promise).toBe(false);
    expect(res).toEqual({ data: { x: 1 }, storedAt: expect.any(Number) });
  });

  it("get/set/delete roundtrip", async () => {
    expect(await store.get("a")).toBeUndefined();
    await store.set("a", entry({ x: 1 }));
    expect(await store.get("a")).toEqual({ data: { x: 1 }, storedAt: expect.any(Number) });
    await store.delete("a");
    expect(await store.get("a")).toBeUndefined();
  });

  it("deleteByPrefix removes matching keys only", async () => {
    await store.set("GetNodeByURI:abc", entry(1));
    await store.set("GetNodeByURI:def", entry(2));
    await store.set("LayoutQuery:x", entry(3));
    await store.deleteByPrefix("GetNodeByURI:");
    expect(await store.get("GetNodeByURI:abc")).toBeUndefined();
    expect(await store.get("GetNodeByURI:def")).toBeUndefined();
    expect(await store.get("LayoutQuery:x")).toBeDefined();
  });

  it("cleanup removes entries older than maxAgeMs", async () => {
    const now = Date.now();
    await store.set("old", entry(1, now - 10_000));
    await store.set("fresh", entry(2, now));
    const removed = await store.cleanup(5_000);
    expect(removed).toBe(1);
    expect(await store.get("old")).toBeUndefined();
    expect(await store.get("fresh")).toBeDefined();
  });

  it("size and clear", async () => {
    await store.set("a", entry(1));
    await store.set("b", entry(2));
    expect(await store.size()).toBe(2);
    await store.clear();
    expect(await store.size()).toBe(0);
  });

  it("close is a no-op", async () => {
    await expect(store.close()).resolves.toBeUndefined();
  });
});
