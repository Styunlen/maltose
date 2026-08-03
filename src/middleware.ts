import { defineMiddleware } from "astro/middleware";
import { verifySessionToken, sessionToUser } from "@lib/auth/session";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";

// WPGraphQL JWT carries the user id as a string; normalize to a number for
// consistent comparison against numeric databaseId fields.
function normalizeUserId(raw: unknown): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
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
          variables: { input: { refreshToken: wpRefreshToken } },
        }),
      });
      const data = await res.json();
      const newToken = data?.data?.refreshToken?.authToken;
      if (import.meta.env.DEV) console.log("[TOKEN] silent refresh status:", res.status, "hasNewToken:", !!newToken);
      if (newToken) {
        context.cookies.set("wp_token", newToken, {
          path: "/", httpOnly: true, sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7, secure: import.meta.env.PROD,
        });
        context.locals.wpToken = newToken;
        // Decode the fresh token so the current request reflects the user
        try {
          const freshDecoded = jwt.decode(newToken) as any;
          context.locals.wpUserId = normalizeUserId(freshDecoded?.data?.user?.id);
        } catch {
          context.locals.wpUserId = null;
        }
        return next();
      }
      // Silent refresh failed — drop the stale refresh token.
      context.cookies.delete("wp_refresh", { path: "/" });
    } catch (e) {
      if (import.meta.env.DEV) console.log("[TOKEN] silent refresh failed:", e);
      context.cookies.delete("wp_refresh", { path: "/" });
    }
    context.locals.wpUserId = null;
    return next();
  }

  if (wpToken) {
    try {
      const decoded = jwt.decode(wpToken) as any;
      const exp = decoded?.exp || 0;
      const now = Date.now();
      const expMs = exp * 1000;
      const expired = expMs <= now;
      const expiringSoon = !expired && expMs - now < 3600 * 1000;
      if (import.meta.env.DEV) console.log("[TOKEN] expired:", expired, "expMs:", new Date(expMs).toISOString(), "now:", new Date(now).toISOString());

      // Try refresh if expired or expiring soon
      if ((expired || expiringSoon) && context.cookies.get("wp_refresh")?.value) {
        const refreshToken = context.cookies.get("wp_refresh")!.value;
        if (import.meta.env.DEV) console.log("[TOKEN] attempting refresh, refreshToken length:", refreshToken.length);
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
          if (import.meta.env.DEV) console.log("[TOKEN] refresh response status:", res.status, "hasErrors:", !!data?.errors, "hasNewToken:", !!data?.data?.refreshToken?.authToken);
          if (data?.errors && import.meta.env.DEV) {
            console.log("[TOKEN] refresh errors:", JSON.stringify(data.errors));
          }
          const newToken = data?.data?.refreshToken?.authToken;
          if (newToken) {
            context.cookies.set("wp_token", newToken, {
              path: "/", httpOnly: true, sameSite: "lax",
              maxAge: 60 * 60 * 24 * 7, secure: import.meta.env.PROD,
            });
            context.locals.wpToken = newToken;
            const freshDecoded = jwt.decode(newToken) as any;
            context.locals.wpUserId = normalizeUserId(freshDecoded?.data?.user?.id);
            return next();
          }
          // Refresh failed (e.g. token revoked) — drop the stale refresh token
          // so we don't retry a doomed refresh on every request.
          if (import.meta.env.DEV) console.log("[TOKEN] refresh returned no token, clearing wp_refresh");
          context.cookies.delete("wp_refresh", { path: "/" });
        } catch { /* refresh failed */ }
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

  return next();
});
