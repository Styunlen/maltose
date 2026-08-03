import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { client } from "@api/api";

function getSecret(): string {
  const secret = import.meta.env.WP_GRAPHQL_SECRET_KEY;
  if (!secret || secret === "change-me") {
    if (import.meta.env.PROD) {
      throw new Error("WP_GRAPHQL_SECRET_KEY is not configured. Set it in .env before deploying.");
    }
    console.warn("[cache-purge] WP_GRAPHQL_SECRET_KEY is using a placeholder value — set it before deploying.");
  }
  return secret || "change-me";
}

function getExpireSeconds(): number {
  return Number(import.meta.env.WP_SIGN_EXPIRE_SECONDS) || 60;
}

export const POST: APIRoute = async ({ request }) => {
  const timestamp = request.headers.get("X-Graphql-Timestamp") || "";
  const signature = request.headers.get("X-Graphql-Signature") || "";

  if (!timestamp || !signature) {
    return new Response(
      JSON.stringify({ error: "Missing signature headers" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(now - Number(timestamp));
  if (!Number.isFinite(Number(timestamp)) || timeDiff > getExpireSeconds()) {
    return new Response(
      JSON.stringify({ error: "Signature expired" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const expected = createHash("sha256")
    .update(getSecret() + timestamp)
    .digest("hex");
  if (expected !== signature) {
    return new Response(
      JSON.stringify({ error: "Invalid signature" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const cache = client.cache;
    cache.evict({ fieldName: "posts" });
    cache.evict({ fieldName: "mostViewedPosts" });
    cache.evict({ fieldName: "stickyPosts" });
    cache.evict({ fieldName: "nodeByUri" });
    cache.gc();
    console.log("[cache-purge] Apollo cache invalidated");
  } catch (err) {
    console.error("[cache-purge] Failed to invalidate cache:", err);
    return new Response(
      JSON.stringify({ error: "Cache invalidation failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
