import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { connectRedisIfConfigured } from "@lib/auth/redis";

const WP_GRAPHQL_URL =
  import.meta.env.WORDPRESS_API_URL || "https://styunlen.cn/graphql";

const VIEW_RATE_LIMIT_OPTS = {
  points: 1, // one recorded view
  duration: 60, // per 60 seconds per IP+post
  keyPrefix: "view_rate",
};

// Lazy-initialized rate limiter. Uses Redis when REDIS_URL is configured
// (multi-instance pm2 deployments) and an in-memory limiter otherwise
// (single-instance deployments, no Redis dependency).
let viewRateLimiterPromise: Promise<RateLimiterMemory | RateLimiterRedis> | null =
  null;

function getViewRateLimiter(): Promise<RateLimiterMemory | RateLimiterRedis> {
  if (!viewRateLimiterPromise) {
    viewRateLimiterPromise = (async () => {
      const client = await connectRedisIfConfigured();
      if (client) {
        return new RateLimiterRedis({
          storeClient: client,
          ...VIEW_RATE_LIMIT_OPTS,
        });
      }
      return new RateLimiterMemory(VIEW_RATE_LIMIT_OPTS);
    })();
  }
  return viewRateLimiterPromise;
}

function getSecret(): string {
  const secret = import.meta.env.WP_GRAPHQL_SECRET_KEY;
  if (!secret || secret === "change-me") {
    if (import.meta.env.PROD) {
      throw new Error("WP_GRAPHQL_SECRET_KEY is not configured. Set it in .env before deploying.");
    }
    console.warn("[graphql-proxy] WP_GRAPHQL_SECRET_KEY is using a placeholder value — set it before deploying.");
  }
  return secret || "change-me";
}

function getExpireSeconds(): number {
  return Number(import.meta.env.WP_SIGN_EXPIRE_SECONDS) || 60;
}

/**
 * Generate signature headers for a given timestamp.
 * Signature = SHA256(secret + timestamp)
 */
function buildSignatureHeaders(): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHash("sha256")
    .update(getSecret() + timestamp)
    .digest("hex");
  return {
    "X-Graphql-Timestamp": timestamp,
    "X-Graphql-Signature": signature,
  };
}

// Blacklisted operations — rejected even with a valid session (defense-in-depth against open-relay abuse)
const BLOCKED_PATTERNS = [
  /__schema\b/,
  /__type\b/,
  /\b(?:createUser|updateUser|deleteUser|registerUser|resetUserPassword)\b/,
  /\b(?:updateSettings|updateOptions)\b/,
  /\b(?:createPost|updatePost|deletePost|createPage|updatePage|deletePage)\b/,
  /\b(?:createMediaItem|updateMediaItem|deleteMediaItem)\b/,
  /\b(?:createCategory|updateCategory|deleteCategory|createTag|updateTag|deleteTag)\b/,
  /\b(?:updatePlugin|updateTheme)\b/,
  /\b(?:linkUserIdentity|refreshUserSecret|revokeUserSecret|restoreComment)\b/,
];

function isBlocked(query: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(query));
}

function isRecordPostView(query: string): boolean {
  return /\brecordPostView\s*\(/.test(query);
}

function getViewKey(clientAddress: string, variables: any): string {
  const postId = String(variables?.postId ?? "unknown");
  return createHash("sha256")
    .update(`${clientAddress}:${postId}`)
    .digest("hex")
    .slice(0, 32);
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const body = await request.json();
    const { query, variables } = body;

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing query" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Reject blocked operations
    if (isBlocked(query)) {
      return new Response(
        JSON.stringify({ error: "Operation not allowed" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Coarse per-IP+post rate limit for view recording (exact dedup happens
    // server-side via transient window). Return 200 with a null viewCount so
    // the client keeps its optimistic value, flagged via extensions for clarity.
    if (isRecordPostView(query)) {
      const ip = clientAddress || "unknown";
      const key = getViewKey(ip, variables);
      try {
        const limiter = await getViewRateLimiter();
        await limiter.consume(key);
      } catch {
        console.warn(`[graphql-proxy] recordPostView rate limited: ip=${ip} postId=${variables?.postId}`);
        return new Response(
          JSON.stringify({
            data: { recordPostView: { viewCount: null, __typename: "RecordPostViewPayload" } },
            extensions: { rateLimited: true, retryAfterSeconds: VIEW_RATE_LIMIT_OPTS.duration },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Forward Authorization header if present (for authenticated requests)
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const authHeader = request.headers.get("Authorization");
    if (authHeader) {
      forwardHeaders["Authorization"] = authHeader;
    }
    // Forward the browser User-Agent so WordPress can record it as the
    // comment agent (agentPublic field). create.ts reads the real browser UA
    // server-side and passes it here; without this the agent is always empty
    // and the comment UI shows "Unknown".
    const uaHeader = request.headers.get("user-agent");
    if (uaHeader) {
      forwardHeaders["User-Agent"] = uaHeader;
    }

    // Add signature headers
    Object.assign(forwardHeaders, buildSignatureHeaders());

    const wpResponse = await fetch(WP_GRAPHQL_URL, {
      method: "POST",
      headers: forwardHeaders,
      body: JSON.stringify({ query, variables }),
    });

    const data = await wpResponse.json();
    if (isRecordPostView(query)) {
      console.log(`[graphql-proxy] WP responded to recordPostView: HTTP ${wpResponse.status}`, JSON.stringify(data));
    }
    const resHeaders: Record<string, string> = { "Content-Type": "application/json" };

    // Echo signature headers only in development for debugging
    if (import.meta.env.DEV) {
      const sigHeaders = buildSignatureHeaders();
      resHeaders["X-Debug-Timestamp"] = sigHeaders["X-Graphql-Timestamp"];
      resHeaders["X-Debug-Signature"] = sigHeaders["X-Graphql-Signature"];
    }

    return new Response(JSON.stringify(data), {
      status: wpResponse.status,
      headers: resHeaders,
    });
  } catch (error) {
    console.error("GraphQL proxy error:", error);
    return new Response(
      JSON.stringify({ error: "Proxy error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

// Origins allowed to make cross-origin browser requests to this proxy.
// The frontend normally calls it same-origin (via APP_URL); this only
// matters for subdomain/port variants of the site. Requests from other
// origins get no CORS headers and are rejected by the browser.
const ALLOWED_ORIGINS = [
  "http://localhost:4321",
  ...(import.meta.env.APP_URL ? [import.meta.env.APP_URL] : []),
  ...(import.meta.env.SITE ? [import.meta.env.SITE] : []),
].filter(Boolean);

export const OPTIONS: APIRoute = async ({ request }) => {
  const origin = request.headers.get("origin");
  const isAllowed = origin && ALLOWED_ORIGINS.includes(origin);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Graphql-Timestamp, X-Graphql-Signature",
  };
  if (isAllowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return new Response(null, { status: 204, headers });
};
