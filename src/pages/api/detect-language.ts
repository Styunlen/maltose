// src/pages/api/detect-language.ts
import type { APIRoute } from "astro";
import highlight from "highlight.js";

const MAX_CODE_LENGTH = 50000;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { code } = await request.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "代码不能为空" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (typeof code !== "string" || code.length > MAX_CODE_LENGTH) {
      return new Response(
        JSON.stringify({ error: "代码内容过长或格式错误" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Detect language server-side using highlight.js
    const language = highlight.highlightAuto(code.slice(0, MAX_CODE_LENGTH)).language || "未知语言";

    return new Response(
      JSON.stringify({
        language,
        success: true,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "检测失败" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
};
