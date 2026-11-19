import type { CacheEntry } from "@/lib/cache/types";
import { cacheStore } from "@/api/api";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { logger } from "@/lib/logger";

export type FriendStatus = "alive" | "dead" | "unknown";
export type FriendSource = "legacy" | "astrahub";

export interface FriendLink {
  title: string;
  info: string;
  link: string;
  cover: string;
  sources: FriendSource[];
}

export interface FriendWithStatus extends FriendLink {
  status: FriendStatus;
}

export interface FriendsResult {
  active: FriendWithStatus[];
  unknown: FriendWithStatus[];
  dead: FriendWithStatus[];
  lastCheckAt: number;
}

const FRIENDS_JSON_URL = "https://styunlen.cn/friends.json";
const ASTRAHUB_DEFAULT_HUB_BASE_URL = "https://astra.aobp.cn";
const ASTRAHUB_DEFAULT_FRIENDS_PATH = "/v1/planet/links";
// Probe results are fresh for 1h; the shared CacheStore backend (memory/redis/
// lmdb, ADR-0032) gives cross-process coherence under pm2 cluster — unlike the
// previous module-global, which was per-process.
const CACHE_TTL = 60 * 60 * 1000;
// 放宽到 8s：网络波动时 3s 容易把正常站点误判为失效。
// 超时/网络错误会归入 "unknown" 而非 "dead"，不直接判死。
const CHECK_TIMEOUT = 8000;
// 降级探测使用真实浏览器 UA：区分"反爬拒绝爬虫请求"（浏览器可访问，判 alive）
// 与"站点对所有人不可访问"（带浏览器 UA 仍被拒，判 dead）。
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// Cache key lives in the same store as LruLink's GraphQL entries (shared
// backend per GRAPHQL_CACHE_DRIVER). The "friends:" prefix keeps it out of any
// operation-family deleteByPrefix("GetNodeByURI:") calls.
const FRIENDS_CACHE_KEY = "friends:status";

// Cross-process refresh lock: keyed in the shared store so two pm2 workers
// don't both run the probe set simultaneously. The value is any non-empty
// marker; a tiny TTL (5 min) bounds how long a crashed worker's lock lingers.
const FRIENDS_LOCK_KEY = "friends:refreshing";
const LOCK_TTL = 5 * 60 * 1000;

interface ProbeResult {
  status: number | null; // null = 请求被 abort / 网络错误
}

interface AstraHubConfig {
  hubBaseUrl: string;
  siteId: string;
  apiKey: string;
  friendsPath: string;
}

interface SignedAstraHubRequest {
  url: string;
  headers: Record<string, string>;
  canonical: string;
}

type UnknownRecord = Record<string, unknown>;

export function getAstraHubConfig(
  env: NodeJS.ProcessEnv = process.env,
): AstraHubConfig | null {
  const siteId = env.ASTRAHUB_SITE_ID?.trim();
  const apiKey = env.ASTRAHUB_API_KEY?.trim();
  if (!siteId || !apiKey) return null;
  return {
    hubBaseUrl: (
      env.ASTRAHUB_HUB_BASE_URL?.trim() || ASTRAHUB_DEFAULT_HUB_BASE_URL
    ).replace(/\/+$/, ""),
    siteId,
    apiKey,
    friendsPath: normalizePath(
      env.ASTRAHUB_FRIENDS_PATH || ASTRAHUB_DEFAULT_FRIENDS_PATH,
    ),
  };
}

