import type { APIRoute } from "astro";
import {
  exchangeCodeForTokens,
  parseUserFromIdToken,
} from "@lib/auth/authentik";
import { createSessionToken } from "@lib/auth/session";
import { sanitizeReturnTo } from "@lib/url";

export const GET: APIRoute = async ({ url, redirect, cookies }) => {
  try {
    const code = url.searchParams.get("code");
    const stateParam = url.searchParams.get("state");

    if (!code) {
      const errP = new URLSearchParams({ auth_error: "授权失败", auth_hint: "未收到授权码，请重试" });
      return redirect(`/?${errP.toString()}`);
    }

    const storedStateRaw = cookies.get("auth_state")?.value;
    cookies.delete("auth_state", { path: "/" });

    if (!storedStateRaw) {
      const errP = new URLSearchParams({ auth_error: "授权失败", auth_hint: "登录状态已失效，请重新登录" });
      return redirect(`/?${errP.toString()}`);
    }

    let storedState: { state?: string; returnTo?: string };
    try {
      storedState = JSON.parse(storedStateRaw);
    } catch {
      const errP = new URLSearchParams({ auth_error: "授权失败", auth_hint: "登录状态已失效，请重新登录" });
      return redirect(`/?${errP.toString()}`);
    }

    if (storedState.state !== stateParam) {
      const errP = new URLSearchParams({ auth_error: "授权失败", auth_hint: "state 不匹配，请重试" });
      return redirect(`/?${errP.toString()}`);
    }

    // Exchange the authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Parse user info from the id_token
    const user = parseUserFromIdToken(tokens.id_token);
    if (!user) {
      const errP = new URLSearchParams({ auth_error: "登录失败", auth_hint: "无法解析用户信息" });
      return redirect(`/?${errP.toString()}`);
    }

    // Create our own session JWT and store as httpOnly cookie
    const sessionToken = createSessionToken(user);

    cookies.set("session", sessionToken, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      secure: import.meta.env.PROD,
    });

    // Redirect back to the page the user came from (or home)
    let returnTo = "/";
    if (storedState.returnTo) {
      returnTo = sanitizeReturnTo(storedState.returnTo);
    }

    // Redirect to WordPress SSO init instead of directly to returnTo
    const wpReturnTo = encodeURIComponent(returnTo);
    return redirect(`/api/auth/wp-init?returnTo=${wpReturnTo}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("OIDC callback error:", message);

    let hint = "";
    if (message.includes("invalid_client")) {
      hint = "客户端验证失败，请确认 AUTHENTIK_CLIENT_ID 和 AUTHENTIK_CLIENT_SECRET 配置正确";
    } else if (message.includes("redirect_uri_mismatch")) {
      hint = "Redirect URI 不匹配，请在 Authentik 后台添加: " +
        (import.meta.env.DEV
          ? "http://localhost:4321/api/auth/callback"
          : `${process.env.APP_URL || "https://your-domain"}/api/auth/callback`);
    } else {
      hint = message.slice(0, 120);
    }

    const errP = new URLSearchParams({ auth_error: "登录失败", auth_hint: hint });
    return redirect(`/?${errP.toString()}`);
  }
};
