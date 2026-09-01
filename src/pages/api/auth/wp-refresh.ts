import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const refreshToken = cookies.get("wp_refresh")?.value;
    if (!refreshToken) {
      return new Response(
        JSON.stringify({ ok: false, error: "No refresh token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          mutation RefreshAuthToken($input: RefreshTokenInput!) {
            refreshToken(input: $input) {
              authToken
              authTokenExpiration
            }
          }
        `,
        variables: {
          input: { refreshToken },
        },
      }),
    });

    const data = await wpResponse.json();
    const newToken = data?.data?.refreshToken?.authToken;

    if (newToken) {
      cookies.set("wp_token", newToken, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        secure: import.meta.env.PROD,
      });
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: false, error: "Refresh failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Token refresh error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Refresh error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
