// 悬浮预览卡配置接口：将主题「阅读增强」选项（经 RootQuery.maltoseSettings）
// 桥接给前端 HoverPreviewProvider。与 preview.ts 解耦，前端只在挂载时拉取一次。
import type { APIRoute } from "astro";
import { maltoseSettingsQuery } from "@api/api";

export const GET: APIRoute = async () => {
  try {
    const data = await maltoseSettingsQuery();
    const s = data?.maltoseSettings;
    return new Response(
      JSON.stringify({
        enabled: s?.previewEnabled !== false,
        delay: typeof s?.previewDelay === "number" ? s.previewDelay : 300,
        excerptLen:
          typeof s?.previewExcerptLen === "number" ? s.previewExcerptLen : 120,
        wpm: typeof s?.previewWpm === "number" ? s.previewWpm : 400,
        cacheTtl:
          typeof s?.previewCacheTtl === "number" ? s.previewCacheTtl : 300,
        recent: typeof s?.previewRecent === "number" ? s.previewRecent : 3,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Failed to load preview settings:", error);
    return new Response(
      JSON.stringify({ error: "预览设置加载失败" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