export function buildAstraHubRequest(
  config: AstraHubConfig,
  opts: {
    method?: "GET";
    body?: string;
    timestamp?: string;
    nonce?: string;
    /** Extra query params (NOT signed: the canonical string uses the bare path). */
    query?: Record<string, string>;
  } = {},
): SignedAstraHubRequest {
  const method = opts.method || "GET";
  const body = opts.body || "";
  const timestamp = opts.timestamp || String(Math.floor(Date.now() / 1000));
  const nonce = opts.nonce || randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const canonical = `${method}\n${config.friendsPath}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = createHmac("sha256", config.apiKey)
    .update(canonical)
    .digest("hex");
  const query = new URLSearchParams(opts.query || {}).toString();
  return {
    url: `${config.hubBaseUrl}${config.friendsPath}${query ? `?${query}` : ""}`,
    canonical,
    headers: {
      "X-BP-Site-Id": config.siteId,
      "X-BP-Timestamp": timestamp,
      "X-BP-Nonce": nonce,
      "X-BP-Signature": signature,
    },
  };
}

// 发送探测请求。HEAD 优先；ua 可选，降级探测时传入浏览器 UA。
async function probe(
  url: string,
  method: "HEAD" | "GET",
  ua?: string,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      ...(ua ? { headers: { "User-Agent": ua } } : {}),
    });
    clearTimeout(timer);
    return { status: res.status };
  } catch (err) {
    clearTimeout(timer);
    logger.debug({ err, url, method }, "friend link probe failed");
    return { status: null };
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 400;
}

// 判定逻辑（三态）：
//   alive   → 2xx/3xx 响应（存活）
//   dead    → 404/410（资源不存在），或降级探测后服务器仍拒绝（对用户也不可访问）
//   unknown → 超时 / 网络错误（无法确认，可能是暂时性故障）
async function checkLink(url: string): Promise<FriendStatus> {
  const head = await probe(url, "HEAD");

  if (head.status !== null) {
    if (isSuccess(head.status)) {
      return "alive";
    }
    if (head.status === 404 || head.status === 410) {
      return "dead";
    }
  }

  // HEAD 被拒（403/405 等）或 HEAD 超时/网络错误 → 降级 GET + 浏览器 UA 再试一次：
  // 若浏览器 UA 能访问，说明只是反爬拦截探测请求，站点本身可用。
  const get = await probe(url, "GET", BROWSER_UA);
  if (get.status !== null) {
    if (isSuccess(get.status)) {
      return "alive";
    }
    return "dead";
  }

  return "unknown";
}

export function mapAstraHubLinksResponse(
  payload: unknown,
): FriendLink[] | null {
  const candidates = [
    payload,
    asRecord(payload).links,
    asRecord(payload).items,
    asRecord(asRecord(payload).data).links,
    asRecord(asRecord(payload).data).items,
    asRecord(asRecord(payload).planet).links,
  ];
  const list = candidates.find(Array.isArray);
  if (!Array.isArray(list)) return null;
  const friends = list
    // AstraHub exposes relationKind ("mutual" | "none" | …). The endpoint is
    // queried with ?relation=mutual already; this is the second line of
    // defence so non-mutual entries never reach the site. Missing field =
    // keep (tolerant of a future payload without the flag).
    .filter((value) => {
      const kind = asRecord(value).relationKind;
      return kind === undefined || kind === null || kind === "mutual";
    })
    .map(mapAstraHubLink)
    .filter((friend): friend is FriendLink => friend !== null);
  return list.length === 0 || friends.length > 0 ? friends : null;
}

async function loadFriendLinks(): Promise<FriendLink[]> {
  const config = getAstraHubConfig();
  const [legacyResult, astraHubResult] = await Promise.allSettled([
    fetchFriendsJson(),
    config ? fetchAstraHubLinks(config) : Promise.resolve(null),
  ]);
  const legacyLinks =
    legacyResult.status === "fulfilled" ? legacyResult.value : [];
  const astraHubLinks =
    astraHubResult.status === "fulfilled" && astraHubResult.value !== null
      ? astraHubResult.value
      : [];

  if (legacyResult.status === "rejected") {
    logger.warn(
      { err: legacyResult.reason, module: "friends" },
      "Legacy friend feed failed",
    );
  }

  return mergeFriendLinks([...legacyLinks, ...astraHubLinks]);
}

async function fetchAstraHubLinks(
  config: AstraHubConfig,
): Promise<FriendLink[] | null> {
  try {
    // Only mutual friends are shown on the site (owner request). The hub
    // filters server-side (?relation=mutual → total drops to the mutual set);
    // the query string is not part of the HMAC canonical string.
    const signed = buildAstraHubRequest(config, {
      query: { relation: "mutual" },
    });
    const res = await fetch(signed.url, {
      method: "GET",
      headers: signed.headers,
    });
    if (!res.ok) return null;
    return mapAstraHubLinksResponse(await res.json());
  } catch (err) {
    logger.warn(
      { err, module: "friends" },
      "AstraHub friend feed failed; using fallback JSON feed",
    );
    return null;
  }
}

async function fetchFriendsJson(): Promise<FriendLink[]> {
  const res = await fetch(FRIENDS_JSON_URL);
  const payload = await res.json();
  if (!Array.isArray(payload)) return [];
  return payload
    .map(mapLegacyFriendLink)
    .filter((friend): friend is FriendLink => friend !== null);
}

async function doRefresh(): Promise<FriendsResult> {
  const list = await loadFriendLinks();

  const results = await Promise.allSettled(
    list.map(async (f) => ({
      ...f,
      status: await checkLink(f.link),
    })),
  );

  const checked: FriendWithStatus[] = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { ...list[results.indexOf(r)], status: "unknown" },
  );

  return {
    active: checked.filter((f) => f.status === "alive"),
    unknown: checked.filter((f) => f.status === "unknown"),
    dead: checked.filter((f) => f.status === "dead"),
    lastCheckAt: Date.now(),
  };
}

// Write the result into the shared store, then release the refresh lock.
async function storeResult(data: FriendsResult): Promise<void> {
  const entry: CacheEntry = { data, storedAt: Date.now(), hits: 0 };
  await cacheStore.store.set(FRIENDS_CACHE_KEY, entry);
  await cacheStore.store.delete(FRIENDS_LOCK_KEY);
}

// Stale — try to become the refresher via a lock in the shared store.
// Only one pm2 worker proceeds; others return the stale data immediately.
async function tryAcquireLock(): Promise<boolean> {
  const existing = await cacheStore.store.get(FRIENDS_LOCK_KEY);
  if (existing && Date.now() - existing.storedAt < LOCK_TTL) {
    return false;
  }
  // Best-effort: set and re-check. The store is the arbiter; concurrent
  // writers may both pass here on a non-atomic backend, but the harm is only
  // a duplicate probe run (acceptable).
  await cacheStore.store.set(FRIENDS_LOCK_KEY, {
    data: true,
    storedAt: Date.now(),
    hits: 0,
  });
  return true;
}

export async function getFriends(): Promise<FriendsResult> {
  const now = Date.now();
  const cached = await cacheStore.store.get(FRIENDS_CACHE_KEY);
  const data = cached?.data as FriendsResult | undefined;

  // Cold start — must wait
  if (!cached) {
    const fresh = await doRefresh();
    await storeResult(fresh);
    return fresh;
  }

  // Cache still fresh
  if (now - cached.storedAt < CACHE_TTL) {
    return data;
  }

  // Stale — return old data, refresh in background (single-writer via lock)
  if (await tryAcquireLock()) {
    doRefresh()
      .then(storeResult)
      .catch((err) =>
        logger.warn(
          { err, module: "friends" },
          "background friends refresh failed",
        ),
      );
  }

  return data;
}

function mapAstraHubLink(value: unknown): FriendLink | null {
  const node = asRecord(value);
  const title = stringField(node.title);
  const link = stringField(node.url);
  if (!title || !isHttpUrl(link)) return null;
  return {
    title,
    info: stringField(node.description),
    link,
    cover: stringField(node.logo),
    sources: ["astrahub"],
  };
}

function mapLegacyFriendLink(value: unknown): FriendLink | null {
  const node = asRecord(value);
  const title = stringField(node.title);
  const link = stringField(node.link);
  if (!title || !isHttpUrl(link)) return null;
  return {
    title,
    info: stringField(node.info),
    link,
    cover: stringField(node.cover),
    sources: ["legacy"],
  };
}

export function normalizeFriendUrlKey(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function mergeFriendLinks(links: FriendLink[]): FriendLink[] {
  const merged = new Map<string, FriendLink>();

  for (const link of links) {
    const key = normalizeFriendUrlKey(link.link);
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...link, sources: [...link.sources] });
      continue;
    }

    merged.set(key, {
      ...current,
      ...link,
      title: link.title || current.title,
      info: link.info || current.info,
      cover: link.cover || current.cover,
      sources: [...new Set([...current.sources, ...link.sources])],
    });
  }

  return [...merged.values()];
}

function normalizePath(value: string): string {
  const path = value.trim() || ASTRAHUB_DEFAULT_FRIENDS_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (err) {
    logger.debug({ err, url: value }, "invalid friend URL");
    return false;
  }
}
