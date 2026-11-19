import { describe, expect, it } from "vitest";
import {
  canonicalSearchPath,
  highlightSearchText,
  makeSnippet,
  paginateSearchResults,
  parseSearchTypes,
  normalizeSearchQuery,
  type SearchResultItem,
} from "./search";

describe("search helpers", () => {
  it("normalizes whitespace, compatibility width, and length", () => {
    expect(normalizeSearchQuery("  Astro\n\tSearch  ")).toBe("Astro Search");
    expect(normalizeSearchQuery("ＡＢＣ")).toBe("ABC");
    expect(normalizeSearchQuery("x".repeat(100))).toHaveLength(80);
  });

  it("parses multi-select types from repeated or comma query params", () => {
    expect(parseSearchTypes(["post,page", "comment", "bad"])).toEqual([
      "post",
      "page",
      "comment",
    ]);
    expect(parseSearchTypes([])).toEqual(["post", "page", "comment", "tag", "category"]);
  });

  it("builds canonical query strings in stable type order", () => {
    expect(canonicalSearchPath("  mint ", ["comment", "post"], 2)).toBe(
      "/search?q=mint&type=post&type=comment&page=2",
    );
    expect(canonicalSearchPath("mint", ["post", "page", "comment", "tag", "category"], 1)).toBe(
      "/search?q=mint",
    );
  });

  it("creates safe highlighted snippets without preserving unsafe HTML", () => {
    const snippet = makeSnippet('<script>alert(1)</script><p>Hello <b>Astro</b> &amp; friends</p>', "astro");
    expect(snippet).toContain("Hello Astro & friends");
    expect(snippet).not.toContain("<script>");
    expect(highlightSearchText(snippet, "astro &")).toBe(
      "alert(1) Hello <mark>Astro</mark> <mark>&amp;</mark> friends",
    );
  });

  it("paginates deterministically across type groups", () => {
    const items: SearchResultItem[] = [
      { id: "comment:1", type: "comment", title: "c", url: "/c", snippet: "", date: "2024-01-01" },
      { id: "post:1", type: "post", title: "old", url: "/old", snippet: "", date: "2023-01-01" },
      { id: "post:2", type: "post", title: "new", url: "/new", snippet: "", date: "2025-01-01" },
      { id: "post:3", type: "post", title: "newer", url: "/newer", snippet: "", date: "2026-01-01" },
    ];
    const result = paginateSearchResults(items, ["post", "comment"], 1, 2);
    expect(result.items.map((item) => item.id)).toEqual(["post:3", "post:2", "comment:1"]);
    expect(result.groups.find((group) => group.type === "post")?.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(paginateSearchResults(items, ["post", "comment"], 2, 2).items.map((item) => item.id)).toEqual(["post:1"]);
  });
});
