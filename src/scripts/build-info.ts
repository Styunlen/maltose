// Build metadata banner: printed to the browser console on every page load.
// Values are injected at build time via Vite `define` (astro.config.mjs).
// 设计说明：控制台 %c 的 background 在多行拼接时各行宽度/高度独立，
// 必然产生错位割裂。因此本 banner 不用背景，纯文字颜色区分层次——
// 标题薄荷绿加粗、label 灰、value 亮白、链接薄荷绿。
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

function formatTime(iso: string): string {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

const commit = typeof __BUILD_COMMIT__ === "string" ? __BUILD_COMMIT__ : "unknown";
const commitShort = commit.slice(0, 7);
const time = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

// 纯颜色样式：无 background，无 padding，行间不会错位。
const TITLE = "color:#00f0a0;font-size:15px;font-weight:800;letter-spacing:0.5px";
const RULE = "color:#30363d";
const LABEL = "color:#c9d1d9;font-size:12px;font-weight:600";
const VALUE = "color:#00f0a0;font-size:12px;font-weight:800";
const LINK = "color:#00f0a0;font-size:12px;font-weight:700;text-decoration:underline";

// 对齐：控制台等宽字体下用空格补齐 label 列。
const buildLine = time
  ? `%c⏱ build      %c${formatTime(time)}`
  : `%c⏱ build      %cunknown`;
const commitLine =
  commit !== "unknown"
    ? `%c📦 commit    %c${commitShort}`
    : `%c📦 commit    %cunknown`;

const commitUrl = `https://github.com/Styunlen/maltose/commit/${commit}`;

console.info(
  [
    "%c🍬 Maltose",
    "%c────────────────────────────",
    buildLine,
    commitLine,
  ].join("\n"),
  TITLE,
  RULE,
  LABEL,
  VALUE,
  LABEL,
  VALUE,
);
// 链接单独一行、完整 https:// URL、无前缀字符——Chrome/Firefox 控制台
// 会把独立成行的纯 URL 自动渲染为可点击链接。
if (commit !== "unknown") {
  console.info(`%c${commitUrl}`, LINK);
}
