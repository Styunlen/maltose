import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { setWpTokenCookies, setSessionCookie } from "@lib/auth/wp-token";
import { createWpSessionToken } from "@lib/auth/session";

/**
 * Verify an emailed OTP via the WP-side `verifyEmailOtp` mutation.
 * On success it finds-or-creates the WP user and returns the same
 * authToken/refreshToken pair as any other login path — we drop them into
 * the standard wp_token / wp_refresh cookies, create an Astro session from
 * the WP identity, and clear the OTP state. The user is now logged in.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const code = String(body?.code || "").trim();

    // The email must match the one we sent the code to (guarded by cookie).
    const state = (() => {
      try {
        const raw = cookies.get("email_otp_state")?.value;
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })();

    if (!email || !code || !/^\d{6}$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "验证码格式不正确" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!state || state.email !== email || Date.now() > (state.exp || 0)) {
      return new Response(
        JSON.stringify({ error: "验证请求已过期，请重新获取验证码" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation VerifyEmailOtp($email: String!, $code: String!) {
            verifyEmailOtp(input: { email: $email, code: $code }) {
              authToken
              authTokenExpiration
              refreshToken
              refreshTokenExpiration
              user { databaseId name email }
              needsProfile
              error
              debugError
            }
          }
        `,
        variables: { email, code },
      }),
    });

    let data: any;
    try {
      data = await wpResponse.json();
    } catch {
      const raw = await wpResponse.text().catch(() => "(unreadable)");
      console.error("[otp-verify] WP returned non-JSON:", wpResponse.status, raw.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "登录服务异常，请稍后重试" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    const result = data?.data?.verifyEmailOtp;
    const error = data?.errors?.[0]?.message || result?.error;

    if (!result?.authToken || error) {
      // Include the WP-side diagnostic detail when present so the exact
      // failure can be read from the response without WP_DEBUG enabled.
      const diagnostic = result?.debugError ? ` [${result.debugError}]` : "";
      return new Response(
        JSON.stringify({ error: `${error || "验证失败，请重试"}${diagnostic}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    setWpTokenCookies(cookies, {
      authToken: result.authToken,
      refreshToken: result.refreshToken,
    });

    // The OTP user is now authenticated on the Astro side too: mint a session
    // from the WP identity so /me and Astro.locals.user see a logged-in user.
    const wpUser = result.user;
    if (wpUser?.databaseId) {
      const sessionToken = createWpSessionToken({
        wpUserId: String(wpUser.databaseId),
        email: wpUser.email,
        name: wpUser.name,
      });
      setSessionCookie(cookies, sessionToken);
    }

    cookies.delete("email_otp_state", { path: "/" });

    // A 方案：WP 侧按 profile 完整性返回真实 needsProfile，老用户不再被
    // 强推资料页。仅首次（profile 未完善）跳转 /user/profile。
    return new Response(
      JSON.stringify({ ok: true, needsProfile: Boolean(result.needsProfile) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[otp-verify] error:", err);
    return new Response(
      JSON.stringify({ error: "验证异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
