import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";

export const POST: APIRoute = async ({ request, cookies }) => {
  const wpToken = cookies.get("wp_token")?.value;
  if (!wpToken) {
    return new Response(
      JSON.stringify({ error: "未登录 WordPress" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json();
  const { commentDatabaseId } = body;

  if (!commentDatabaseId) {
    return new Response(
      JSON.stringify({ error: "缺少评论 ID" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract current user's WP ID from token to verify comment ownership.
  // WPGraphQL JWT carries the user id as a string; normalize to a number so
  // it can be strictly compared against comment author databaseId.
  let currentUserId: number | null = null;
  try {
    const decoded = jwt.decode(wpToken) as any;
    const rawId = decoded?.data?.user?.id;
    currentUserId = rawId != null ? Number(rawId) : null;
    if (Number.isNaN(currentUserId)) {
      currentUserId = null;
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "无效的登录凭证" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          query GetCommentRaw($id: ID!) {
            comment(id: $id, idType: DATABASE_ID) {
              content(format: RAW)
              author {
                node {
                  databaseId
                }
              }
            }
          }
        `,
        variables: { id: commentDatabaseId },
      }),
    });

    const data = await wpResponse.json();

    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "获取失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const comment = data?.data?.comment;
    if (!comment) {
      return new Response(
        JSON.stringify({ error: "评论不存在" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Ownership check: only the comment author (or admin via WP capability) can read raw content
    const authorId = comment.author?.node?.databaseId;
    if (authorId && currentUserId !== null && authorId !== currentUserId) {
      return new Response(
        JSON.stringify({ error: "无权查看该评论的原始内容" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ content: comment.content || "" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Comment raw fetch error:", err);
    return new Response(
      JSON.stringify({ error: "获取失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
