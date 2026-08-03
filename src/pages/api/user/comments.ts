import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { renderCommentMd } from "@lib/markdown";

export const GET: APIRoute = async ({ cookies, url }) => {
  const wpToken = cookies.get("wp_token")?.value;
  if (!wpToken) {
    return new Response(
      JSON.stringify({ error: "尚未登录 WordPress" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // Query params for filtering
  const search = url.searchParams.get("search") || "";
  const dateFrom = url.searchParams.get("dateFrom") || "";
  const dateTo = url.searchParams.get("dateTo") || "";
  const after = url.searchParams.get("after") || "";

  // Build WPGraphQL where args
  const where: Record<string, any> = { order: "DESC", orderby: "COMMENT_DATE" };
  if (search) where.search = search;

  try {
    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          query ViewerComments($first: Int!, $after: String, $where: UserToCommentConnectionWhereArgs) {
            viewer {
              databaseId
              name
              email
              comments(first: $first, after: $after, where: $where) {
                pageInfo {
                  hasNextPage
                  endCursor
                }
                nodes {
                  id
                  databaseId
                  content
                  date
                  status
                  commentedOn {
                    node {
                      ... on Post {
                        databaseId
                        title
                        uri
                      }
                      ... on Page {
                        databaseId
                        title
                        uri
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: {
          first: 100,
          after: after || null,
          where,
        },
      }),
    });

    const data = await wpResponse.json();

    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "获取失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const viewer = data?.data?.viewer;
    if (!viewer) {
      return new Response(
        JSON.stringify({ error: "未找到用户信息" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Client-side date filtering (WPGraphQL doesn't support date range on comments)
    let comments = (viewer.comments?.nodes || []).map((c: any) => ({
      ...c,
      content: renderCommentMd(c.content || ""),
    }));
    const pageInfo = viewer.comments?.pageInfo || {};

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      comments = comments.filter((c: any) => new Date(c.date).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 86400000;
      comments = comments.filter((c: any) => new Date(c.date).getTime() <= to);
    }

    return new Response(
      JSON.stringify({
        user: {
          id: viewer.databaseId,
          name: viewer.name,
          email: viewer.email,
        },
        comments,
        hasNextPage: pageInfo.hasNextPage || false,
        endCursor: pageInfo.endCursor || null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("User comments fetch error:", error);
    return new Response(
      JSON.stringify({ error: "获取评论列表失败" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
