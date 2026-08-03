import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";

export const GET: APIRoute = async () => {
  // Debug-only endpoint — disabled in production
  if (!import.meta.env.DEV) {
    return new Response(
      JSON.stringify({ error: "Not available" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const results: Record<string, any> = {};

  // 1. Test basic connectivity
  try {
    const pingStart = Date.now();
    const pingRes = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `{ __typename }`,
      }),
    });
    const pingMs = Date.now() - pingStart;
    results.connectivity = {
      ok: pingRes.ok,
      status: pingRes.status,
      ms: pingMs,
    };
    results.connectivity.body = await pingRes
      .text()
      .catch(() => "(unreadable)");
  } catch (err) {
    results.connectivity = {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // 2. Check if wp-graphql-headless-login plugin is active
  try {
    const pluginRes = await fetch(getProxyUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `
          {
            loginClients {
              provider
            }
          }
        `,
      }),
    });
    const pluginData = await pluginRes.json();
    const hasLoginClients = !pluginData?.errors?.some(
      (e: any) => e.message?.includes("Cannot query field"),
    );
    results.pluginActive = hasLoginClients;
    results.hasLoginMutation = hasLoginClients;
  } catch (err) {
    results.pluginError = err instanceof Error ? err.message : String(err);
  }

  // 3. Check env config (redact secrets)
  results.config = {
    WORDPRESS_API_URL: import.meta.env.WORDPRESS_API_URL || "(not set)",
    AUTHENTIK_WP_CLIENT_ID: import.meta.env.AUTHENTIK_WP_CLIENT_ID
      ? `${String(import.meta.env.AUTHENTIK_WP_CLIENT_ID).slice(0, 8)}...`
      : "(not set)",
    APP_URL: import.meta.env.APP_URL,
  };

  return new Response(JSON.stringify(results, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
