import type { APIRoute } from "astro";
import { sanitizeReturnTo } from "@lib/url";
import {
  getWpAuthorizationUrlInteractive,
} from "@lib/auth/authentik";
import { randomBytes } from "node:crypto";

import { getProxyUrl } from '@lib/graphql-proxy';

function errorRedirect(error: string, hint: string) {
  const params = new URLSearchParams({
    auth_error: error,
    auth_hint: hint,
  });
  return `/?${params.toString()}`;
}

// Authentik errors that mean "the user isn't authenticated but could be" —
// recoverable by showing the interactive login page. Anything else is a hard
// failure and should surface as an error (see ADR-0011).
const RECOVERABLE_AUTH_ERRORS = [
  "login_required",
  "interaction_required",
  "account_selection_required",
];

export const GET: APIRoute = async ({ url, redirect, cookies }) => {
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (!code) {
    // The silent prompt=none attempt failed because the user has no active
    // Authentik session. Fall back to the interactive login URL (prompt=login)
    // with a fresh state so we always get a code back instead of erroring.
    if (error && RECOVERABLE_AUTH_ERRORS.includes(error)) {
      const stateBytes = randomBytes(16);
      const state = stateBytes.toString("hex");
      cookies.set("wp_auth_state", JSON.stringify({ state, returnTo: "/" }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 300,
      });
      return redirect(getWpAuthorizationUrlInteractive(state));
    }
    return redirect(errorRedirect("WP 登录失败", "未收到授权码"));
  }

  const storedStateRaw = cookies.get("wp_auth_state")?.value;
  cookies.delete("wp_auth_state", { path: "/" });

  if (!storedStateRaw) {
    return redirect(errorRedirect("WP 登录失败", "登录状态已失效，请重新登录"));
  }

  let storedState: { state?: string; returnTo?: string };
  try {
    storedState = JSON.parse(storedStateRaw);
  } catch {
    return redirect(errorRedirect("WP 登录失败", "登录状态已失效，请重新登录"));
  }

  if (storedState.state !== stateParam) {
    return redirect(errorRedirect("WP 登录失败", "状态不匹配，请重试"));
  }
  const returnTo = sanitizeReturnTo(storedState.returnTo || "/");

  try {
    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation LoginUser($input: LoginInput!) {
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
            provider: "OAUTH2_GENERIC",
            oauthResponse: {
              code,
              state: stateParam || "",
            },
          },
        },
      }),
    });

    const wpData = await wpResponse.json();

    if (wpData?.data?.login?.authToken) {
      cookies.set("wp_token", wpData.data.login.authToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        secure: import.meta.env.PROD,
      });

      if (wpData.data.login.refreshToken) {
        cookies.set("wp_refresh", wpData.data.login.refreshToken, {
          path: "/",
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 30,
          secure: import.meta.env.PROD,
        });
      }
    } else {
      const status = wpResponse.status;
      const errors = wpData?.errors || [];
      const wpError = errors[0]?.message || JSON.stringify(wpData);
      console.warn("WPGraphQL login failed — HTTP", status, JSON.stringify({ errors, data: wpData }, null, 2));

      const hint = wpError.includes("invalid_client")
        ? "WordPress 与 Authentik 的连接配置有误，请在 WordPress 后台检查 wp-graphql-headless-login 插件设置"
        : `WordPress 返回 ${status}：${(errors[0]?.debugMessage || wpError).slice(0, 120)}`;
      return redirect(errorRedirect("WP 登录失败", hint));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("WPGraphQL login error:", msg);
    return redirect(errorRedirect("WP 连接异常", msg.slice(0, 120)));
  }

  return redirect(returnTo);
};
