#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const count = Math.min(
  Math.max(Number.parseInt(process.argv[2] ?? "8", 10) || 8, 1),
  8,
);
const market = process.argv[3] ?? "zh-CN";
const output = path.resolve(
  process.cwd(),
  process.env.BANNER_URLS_FILE?.trim() || "public/banner-urls.json",
);
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const api = new URL("https://www.bing.com/HPImageArchive.aspx");
api.searchParams.set("format", "js");
api.searchParams.set("idx", "0");
api.searchParams.set("n", String(count));
api.searchParams.set("mkt", market);

const response = await fetch(api, { headers: { "user-agent": userAgent } });
if (!response.ok) throw new Error(`Bing API failed: HTTP ${response.status}`);
const data = await response.json();

const urls = [];
const seen = new Set();
for (const image of data.images ?? []) {
  const raw = String(image?.url ?? "").trim();
  if (!raw) continue;
  const url = /^https?:\/\//i.test(raw)
    ? raw
    : `https://www.bing.com${raw.startsWith("/") ? "" : "/"}${raw}`;
  if (seen.has(url)) continue;
  seen.add(url);
  urls.push(url);
}
if (urls.length === 0) throw new Error("Bing returned no wallpapers");

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(urls, null, 2)}\n`);
console.log(
  `Bing wallpapers: ${urls.length} URLs -> ${path.relative(process.cwd(), output)}`,
);
