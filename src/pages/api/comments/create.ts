import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { sanitizeMarkdownSource } from "@lib/markdown";
import { __internalLruCache } from "@api/api";

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const wpToken = cookies.get("wp_token")?.value;
    if (!wpToken) {
      return new Response(
        JSON.stringify({ error: "尚未登录 WordPress，请重新登录" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const { postDatabaseId, content, parent, blockReference } = body;

    if (!postDatabaseId || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "参数不完整" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Sanitize raw markdown before storage
    const sanitized = sanitizeMarkdownSource(content.trim());

    // Paragraph-comment anchor (ADR-0036 P3); validate shape + re-truncate snippet.
    let blockRefInput: string | undefined;
    if (blockReference && typeof blockReference === "object") {
      const clientId =
        typeof blockReference.clientId === "string" ? blockReference.clientId.trim() : "";
      const snippet =
        typeof blockReference.snippet === "string"
          ? blockReference.snippet.trim().slice(0, 80)
          : "";
      if (clientId) {
        blockRefInput = JSON.stringify({ clientId, snippet });
      }
    }

    // Read the real browser UA from the incoming request instead of trusting
    // a client-supplied value. WordPress records this as the comment agent.
    const realUserAgent = request.headers.get("user-agent") || "";
    // The client's real IP: the browser never sends X-Forwarded-For itself —
    // Astro's clientAddress (resolved from the trusted proxy headers via
    // security.allowedDomains) holds the real visitor IP. Fall back to the
    // raw header only when clientAddress is unavailable (direct/local dev).
    // This route forwards to the local proxy (getProxyUrl), which would
    // otherwise see a loopback client and lose the real IP.
    const realClientIp =
      (clientAddress && clientAddress !== "::1" && clientAddress !== "127.0.0.1"
        ? clientAddress
        : "") || request.headers.get("x-forwarded-for") || "";

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${wpToken}`,
    };
    if (realUserAgent) {
      fetchHeaders["User-Agent"] = realUserAgent;
    }
    if (realClientIp) {
      fetchHeaders["X-Forwarded-For"] = realClientIp;
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: fetchHeaders,
      body: JSON.stringify({
        query: `
          mutation CreateComment($input: CreateCommentInput!) {
            createComment(input: $input) {
              success
              comment {
                id
                databaseId
                content
                author {
                  node {
                    name
                    url
                    avatar { url }
                  }
                }
                date
                parent { node { ... on Comment { databaseId } } }
              }
            }
          }
        `,
        variables: {
          input: {
            commentOn: postDatabaseId,
            content: sanitized,
            parent: parent || undefined,
            blockReference: blockRefInput,
          },
        },
      }),
    });

    const data = await wpResponse.json();

    if (data?.errors) {
      return new Response(
        JSON.stringify({
          error: data.errors[0]?.message || "评论提交失败",
          details: data.errors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Comments are embedded in GetNodeByURI responses — drop those cache
    // entries so the next read revalidates with the new comment (ADR-0024).
    // Preview cards embed commentCount too, so drop those as well (ADR-0025).
    // Site stats (TimelineStats) and homepage cards (HomePosts) carry counts.
    __internalLruCache.deleteByPrefix("GetNodeByURI:");
    __internalLruCache.deleteByPrefix("PreviewByUri:");
    __internalLruCache.deleteByPrefix("TimelineStats:");
    __internalLruCache.deleteByPrefix("HomePosts:");
    __internalLruCache.deleteByPrefix("MegaQuery:");

    return new Response(JSON.stringify(data?.data?.createComment || data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Comment creation error:", error);
    return new Response(
      JSON.stringify({ error: "评论服务异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
