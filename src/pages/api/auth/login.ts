import type { APIRoute } from "astro";
import { getAuthorizationUrl } from "@lib/auth/authentik";
import { sanitizeReturnTo } from "@lib/url";
import { randomBytes } from "node:crypto";

export const GET: APIRoute = async ({ redirect, cookies, url }) => {
  const returnTo = sanitizeReturnTo(url.searchParams.get("redirect") || "/");

  // Generate a random state value to prevent CSRF on the callback
  const stateBytes = randomBytes(16);
  const state = stateBytes.toString("hex");

  // Store state + redirect URL in a temporary cookie (valid for 5 minutes)
  cookies.set("auth_state", JSON.stringify({ state, returnTo }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
  });

  const authorizationUrl = getAuthorizationUrl(state);
  return redirect(authorizationUrl);
};
