import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_URLS = 40;

/** Parse the JSON value into a deduped list of http(s) banner URLs. */
export function parseBannerUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const item of raw) {
    let value = "";
    if (typeof item === "string") value = item;
    else if (item && typeof item === "object" && "url" in item) {
      value = String((item as { url?: unknown }).url ?? "");
    }
    const url = value.trim();
    if (!/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_URLS) break;
  }
  return urls;
}

type Cache = { file: string; mtimeMs: number; urls: string[] };

let cache: Cache | null = null;

function candidateFiles(): string[] {
  const files: string[] = [];
  const override = process.env.BANNER_URLS_FILE?.trim();
  if (override) files.push(path.resolve(process.cwd(), override));
  files.push(path.join(process.cwd(), "public", "banner-urls.json"));
  files.push(path.join(process.cwd(), "dist", "client", "banner-urls.json"));
  return files;
}

/**
 * Runtime banner URLs: first readable candidate wins, re-read when its mtime
 * changes so the list can be updated on the server without a rebuild. Any
 * failure falls back to an empty list (the local placeholder images).
 */
export async function getBannerUrls(): Promise<string[]> {
  for (const file of candidateFiles()) {
    try {
      const info = await stat(file);
      if (!info.isFile()) continue;
      if (cache && cache.file === file && cache.mtimeMs === info.mtimeMs) {
        return cache.urls;
      }
      const urls = parseBannerUrls(JSON.parse(await readFile(file, "utf8")));
      cache = { file, mtimeMs: info.mtimeMs, urls };
      return urls;
    } catch {
      // try the next candidate
    }
  }
  return [];
}
