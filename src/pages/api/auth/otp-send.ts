import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";

/**
 * Send an email OTP via the WP-side `sendEmailOtp` mutation.
 * Stores only a "currently verifying email" cookie for UX; the real code
 * lives WP-side (transient) so it cannot be forged client-side.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const email = String(body?.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "邮箱格式不正确" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation SendEmailOtp($email: String!) {
            sendEmailOtp(input: { email: $email }) {
              sent
              expiresIn
              error
            }
          }
        `,
        variables: { email },
      }),
    });

    let data: any;
    try {
      data = await wpResponse.json();
    } catch {
      const raw = await wpResponse.text().catch(() => "(unreadable)");
      console.error("[otp-send] WP returned non-JSON:", wpResponse.status, raw.slice(0, 300));
      return new Response(
        JSON.stringify({ error: "邮件服务异常，请稍后重试" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }
    const result = data?.data?.sendEmailOtp;
    const error = data?.errors?.[0]?.message || result?.error;

    if (!result?.sent) {
      return new Response(
        JSON.stringify({ error: error || "验证码发送失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Track the email currently verifying (no secret material — the code is
    // WP-side). Max 10 min to match the transient TTL.
    cookies.set("email_otp_state", JSON.stringify({ email, exp: Date.now() + (result.expiresIn || 600) * 1000 }), {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: result.expiresIn || 600,
      secure: import.meta.env.PROD,
    });

    return new Response(
      JSON.stringify({ ok: true, expiresIn: result.expiresIn }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[otp-send] error:", err);
    return new Response(
      JSON.stringify({ error: "验证码发送异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
