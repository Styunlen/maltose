import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gql } from "@apollo/client/core";

/*
 * Regression tests for ADR-0029: Apollo InMemoryCache must not short-circuit
 * queries before LruLink runs.
 *
 * Root cause (d36c93a): `client` had `defaultOptions.query.fetchPolicy =
 * "cache-first"`, so InMemoryCache served the 2nd+ request for the same
 * operation+variables directly, never reaching LruLink. InMemoryCache has no
 * TTL and nothing evicts article entries → edited article content stayed
 * stale for the process lifetime; LruLink's 30s TTL was dead code for
 * GetNodeByURI/GetPost.
 *
 * These tests guard against that regressing:
 *  1. the client default fetchPolicy stays `no-cache` (config guard), and
 *  2. every getQuery call actually flows through LruLink (integration guard).
 *
 * Network is stubbed — no live WordPress dependency.
 */

describe("api client cache wiring (ADR-0029)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  // Query shape mirrors what Single.astro issues for article editorBlocks,
  // minus the dynamic fragment concatenation (not relevant to caching).
  const editorBlocksQuery = gql`
    query GetPost($databaseId: ID!, $asPreview: Boolean!) {
      page(id: $databaseId, asPreview: $asPreview) {
        editorBlocks {
          name
          renderedHtml
        }
      }
    }
  `;

  const editorBlocksResult = {
    data: {
      page: {
        editorBlocks: [
          { __typename: "CoreParagraph", name: "core/paragraph", renderedHtml: "<p>page 1</p>" },
        ],
      },
    },
  };

  beforeEach(async () => {
    const body = JSON.stringify(editorBlocksResult);
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      url: "http://localhost:4321/api/graphql-proxy",
      headers: new Headers({ "Content-Type": "application/json" }),
      clone: () => ({ text: async () => body }),
      text: async () => body,
      json: async () => JSON.parse(body),
    }));
    vi.stubGlobal("fetch", fetchMock);

    // Reset LruLink's in-process cache so each test starts clean.
    const { __internalLruCache } = await import("./api");
    __internalLruCache.deleteByPrefix("");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("client default fetchPolicy is no-cache (config guard)", async () => {
    const { client } = await import("./api");
    expect(client.defaultOptions?.query?.fetchPolicy).toBe("no-cache");
  });

  it("GetNodeByURI/GetPost stay in STRONG_CONSISTENCY", async () => {
    const { client, lruLink } = await import("./api");
    const strong = (lruLink as any).strong as Set<string>;
    expect(strong.has("GetNodeByURI")).toBe(true);
    expect(strong.has("GetPost")).toBe(true);

    // FetchPolicy guard already checked above; sanity-check the chain is
    // not empty and starts with a link that has the SWR gate (LruLink).
    const chain = (client as any).link as { link?: unknown[] } | null;
    const links = Array.isArray(chain?.link) ? chain.link : [chain];
    expect(links.length).toBeGreaterThan(0);
    const head = links[0];
    expect(head).toBeDefined();
    expect(typeof (head as any)?.request).toBe("function");
  });

  it("every getQuery call reaches LruLink (no InMemoryCache short-circuit)", async () => {
    const { client, lruLink, getQuery } = await import("./api");

    // Count how many times LruLink sees the operation.
    const lruCalls: string[] = [];
    const origRequest = lruLink.request.bind(lruLink);
    (lruLink as any).request = (op: any, fwd: any) => {
      lruCalls.push(op.operationName);
      return origRequest(op, fwd);
    };

    const vars = { databaseId: "cG9zdDoxNzg0", asPreview: false };
    const r1 = await getQuery(editorBlocksQuery, vars);
    const r2 = await getQuery(editorBlocksQuery, vars);
    const r3 = await getQuery(editorBlocksQuery, vars);

    // All three must reach LruLink. Before the fix (cache-first default),
    // only the first did — the rest were served by InMemoryCache.
    expect(lruCalls).toEqual(["GetPost", "GetPost", "GetPost"]);
    expect(r1.page.editorBlocks).toHaveLength(1);
    expect(r2.page.editorBlocks).toHaveLength(1);
    expect(r3.page.editorBlocks).toHaveLength(1);

    // Network was consulted exactly once for the same op (LruLink served 2/3).
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("LruLink TTL still governs after the client default change", async () => {
    const { client, getQuery } = await import("./api");
    // Same op queried twice with no intervening TTL change → LruLink cache
    // serves the second, so no extra network call. This asserts the
    // no-cache default did NOT accidentally disable LruLink's own caching.
    const vars = { databaseId: "cG9zdDoxNzg0", asPreview: false };
    await getQuery(editorBlocksQuery, vars);
    await getQuery(editorBlocksQuery, vars);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("different variables produce separate cache entries", async () => {
    const { getQuery } = await import("./api");
    const varsA = { databaseId: "cG9zdDoxNzg0", asPreview: false };
    const varsB = { databaseId: "cG9zdDoxNzg1", asPreview: false };
    await getQuery(editorBlocksQuery, varsA);
    await getQuery(editorBlocksQuery, varsB);
    // Two distinct keys → two network round-trips.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
