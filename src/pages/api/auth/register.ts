import type { APIRoute } from "astro";
import { getRegistrationUrl } from "@lib/auth/authentik";
import { sanitizeReturnTo } from "@lib/url";
import { randomBytes } from "node:crypto";

export const GET: APIRoute = async ({ redirect, cookies, url }) => {
  const returnTo = sanitizeReturnTo(url.searchParams.get("redirect") || "/");

  const stateBytes = randomBytes(16);
  const state = stateBytes.toString("hex");

  cookies.set("auth_state", JSON.stringify({ state, returnTo }), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
  });

  const registrationUrl = getRegistrationUrl(state);
  return redirect(registrationUrl);
};
