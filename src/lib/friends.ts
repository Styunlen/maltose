export interface FriendLink {
  title: string;
  info: string;
  link: string;
  cover: string;
}

export interface FriendWithStatus extends FriendLink {
  alive: boolean;
}

export interface FriendsResult {
  active: FriendWithStatus[];
  dead: FriendWithStatus[];
  lastCheckAt: number;
}

const FRIENDS_JSON_URL =
  "https://styunlen.cn/friends.json";
const CACHE_TTL = 60 * 60 * 1000;
const CHECK_TIMEOUT = 3000;

interface CacheEntry {
  data: FriendsResult;
  expiresAt: number;
}

declare global {
  var __friendCache: CacheEntry | undefined;
}

let refreshing = false;

async function checkLink(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timer);
    return res.status === 200 || res.status === 301 || res.status === 302;
  } catch {
    return false;
  }
}

async function doRefresh(): Promise<FriendsResult> {
  const res = await fetch(FRIENDS_JSON_URL);
  const list: FriendLink[] = await res.json();

  const results = await Promise.allSettled(
    list.map(async (f) => ({
      ...f,
      alive: await checkLink(f.link),
    })),
  );

  const checked: FriendWithStatus[] = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { ...list[results.indexOf(r)], alive: false },
  );

  return {
    active: checked.filter((f) => f.alive),
    dead: checked.filter((f) => !f.alive),
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
