import type { APIRoute } from "astro";
import { getLogoutUrl } from "@lib/auth/authentik";

function handleLogout({ cookies, redirect }: { cookies: any; redirect: any }) {
  cookies.delete("session", { path: "/" });
  cookies.delete("auth_state", { path: "/" });
  cookies.delete("wp_token", { path: "/" });
  cookies.delete("wp_refresh", { path: "/" });
  cookies.delete("wp_auth_state", { path: "/" });
  return redirect(getLogoutUrl());
}

export const POST: APIRoute = (ctx) => handleLogout(ctx);
export const GET: APIRoute = (ctx) => handleLogout(ctx);
