import type { APIRoute } from "astro";
import { getLogoutUrl } from "@lib/auth/authentik";
import { getProxyUrl } from "@lib/graphql-proxy";
import { verifySessionToken } from "@lib/auth/session";
import jwt from "jsonwebtoken";

async function revokeUserSecret(wpToken: string): Promise<void> {
  let userId: string | null = null;
  try {
    const decoded = jwt.decode(wpToken) as any;
    userId = decoded?.data?.user?.id ? String(decoded.data.user.id) : null;
  } catch {
    return;
  }
  if (!userId) return;

  try {
    await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          mutation RevokeUserSecret($userId: ID!) {
            revokeUserSecret(input: { userId: $userId }) { success }
          }
        `,
        variables: { userId },
      }),
    });
  } catch {
    // Best-effort revocation — the local cookies are cleared regardless.
  }
}

function handleLogout({ cookies, redirect }: { cookies: any; redirect: any }) {
  // Revoke the WP-side user secret so the refresh token dies server-side too,
  // not just the cookie (方案 A). Fire-and-forget; do not block redirect.
  const wpToken = cookies.get("wp_token")?.value;
  if (wpToken) void revokeUserSecret(wpToken);

  // Only Authentik-signed-in users need the Authentik end-session round-trip:
  // it destroys the OIDC session so the next "Authentik 登录" requires a fresh
  // password. Password/OTP users have no Authentik session — redirect home.
  let isAuthentik = false;
  const sessionCookie = cookies.get("session")?.value;
  if (sessionCookie) {
    const session = verifySessionToken(sessionCookie);
    isAuthentik = session?.provider === "authentik";
  }

  cookies.delete("session", { path: "/" });
  cookies.delete("auth_state", { path: "/" });
  cookies.delete("wp_token", { path: "/" });
  cookies.delete("wp_refresh", { path: "/" });
  cookies.delete("wp_auth_state", { path: "/" });
  return redirect(isAuthentik ? getLogoutUrl() : "/");
}

export const POST: APIRoute = (ctx) => handleLogout(ctx);
export const GET: APIRoute = (ctx) => handleLogout(ctx);
