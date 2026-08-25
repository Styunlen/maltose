import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { RateLimiterMemory, RateLimiterRedis } from "rate-limiter-flexible";
import { connectRedisIfConfigured } from "@lib/auth/redis";
import RateLimiterLmdb from "@/lib/rate-limit/lmdb-limiter";

const WP_GRAPHQL_URL =
  process.env.WORDPRESS_API_URL || "https://styunlen.cn/graphql";

const VIEW_RATE_LIMIT_OPTS = {
  points: 1, // one recorded view
  duration: 60, // per 60 seconds per IP+post
  keyPrefix: "view_rate",
};

// OTP send is a public mutation — throttle per IP to prevent mail-bombing
// (the WP side only throttles per-email; a bot can otherwise spray addresses).
// 10/hr balances normal users (retry after lost mail, switching mailbox) with
// abuse protection; the WP-side 60s per-email resend gate is the second layer.
const OTP_SEND_RATE_LIMIT_OPTS = {
  points: 10, // ten sendEmailOtp calls
  duration: 3600, // per hour per IP
  keyPrefix: "otp_send",
};

// Lazy-initialized rate limiter. The backend follows the cache driver
// (GRAPHQL_CACHE_DRIVER, ADR-0032): redis → shared via Redis (multi-instance
// pm2), lmdb → shared via LMDB file (multi-process, no server), anything else
// → in-process memory (single-instance). The CACHE_DRIVER is the single source
// of truth for "is a shared backend available in this environment".
interface ConsumeLimiter {
  consume(key: string): Promise<unknown>;
}
type AnyLimiter =
  | (RateLimiterMemory & ConsumeLimiter)
  | (RateLimiterRedis & ConsumeLimiter)
  | (RateLimiterLmdb & ConsumeLimiter);

async function createLimiter(opts: {
  points: number;
  duration: number;
  keyPrefix: string;
}): Promise<AnyLimiter> {
  const driver = process.env.GRAPHQL_CACHE_DRIVER || "memory";

  if (driver === "redis") {
    const client = await connectRedisIfConfigured();
    if (client) {
      return new RateLimiterRedis({ storeClient: client, ...opts });
    }
    console.warn("[rate-limit] redis driver requested but Redis unavailable — using memory");
  }

  if (driver === "lmdb") {
    return new RateLimiterLmdb(opts);
  }

  return new RateLimiterMemory(opts);
}

let viewRateLimiterPromise: Promise<AnyLimiter> | null = null;

function getViewRateLimiter(): Promise<AnyLimiter> {
  if (!viewRateLimiterPromise) {
    viewRateLimiterPromise = createLimiter(VIEW_RATE_LIMIT_OPTS);
  }
  return viewRateLimiterPromise;
}

let otpSendLimiterPromise: Promise<AnyLimiter> | null = null;

function getOtpSendLimiter(): Promise<AnyLimiter> {
  if (!otpSendLimiterPromise) {
    otpSendLimiterPromise = createLimiter(OTP_SEND_RATE_LIMIT_OPTS);
  }
  return otpSendLimiterPromise;
}

function getSecret(): string {
  const secret = process.env.WP_GRAPHQL_SECRET_KEY;
  if (!secret || secret === "change-me") {
    if (import.meta.env.PROD) {
      throw new Error("WP_GRAPHQL_SECRET_KEY is not configured. Set it in .env before deploying.");
    }
    console.warn("[graphql-proxy] WP_GRAPHQL_SECRET_KEY is using a placeholder value — set it before deploying.");
  }
  return secret || "change-me";
}

function getExpireSeconds(): number {
  return Number(process.env.WP_SIGN_EXPIRE_SECONDS) || 60;
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
// updateUser is deliberately allowed (self-service profile edits, ADR-0030);
// revokeUserSecret is allowed (logout must invalidate the refresh token server-side, 方案 A);
// all other user mutations stay blocked.
const BLOCKED_PATTERNS = [
  /__schema\b/,
  /__type\b/,
  /\b(?:createUser|deleteUser|registerUser|resetUserPassword)\b/,
  /\b(?:updateSettings|updateOptions)\b/,
  /\b(?:createPost|updatePost|deletePost|createPage|updatePage|deletePage)\b/,
  /\b(?:createMediaItem|updateMediaItem|deleteMediaItem)\b/,
  /\b(?:createCategory|updateCategory|deleteCategory|createTag|updateTag|deleteTag)\b/,
  /\b(?:updatePlugin|updateTheme)\b/,
  /\b(?:linkUserIdentity|refreshUserSecret|restoreComment)\b/,
];

function isBlocked(query: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(query));
}

// Any mutation requires an authenticated wp_token. Queries stay open.
function isMutation(query: string): boolean {
  return /^\s*mutation\b/m.test(query);
}

function hasAuth(request: Request): boolean {
  // Coarse gate only — the real auth is WPGraphQL's JWT check on the WP side.
  // Requiring a Bearer-shaped header filters obviously-invalid anonymous calls
  // without pretending this is a validation layer.
  const h = request.headers.get("Authorization") || "";
  return /^Bearer\s+\S+/.test(h);
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

// Mutations require an authenticated wp_token (ADR-0030).
// Exemptions — these run *before* a token exists:
//   recordPostView (visitor view counting),
//   login / refreshToken (credential flows),
//   sendEmailOtp / verifyEmailOtp (passwordless pre-auth).
function isPublicMutation(query: string): boolean {
  return (
    isRecordPostView(query) ||
    /\b(?:login|refreshToken|sendEmailOtp|verifyEmailOtp)\s*\(/.test(query)
  );
}

    // Mutations require an authenticated wp_token (ADR-0030).
    if (isMutation(query) && !isPublicMutation(query) && !hasAuth(request)) {
      return new Response(
        JSON.stringify({ error: "请先登录后再操作" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Per-IP throttle on OTP sends (public endpoint; prevents mail-bombing).
    if (/\bsendEmailOtp\s*\(/.test(query)) {
      const ip = clientAddress || "unknown";
      try {
        const limiter = await getOtpSendLimiter();
        await limiter.consume(ip);
      } catch {
        console.warn(`[graphql-proxy] sendEmailOtp rate limited: ip=${ip}`);
        return new Response(
          JSON.stringify({ error: "发送过于频繁，请稍后再试" }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }
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
  ...(process.env.APP_URL ? [process.env.APP_URL] : []),
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
