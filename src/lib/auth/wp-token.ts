import type { AstroCookies } from "astro";

/**
 * Set the session cookie (Astro-side identity). Used by OTP/password login to
 * mark the user authenticated, matching what Authentik's callback sets.
 */
export function setSessionCookie(cookies: AstroCookies, token: string): void {
  cookies.set("session", token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    secure: import.meta.env.PROD,
  });
}

/**
 * Set the WP auth token + refresh token cookies after any successful login
 * (Authentik OIDC, password, or email OTP). Centralizes the cookie shape so
 * all login paths produce identical session state.
 */
export function setWpTokenCookies(
  cookies: AstroCookies,
  tokens: { authToken?: string | null; refreshToken?: string | null },
): void {
  if (tokens.authToken) {
    cookies.set("wp_token", tokens.authToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      secure: import.meta.env.PROD,
    });
  }
  if (tokens.refreshToken) {
    cookies.set("wp_refresh", tokens.refreshToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      secure: import.meta.env.PROD,
    });
  }
}
