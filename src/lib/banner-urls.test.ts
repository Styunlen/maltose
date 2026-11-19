import { describe, expect, it } from "vitest";
import { parseBannerUrls } from "./banner-urls";

describe("parseBannerUrls", () => {
  it("keeps http(s) URLs from strings and objects", () => {
    expect(
      parseBannerUrls([
        "https://example.com/a.jpg",
        { url: "http://example.com/b.jpg" },
      ]),
    ).toEqual(["https://example.com/a.jpg", "http://example.com/b.jpg"]);
  });

  it("trims, drops invalid entries and dedupes", () => {
    expect(
      parseBannerUrls([
        " https://example.com/a.jpg ",
        "javascript:alert(1)",
        "ftp://example.com/x.jpg",
        "",
        null,
        42,
        { url: "https://example.com/a.jpg" },
      ]),
    ).toEqual(["https://example.com/a.jpg"]);
  });

  it("returns an empty list for non-array payloads", () => {
    expect(parseBannerUrls(null)).toEqual([]);
    expect(parseBannerUrls({ url: "https://example.com/a.jpg" })).toEqual([]);
    expect(parseBannerUrls("https://example.com/a.jpg")).toEqual([]);
  });

  it("caps the list to protect the page", () => {
    const many = Array.from(
      { length: 60 },
      (_, i) => `https://example.com/${i}.jpg`,
    );
    expect(parseBannerUrls(many)).toHaveLength(40);
  });
});
