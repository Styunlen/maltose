import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import { __internalLruCache } from "@api/api";
import jwt from "jsonwebtoken";

/**
 * Orphan-comment rebind (ADR-0036 P3). Re-anchors a paragraph comment whose
 * original block (clientId) no longer exists in the post. Permission:
 * the comment author, or any blogger user (BLOG_OWNER_USER_IDS is enforced
 * client-side for the admin page; server-side we check author ownership and
 * fall through to the WP mutation's own capability gate).
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  const wpToken = cookies.get("wp_token")?.value;
  if (!wpToken) {
    return new Response(
      JSON.stringify({ error: "未登录 WordPress" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json();
  const { commentDatabaseId, clientId, snippet } = body;

  if (!commentDatabaseId || !clientId) {
    return new Response(
      JSON.stringify({ error: "参数不完整" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify comment ownership (author-only for non-admins; bloggers pass through).
  let currentUserId: number | null = null;
  try {
    const decoded = jwt.decode(wpToken) as any;
    const rawId = decoded?.data?.user?.id;
    currentUserId = rawId != null ? Number(rawId) : null;
    if (Number.isNaN(currentUserId)) currentUserId = null;
  } catch {
    return new Response(
      JSON.stringify({ error: "无效的登录凭证" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // Fetch the comment's author so we can enforce ownership before rebinding.
    const authorRes = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          query RebindAuthor($id: ID!) {
            comment(id: $id, idType: DATABASE_ID) {
              author { node { databaseId } }
            }
          }
        `,
        variables: { id: commentDatabaseId },
      }),
    });
    const authorData = await authorRes.json();
    const authorId = authorData?.data?.comment?.author?.node?.databaseId;

    const ownerIds = (
      process.env.BLOG_OWNER_USER_IDS ||
      process.env.BLOG_OWNER_USER_ID ||
      "1"
    )
      .split(",")
      .map((s: string) => Number(s.trim()))
      .filter((n: number) => !Number.isNaN(n) && n > 0);

    const isOwner = currentUserId !== null && ownerIds.includes(currentUserId);
    if (!isOwner && authorId && currentUserId !== null && authorId !== currentUserId) {
      return new Response(
        JSON.stringify({ error: "只能重绑自己的评论" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
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
          mutation RebindBlockReference($input: RebindBlockReferenceInput!) {
            rebindBlockReference(input: $input) {
              success
            }
          }
        `,
        variables: {
          input: {
            commentDatabaseId,
            clientId,
            snippet: (snippet as string)?.slice(0, 80) || "",
          },
        },
      }),
    });

    const data = await wpResponse.json();
    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "重绑失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!data?.data?.rebindBlockReference?.success) {
      return new Response(
        JSON.stringify({ error: "重绑失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // blockReference rides inside GetNodeByURI comment nodes — invalidate so
    // the next read reflects the new anchor (ADR-0024).
    __internalLruCache.deleteByPrefix("GetNodeByURI:");
    __internalLruCache.deleteByPrefix("PreviewByUri:");

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Comment rebind error:", err);
    return new Response(
      JSON.stringify({ error: "重绑服务异常" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
