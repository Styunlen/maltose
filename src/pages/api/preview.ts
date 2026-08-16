// 内链悬浮预览卡数据接口（ADR-0025）。
// 只接受本站链接（相对路径或与 APP_URL/SITE 同源的完整 URL），经现有
// ApolloClient + LruLink 缓存（TTL 300s）复用 nodeByUri 查询；字数、阅读时长、
// 摘要均在服务端计算。不会变成任意 URL 的探测器。
import type { APIRoute } from "astro";
import { previewByUriQuery, maltoseSettingsQuery } from "@api/api";

const APP_URL = import.meta.env.APP_URL;
const SITE = import.meta.env.SITE;

// 与 APP_URL / SITE 同源的 origin 列表，用于校验完整 URL 是否本站链接。
function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  for (const raw of [APP_URL, SITE]) {
    if (!raw) continue;
    try {
      origins.push(new URL(raw).origin);
    } catch {
      // 忽略无效的 env 值
    }
  }
  return origins;
}

// 将 uri / url 入参规整为 nodeByUri 可用的站内路径，非同源则返回 null。
function toSameSiteUri(raw: string): string | null {
  if (!raw) return null;
  // 相对路径直接用；排除 // 协议相对写法，避免被浏览器解析为外部 URL。
  if (raw.startsWith("/")) {
    if (raw.startsWith("//")) return null;
    return raw;
  }
  try {
    const url = new URL(raw);
    if (!getAllowedOrigins().includes(url.origin)) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

// ── 服务端文本计算 ──────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&hellip;/gi, "…")
    .replace(/\s+/g, " ")
    .trim();
}

// 中文字符逐字计数，拉丁/数字按空格分词计数（纯标点符号不计）。
function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0;
  const latin = text
    .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
  return cjk + latin;
}

// 优先用 WP excerpt，为空时从正文截取，长度按配置截断。
function makeExcerpt(
  excerptHtml: string | null | undefined,
  contentHtml: string | null | undefined,
  maxLen: number,
): string {
  const text = stripHtml(excerptHtml || contentHtml || "");
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  try {
    const rawUri = url.searchParams.get("uri") || url.searchParams.get("url") || "";
    const uri = toSameSiteUri(rawUri);
    if (!uri) {
      return json({ error: "仅支持本站内部链接" }, 400);
    }

    // 读取「阅读增强」配置，失败时回退默认值，保证接口仍可用。
    let enabled = true;
    let wpm = 400;
    let excerptLen = 120;
    let recent = 3;
    try {
      const s = await maltoseSettingsQuery();
      const m = s?.maltoseSettings;
      if (m) {
        enabled = m.previewEnabled !== false;
        if (Number(m.previewWpm) > 0) wpm = Number(m.previewWpm);
        if (Number(m.previewExcerptLen) > 0) excerptLen = Number(m.previewExcerptLen);
        if (Number(m.previewRecent) >= 0) recent = Number(m.previewRecent);
      }
    } catch (err) {
      console.warn("[preview] maltoseSettings 不可用，使用默认配置:", err);
    }

    if (!enabled) {
      return json({ error: "预览功能未开启" }, 403);
    }

    const data = await previewByUriQuery(uri, recent, recent > 0);
    const node = data?.nodeByUri;
    if (!node) {
      return json({ error: "内容不存在" }, 404);
    }

    switch (node.__typename) {
      case "Post":
      case "Page": {
        const content = node.content || "";
        const wordCount = countWords(stripHtml(content));
        const readingTime = Math.max(1, Math.ceil(wordCount / wpm));
        return json({
          type: node.__typename === "Post" ? "post" : "page",
          uri: node.uri || uri,
          title: node.title,
          excerpt: makeExcerpt(node.excerpt, content, excerptLen),
          date: node.date,
          commentCount: node.commentCount ?? 0,
          wordCount,
          readingTime,
          thumbnail: node.featuredImage?.node?.sourceUrl || null,
          viewCount: node.viewCount ?? 0,
        });
      }
      case "Category":
      case "Tag":
        return json({
          type: "term",
          uri: node.uri || uri,
          name: node.name,
          taxonomyName:
            node.taxonomyName ||
            (node.__typename === "Category" ? "category" : "post_tag"),
          description: stripHtml(node.description) || "",
          count: node.count ?? 0,
          recentPosts: (node.posts?.nodes ?? []).map((p: any) => ({
            title: p.title,
            uri: p.uri,
            date: p.date,
          })),
        });
      default:
        return json({ error: "不支持的内容类型" }, 400);
    }
  } catch (error) {
    console.error("[preview] error:", error);
    return json({ error: "预览服务异常，请稍后重试" }, 500);
  }
};
