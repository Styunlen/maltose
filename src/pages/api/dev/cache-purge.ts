import type { APIRoute } from "astro";
import { client } from "@api/api";

/**
 * Dev-only endpoint to manually clear the Apollo in-memory cache.
 *
 * In development the WordPress save_post purge hook cannot reach a local
 * frontend (the server would hit its own localhost), so `maltose_astro_url`
 * is left empty. This endpoint fills that gap: after editing a post in the
 * WP admin during development, POST to this endpoint to refresh cached data
 * without restarting the dev server.
 */
export const POST: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return new Response("Not found", { status: 404 });
  }

  try {
    client.cache.reset();
    console.log("[dev/cache-purge] Apollo cache reset");
    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[dev/cache-purge] failed to reset cache:", err);
    return new Response(
      JSON.stringify({ ok: false }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
