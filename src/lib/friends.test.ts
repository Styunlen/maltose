import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAstraHubRequest,
  getAstraHubConfig,
  mapAstraHubLinksResponse,
  mergeFriendLinks,
  normalizeFriendUrlKey,
} from "./friends";

describe("AstraHub friend feed adapter", () => {
  it("requires site id and api key before enabling AstraHub", () => {
    expect(getAstraHubConfig({})).toBeNull();
    expect(getAstraHubConfig({ ASTRAHUB_SITE_ID: "site" })).toBeNull();
    expect(getAstraHubConfig({ ASTRAHUB_API_KEY: "secret" })).toBeNull();
  });

  it("uses the official Hub base URL when none is configured", () => {
    expect(
      getAstraHubConfig({
        ASTRAHUB_SITE_ID: "site-1",
        ASTRAHUB_API_KEY: "secret-key",
      }),
    ).toMatchObject({
      hubBaseUrl: "https://astra.aobp.cn",
      friendsPath: "/v1/planet/links",
    });
  });

  it("builds the official canonical HMAC request", () => {
    const config = getAstraHubConfig({
      ASTRAHUB_HUB_BASE_URL: "https://hub.example.test/",
      ASTRAHUB_SITE_ID: "site-1",
      ASTRAHUB_API_KEY: "secret-key",
      ASTRAHUB_FRIENDS_PATH: "v1/planet/links",
    });
    expect(config).not.toBeNull();
    if (!config) throw new Error("expected config");

    const request = buildAstraHubRequest(config, {
      timestamp: "1700000000",
      nonce: "nonce-1",
    });
    const bodyHash = createHash("sha256").update("").digest("hex");
    const canonical = `GET\n/v1/planet/links\n1700000000\nnonce-1\n${bodyHash}`;
    const signature = createHmac("sha256", "secret-key")
      .update(canonical)
      .digest("hex");

    expect(request.url).toBe("https://hub.example.test/v1/planet/links");
    expect(request.canonical).toBe(canonical);
    expect(request.headers).toEqual({
      "X-BP-Site-Id": "site-1",
      "X-BP-Timestamp": "1700000000",
      "X-BP-Nonce": "nonce-1",
      "X-BP-Signature": signature,
    });
    expect(Object.values(request.headers)).not.toContain("secret-key");
  });

  it("maps only sufficient official link-node fields", () => {
    expect(
      mapAstraHubLinksResponse({
        data: {
          links: [
            {
              title: "Maltose Friend",
              url: "https://friend.example.com",
              description: "A blog",
              logo: "https://friend.example.com/logo.png",
              rssUrl: "https://friend.example.com/rss.xml",
            },
            { title: "Missing URL", description: "not enough" },
          ],
        },
      }),
    ).toEqual([
      {
        title: "Maltose Friend",
        link: "https://friend.example.com",
        info: "A blog",
        cover: "https://friend.example.com/logo.png",
        sources: ["astrahub"],
      },
    ]);
  });

  it("keeps only mutual relations from the AstraHub payload", () => {
    const payload = {
      items: [
        {
          title: "Mutual Friend",
          url: "https://mutual.example.com",
          relationKind: "mutual",
          relationStatus: "mutual",
        },
        {
          title: "One-way Friend",
          url: "https://oneway.example.com",
          relationKind: "none",
          relationStatus: "invitable",
        },
        {
          title: "Legacy Payload Without Flag",
          url: "https://legacy.example.com",
        },
      ],
    };
    const mapped = mapAstraHubLinksResponse(payload);
    expect(mapped?.map((f) => f.title)).toEqual([
      "Mutual Friend",
      "Legacy Payload Without Flag",
    ]);
  });

  it("builds the mutual-only query without changing the signed canonical path", () => {
    const config = getAstraHubConfig({
      ASTRAHUB_SITE_ID: "site-1",
      ASTRAHUB_API_KEY: "secret-key",
    });
    if (!config) throw new Error("expected config");
    const request = buildAstraHubRequest(config, {
      timestamp: "1700000000",
      nonce: "nonce-1",
      query: { relation: "mutual" },
    });
    expect(request.url).toBe(
      "https://astra.aobp.cn/v1/planet/links?relation=mutual",
    );
    expect(request.canonical).toBe(
      `GET\n/v1/planet/links\n1700000000\nnonce-1\n${createHash("sha256").update("").digest("hex")}`,
    );
  });

  it("fails closed when AstraHub response shape is not sufficient", () => {
    expect(
      mapAstraHubLinksResponse({ data: { links: [{ title: "No URL" }] } }),
    ).toBeNull();
    expect(mapAstraHubLinksResponse({ data: { unexpected: [] } })).toBeNull();
  });

  it("normalizes URLs for duplicate detection", () => {
    expect(normalizeFriendUrlKey("HTTPS://Example.com/blog/#about")).toBe(
      "https://example.com/blog",
    );
  });

  it("merges duplicate links and preserves AstraHub provenance", () => {
    expect(
      mergeFriendLinks([
        {
          title: "Legacy title",
          info: "Legacy info",
          link: "https://example.com/blog/",
          cover: "legacy.png",
          sources: ["legacy"],
        },
        {
          title: "Astra title",
          info: "Astra info",
          link: "https://example.com/blog#home",
          cover: "astra.png",
          sources: ["astrahub"],
        },
      ]),
    ).toEqual([
      {
        title: "Astra title",
        info: "Astra info",
        link: "https://example.com/blog#home",
        cover: "astra.png",
        sources: ["legacy", "astrahub"],
      },
    ]);
  });
});
