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

const FRIENDS_JSON_URL =
  "https://styunlen.cn/friends.json";
const CACHE_TTL = 60 * 60 * 1000;
// 放宽到 8s：网络波动时 3s 容易把正常站点误判为失效。
// 超时/网络错误会归入 "unknown" 而非 "dead"，不直接判死。
const CHECK_TIMEOUT = 8000;
// 降级探测使用真实浏览器 UA：区分"反爬拒绝爬虫请求"（浏览器可访问，判 alive）
// 与"站点对所有人不可访问"（带浏览器 UA 仍被拒，判 dead）。
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface CacheEntry {
  data: FriendsResult;
  expiresAt: number;
}

declare global {
  var __friendCache: CacheEntry | undefined;
}

let refreshing = false;

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

export async function getFriends(): Promise<FriendsResult> {
  const now = Date.now();
  const cache = globalThis.__friendCache;

  // Cold start — must wait
  if (!cache) {
    const data = await doRefresh();
    globalThis.__friendCache = { data, expiresAt: now + CACHE_TTL };
    return data;
  }

  // Cache still fresh
  if (now < cache.expiresAt) {
    return cache.data;
  }

  // Stale — return old data, refresh in background
  if (!refreshing) {
    refreshing = true;
    doRefresh()
      .then((data) => {
        globalThis.__friendCache = { data, expiresAt: Date.now() + CACHE_TTL };
      })
      .catch(() => {})
      .finally(() => {
        refreshing = false;
      });
  }

  return cache.data;
}
