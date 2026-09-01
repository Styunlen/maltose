import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { setWpTokenCookies, setSessionCookie } from "@lib/auth/wp-token";
import { createWpSessionToken } from "@lib/auth/session";

/**
 * Password login via wp-graphql-headless-login's built-in PASSWORD provider.
 * No WP-side changes needed — the plugin already exposes this mutation.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      return new Response(
        JSON.stringify({ error: "请输入用户名和密码" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation LoginWithPassword($input: LoginInput!) {
            login(input: $input) {
              authToken
              authTokenExpiration
              refreshToken
              refreshTokenExpiration
              user { databaseId email name }
            }
          }
        `,
        variables: {
          input: {
            provider: "PASSWORD",
            credentials: { username, password },
          },
        },
      }),
    });

    let data: any;
    try {
      data = await wpResponse.json();
    } catch {
      const raw = await wpResponse.text().catch(() => "(unreadable)");
      console.error("[password-login] WP returned non-JSON:", wpResponse.status, raw.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "登录服务异常，请稍后重试" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    const result = data?.data?.login;
    const error = data?.errors?.[0]?.message;

    if (!result?.authToken) {
      return new Response(
        JSON.stringify({ error: error || "用户名或密码不正确" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    setWpTokenCookies(cookies, {
      authToken: result.authToken,
      refreshToken: result.refreshToken,
    });

    // Also mint an Astro session from the WP identity so the frontend sees a
    // logged-in user (matches OTP login; /me and Astro.locals.user both work).
    const wpUser = result.user;
    if (wpUser?.databaseId) {
      const sessionToken = createWpSessionToken({
        wpUserId: String(wpUser.databaseId),
        email: wpUser.email,
        name: wpUser.name,
      });
      setSessionCookie(cookies, sessionToken);
    }

    return new Response(
      JSON.stringify({ ok: true, user: result.user }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[password-login] error:", err);
    return new Response(
      JSON.stringify({ error: "登录异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
