import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { sanitizeMarkdownSource } from "@lib/markdown";
import { __internalLruCache } from "@api/api";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const wpToken = cookies.get("wp_token")?.value;
    if (!wpToken) {
      return new Response(
        JSON.stringify({ error: "尚未登录 WordPress，请重新登录" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const { postDatabaseId, content, parent } = body;

    if (!postDatabaseId || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "参数不完整" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Sanitize raw markdown before storage
    const sanitized = sanitizeMarkdownSource(content.trim());

    // Read the real browser UA from the incoming request instead of trusting
    // a client-supplied value. WordPress records this as the comment agent.
    const realUserAgent = request.headers.get("user-agent") || "";

    const fetchHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${wpToken}`,
    };
    if (realUserAgent) {
      fetchHeaders["User-Agent"] = realUserAgent;
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
    __internalLruCache.deleteByPrefix("GetNodeByURI:");

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
