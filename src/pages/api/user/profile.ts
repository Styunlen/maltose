import type { APIRoute } from "astro";
import { getProxyUrl } from "@lib/graphql-proxy";
import jwt from "jsonwebtoken";

/**
 * Update the current user's profile (display name / website / description)
 * on the WordPress user identified by the wp_token JWT (ADR-0030).
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const wpToken = cookies.get("wp_token")?.value;
    if (!wpToken) {
      return new Response(
        JSON.stringify({ error: "尚未登录，请先登录" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // Decode the WP JWT to get the user's WordPress database id.
    let wpUserId: string | null = null;
    try {
      const decoded = jwt.decode(wpToken) as any;
      wpUserId = decoded?.data?.user?.id ?? null;
    } catch {
      return new Response(
        JSON.stringify({ error: "登录状态无效，请重新登录" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!wpUserId) {
      return new Response(
        JSON.stringify({ error: "无法识别当前用户" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();
    const { displayName, websiteUrl, description, username } = body;

    if (!displayName?.trim()) {
      return new Response(
        JSON.stringify({ error: "显示名称不能为空" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const input: Record<string, any> = {
      id: wpUserId,
      displayName: displayName.trim(),
      websiteUrl: websiteUrl?.trim() || null,
      description: description?.trim() || null,
    };
    // username (user_login) 由 WP 侧 mu-plugin 校验唯一性并持久化（ADR）。
    if (username && username.trim()) {
      input.username = username.trim();
    }

    const wpResponse = await fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${wpToken}`,
      },
      body: JSON.stringify({
        query: `
          mutation UpdateProfile($input: UpdateUserInput!) {
            updateUser(input: $input) {
              user { databaseId name url description username }
            }
          }
        `,
        variables: { input },
      }),
    });

    const data = await wpResponse.json();
    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "保存失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, user: data?.data?.updateUser?.user }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[user/profile] error:", err);
    return new Response(
      JSON.stringify({ error: "保存异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

// Read the current WP user's profile for prefill (username + last login).
export const GET: APIRoute = async ({ cookies }) => {
  try {
    const wpToken = cookies.get("wp_token")?.value;
    if (!wpToken) {
      return new Response(
        JSON.stringify({ error: "尚未登录，请先登录" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
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
          query ViewerProfile {
            viewer {
              databaseId
              username
              name
              description
              url
              maltoseLastLogin
            }
          }
        `,
      }),
    });

    const data = await wpResponse.json();
    if (data?.errors) {
      return new Response(
        JSON.stringify({ error: data.errors[0]?.message || "读取失败" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, user: data?.data?.viewer }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[user/profile] GET error:", err);
    return new Response(
      JSON.stringify({ error: "读取异常，请稍后重试" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
