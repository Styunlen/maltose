import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { sanitizeMarkdownSource } from "@lib/markdown";
import { __internalLruCache } from "@api/api";

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const wpToken = cookies.get("wp_token")?.value;
    if (!wpToken) {
      return new Response(
        JSON.stringify({ error: "尚未登录 WordPress" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const { commentId, content } = body;

    if (!commentId || !content?.trim()) {
      return new Response(
        JSON.stringify({ error: "参数不完整" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const sanitized = sanitizeMarkdownSource(content.trim());

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          mutation UpdateComment($input: UpdateCommentInput!) {
            updateComment(input: $input) {
              success
              comment {
                id
                databaseId
                content
                date
              }
            }
          }
        `,
        variables: {
          input: {
            id: commentId,
            content: sanitized,
          },
        },
      }),
    });

    const data = await wpResponse.json();

    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "编辑失败", details: data.errors }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Edited content is embedded in GetNodeByURI responses — invalidate.
    __internalLruCache.deleteByPrefix("GetNodeByURI:");
    __internalLruCache.deleteByPrefix("PreviewByUri:");
    __internalLruCache.deleteByPrefix("TimelineStats:");
    __internalLruCache.deleteByPrefix("HomePosts:");
    __internalLruCache.deleteByPrefix("MegaQuery:");

    return new Response(JSON.stringify(data?.data?.updateComment || data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Comment update error:", error);
    return new Response(
      JSON.stringify({ error: "编辑异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
