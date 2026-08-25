import type { CacheEntry } from "@/lib/cache/types";
import { cacheStore } from "@/api/api";

export type FriendStatus = "alive" | "dead" | "unknown";

export interface FriendLink {
  title: string;
  info: string;
  link: string;
  cover: string;
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
  } catch {
    clearTimeout(timer);
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

async function doRefresh(): Promise<FriendsResult> {
  const res = await fetch(FRIENDS_JSON_URL);
  const list: FriendLink[] = await res.json();

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
  const entry: CacheEntry = { data, storedAt: Date.now() };
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
  await cacheStore.store.set(FRIENDS_LOCK_KEY, { data: true, storedAt: Date.now() });
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
      .catch(() => {});
  }

  return data;
}
