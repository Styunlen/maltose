import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";

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
    const { commentId } = body;

    if (!commentId) {
      return new Response(
        JSON.stringify({ error: "缺少评论 ID" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          mutation DeleteComment($input: DeleteCommentInput!) {
            deleteComment(input: $input) {
              deletedId
            }
          }
        `,
        variables: {
          input: {
            id: commentId,
          },
        },
      }),
    });

    const data = await wpResponse.json();

    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "删除失败", details: data.errors }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(data?.data?.deleteComment || data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Comment delete error:", error);
    return new Response(
      JSON.stringify({ error: "删除异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
