import { defineMiddleware } from "astro/middleware";
import { verifySessionToken, sessionToUser } from "@lib/auth/session";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
// WPGraphQL JWT carries the user id as a string; normalize to a number for
// consistent comparison against numeric databaseId fields.
function normalizeUserId(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

// ── Token refresh queue (see ADR-0012) ──────────────────────────────────────
// Dedupe concurrent refresh calls per user. Keyed by the sha256 of the refresh
// token so different users (different refresh tokens) never share a refresh.
// The first request to hit an expiring token starts one refresh; the rest
// await the same in-flight promise instead of each firing their own request.
const refreshInFlight = new Map<string, Promise<string | null>>();

function hashToken(t: string): string {
  return createHash("sha256").update(t).digest("hex");
}

async function refreshTokenFor(refreshToken: string): Promise<string | null> {
  const key = hashToken(refreshToken);
  const inFlight = refreshInFlight.get(key);
  if (inFlight) return inFlight;

  const p = (async () => {
    try {
      const res = await fetch(getProxyUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation RefreshAuthToken($input: RefreshTokenInput!) {
              refreshToken(input: $input) { authToken authTokenExpiration }
            }
          `,
          variables: { input: { refreshToken } },
        }),
      });
      const data = await res.json();
      return data?.data?.refreshToken?.authToken ?? null;
    } catch {
      return null;
    } finally {
      refreshInFlight.delete(key);
    }
  })();

  refreshInFlight.set(key, p);
  return p;
}

// Apply the refreshed token to the current response + locals.
function applyNewToken(
  context: Parameters<typeof onRequest>[0],
  newToken: string,
): void {
  context.cookies.set("wp_token", newToken, {
    path: "/", httpOnly: true, sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, secure: import.meta.env.PROD,
  });
  context.locals.wpToken = newToken;
  try {
    const freshDecoded = jwt.decode(newToken) as any;
    context.locals.wpUserId = normalizeUserId(freshDecoded?.data?.user?.id);
  } catch {
    context.locals.wpUserId = null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionCookie = context.cookies.get("session")?.value;

  if (sessionCookie) {
    const session = verifySessionToken(sessionCookie);
    if (session) {
      context.locals.user = sessionToUser(session);
    } else {
      context.cookies.delete("session", { path: "/" });
    }
  }

  // WP JWT: decode, check expiry, auto-refresh if needed
  const wpToken = context.cookies.get("wp_token")?.value || null;
  const wpRefreshToken = context.cookies.get("wp_refresh")?.value || null;
  context.locals.wpToken = wpToken;

  // If wp_token is missing but wp_refresh exists, try to refresh
  if (!wpToken && wpRefreshToken) {
    if (import.meta.env.DEV) console.log("[TOKEN] wp_token missing, wp_refresh exists, attempting silent refresh");
    const newToken = await refreshTokenFor(wpRefreshToken);
    if (newToken) {
      applyNewToken(context, newToken);
      return next();
    }
    // Silent refresh failed — drop the stale refresh token.
    context.cookies.delete("wp_refresh", { path: "/" });
    context.locals.wpUserId = null;
    return next();
  }

  if (wpToken) {
    try {
      const decoded = jwt.decode(wpToken) as any;
      const exp = decoded?.exp || 0;
      const now = Date.now();
      const expMs = exp * 1000;
      // WPGraphQL authToken may carry NO `exp` claim (payload is
      // { data: { user: { id } } }). exp===0 means we can't judge staleness →
      // treat as NOT expired and rely on the refresh fallback / WP 401s.
      const expired = exp !== 0 && expMs <= now;
      // Only refresh when truly near expiry (30s) or expired. WP tokens live
      // ~5 min; a 1h window would refresh on every single request (ADR-0012).
      const expiringSoon = exp !== 0 && !expired && expMs - now < 30 * 1000;
      if (import.meta.env.DEV) console.log("[TOKEN] expired:", expired, "expMs:", new Date(expMs).toISOString(), "now:", new Date(now).toISOString());

      // Try refresh if expired or expiring soon
      if ((expired || expiringSoon) && context.cookies.get("wp_refresh")?.value) {
        const refreshToken = context.cookies.get("wp_refresh")!.value;
        if (import.meta.env.DEV) console.log("[TOKEN] attempting refresh, refreshToken length:", refreshToken.length);
        const newToken = await refreshTokenFor(refreshToken);
        if (import.meta.env.DEV) console.log("[TOKEN] refresh done, hasNewToken:", !!newToken);
        if (newToken) {
          applyNewToken(context, newToken);
          return next();
        }
        // Refresh failed (e.g. token revoked) — drop the stale refresh token
        // so we don't retry a doomed refresh on every request.
        if (import.meta.env.DEV) console.log("[TOKEN] refresh returned no token, clearing wp_refresh");
        context.cookies.delete("wp_refresh", { path: "/" });
      }

      // If token is expired and refresh failed or no refresh token, clear it
      if (expired) {
        context.cookies.delete("wp_token", { path: "/" });
        context.cookies.delete("wp_refresh", { path: "/" });
        context.locals.wpToken = null;
        context.locals.wpUserId = null;
      } else {
        context.locals.wpUserId = normalizeUserId(decoded?.data?.user?.id);
      }
    } catch {
      context.cookies.delete("wp_token", { path: "/" });
      context.locals.wpToken = null;
      context.locals.wpUserId = null;
    }
  } else {
    context.locals.wpUserId = null;
  }

  // 幽灵登录态（ADR-0012 回归修复）：session 有效（UI 显示已登录）但 WP
  // 凭据最终无效（token 缺失 / 过期 / 刷新失败 → wpUserId 为空）。此时
  // 发评论/编辑全部 401，UI 却保持登录。清除 session 并重定向回当前页
  // 带 auth_error，让 AuthErrorToast 提示重新登录。只对页面请求生效。
  if (
    context.locals.user &&
    context.locals.wpUserId === null &&
    !context.url.pathname.startsWith("/api/") &&
    !context.url.pathname.startsWith("/_astro/") &&
    !context.url.pathname.startsWith("/@") &&
    !/\.(css|js|mjs|json|ico|png|jpg|jpeg|gif|svg|webp|avif|woff2?|ttf|eot|map)$/.test(
      context.url.pathname,
    )
  ) {
    if (import.meta.env.DEV) console.log("[TOKEN] ghost session: wp token ineffective, prompting re-login");
    context.cookies.delete("session", { path: "/" });
    context.locals.user = undefined;
    const url = new URL(context.url);
    url.searchParams.set(
      "auth_error",
      "登录已失效，请重新登录",
    );
    url.searchParams.set("auth_hint", "登录状态已过期，请重新登录后继续操作");
    return context.redirect(url.toString());
  }

  return next();
});
