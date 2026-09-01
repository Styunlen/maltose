# 术语表 (Glossary) — 前端水合

## Hydration Mismatch（水合不匹配）

SSR 渲染的服务端 HTML 与客户端 React 重新渲染的 DOM 不一致时的状态。React 检测到不匹配会**丢弃 SSR 的 DOM 并重新渲染**该 subtree，导致布局跳变（如元素高度变化）、闪烁、交互异常。

## 无效 HTML 嵌套（Invalid HTML Nesting）

不符合 HTML 规范的标签嵌套，如 `<p><p>...</p></p>`（p 内嵌 p）。浏览器解析时会**自动修正**（拆分/提升元素），导致解析后的 DOM 与 SSR 原始输出不一致——这是 hydration mismatch 的常见根因（ADR-0021 案例：CoreQuote 用 `<p dangerouslySetInnerHTML>` 包裹本身是 `<p>` 的 value）。

## CoreQuote（引用块组件）

渲染 WordPress `core/quote` 块的组件（`src/components/wp-blocks/CoreQuote.tsx`），用 shadcn `Alert` + `AlertDescription`。ADR-0021 修复：`value`（WP 返回的 `<p>...</p>`）改用 `<div>` 包裹而非 `<p>`，消除无效嵌套与 hydration 高度跳变。

## SSR 预填充（SSR Prefill）

向 client island 传入 SSR 侧数据作为初始 props，使客户端首次渲染与服务端 HTML 一致，避免 hydration mismatch（ADR-0021 修订）。案例：`AuthProvider` 接收 `initialUser`（来自 `Astro.locals.user`）、`SidebarRight` 接收 `pathname`（来自 `Astro.url.pathname`）——消除 loading 骨架/页面类型分支的 SSR-client 差异。

## wrappedInP 检测（Paragraph Wrap Detection）

CoreParagraph 判断 WP 返回的 `content` 是否已含 `<p>` 包装（`/^\s*<p[\s>]/i`）。若含则改用 `<div>` 渲染，避免外层 `<p>` 造成 `<p><p>` 无效嵌套（ADR-0021 修订）。

