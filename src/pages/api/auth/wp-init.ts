import type { APIRoute } from "astro";
import { getWpAuthorizationUrl } from "@lib/auth/authentik";
import { sanitizeReturnTo } from "@lib/url";
import { randomBytes } from "node:crypto";

export const GET: APIRoute = async ({ redirect, cookies, url }) => {
  if (!cookies.get("session")?.value) {
    return redirect("/?auth_error=请先登录");
  }

  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") || "/");

  const stateBytes = randomBytes(16);
  const state = stateBytes.toString("hex");

  cookies.set("wp_auth_state", JSON.stringify({ state, returnTo }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
  });

  return redirect(getWpAuthorizationUrl(state));
};
