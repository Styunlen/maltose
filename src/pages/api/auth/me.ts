import type { APIRoute } from "astro";
import { verifySessionToken, sessionToUser } from "@lib/auth/session";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";

/**
 * /api/auth/me — single source of truth for the client's logged-in state.
 *
 * Returns authenticated:true ONLY when BOTH the session cookie AND the WP
 * credentials are valid. If the session exists but the wp_token is missing /
 * expired / refresh-failed (ghost login, ADR-0012 regression fix), we clear
 * the session and return authenticated:false with authError so the SPA can
 * surface the re-login toast without waiting for a page navigation.
 */
export const GET: APIRoute = async ({ cookies }) => {
  const sessionCookie = cookies.get("session")?.value;

  if (!sessionCookie) {
    return new Response(
      JSON.stringify({ authenticated: false, user: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const session = verifySessionToken(sessionCookie);
  if (!session) {
    cookies.delete("session", { path: "/" });
    return new Response(
      JSON.stringify({ authenticated: false, user: null }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  // ── WP credential check (ghost-login guard) ─────────────────────────────
  let wpToken = cookies.get("wp_token")?.value || null;
  const wpRefreshToken = cookies.get("wp_refresh")?.value || null;

  const isTokenUsable = (t: string | null): boolean => {
    if (!t) return false;
    try {
      // WPGraphQL authToken payload is { data: { user: { id } } } and may NOT
      // carry an `exp` claim. Treat "decodable" as usable (like middleware's
      // refresh-fallback); only reject malformed tokens.
      const decoded = jwt.decode(t) as any;
      if (!decoded) return false;
      const exp = decoded?.exp || 0;
      // When exp is absent we cannot judge staleness — assume usable; the
      // caller attempts a silent refresh anyway if the token later fails.
      return exp === 0 || exp * 1000 > Date.now();
    } catch {
      return false;
    }
  };

  // Try a silent refresh first when the token is missing or stale.
  if (!isTokenUsable(wpToken) && wpRefreshToken) {
    try {
      const res = await fetch(getProxyUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
            mutation RefreshAuthToken($input: RefreshTokenInput!) {
              refreshToken(input: $input) { authToken }
            }
          `,
          variables: { input: { refreshToken: wpRefreshToken } },
        }),
      });
      const data = await res.json();
      const newToken = data?.data?.refreshToken?.authToken;
      if (newToken) {
        cookies.set("wp_token", newToken, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 7,
          secure: import.meta.env.PROD,
        });
        wpToken = newToken;
      } else {
        cookies.delete("wp_refresh", { path: "/" });
      }
    } catch {
      // Refresh failed — fall through to the ghost-login branch below.
    }
  }

  if (!isTokenUsable(wpToken)) {
    // Session is valid but WP credentials are gone — clear the session so the
    // UI stops showing a logged-in user whose actions all 401.
    cookies.delete("session", { path: "/" });
    cookies.delete("wp_token", { path: "/" });
    cookies.delete("wp_refresh", { path: "/" });
    return new Response(
      JSON.stringify({
        authenticated: false,
        user: null,
        authError: "登录已失效，请重新登录",
        authHint: "登录状态已过期，请重新登录后继续操作",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      user: sessionToUser(session),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
