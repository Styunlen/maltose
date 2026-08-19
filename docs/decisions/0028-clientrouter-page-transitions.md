# ADR-0028: ClientRouter 页面平滑过渡（SPA 导航）

## 状态

已接受

## 日期

2026-08-19

## 背景

博客是 Astro 7 + React 19 islands + WordPress headless 架构。需要平滑、动画化的页面切换体验（SPA 式导航）。候选方案：Astro 原生 `<ClientRouter />`（View Transitions）与第三方 swup（`@swup/astro`）。用户要求附带平滑滚动、进度条功能，并征询其他推荐功能。

**代码库现状**（调研确认）：
- 全站 8 个页面路由 + catch-all + `/api/*`，除 friends.astro 外全部走 MainLayout → LayoutShell（`client:load` 单岛）。
- 导航全部是原生 `<a href>`（无 React Router）——拦截零障碍。
- 全局 `scroll-behavior: smooth`（tailwind.css）无条件启用，会与 ClientRouter 滚动恢复冲突。
- 无任何进度条 / back-to-top / scroll restoration 设施。
- 风险点：`HoverPreviewProvider` 与 `tooltip` 用 capture 监听 scroll（过渡中会误关悬浮卡）；`StickyCarousel` 内联脚本导航后不重跑；`useToc([])`/`ArticleComments([])` 一次性读取 DOM 会陈旧；页面内嵌 `<main>` 造成嵌套。

## 决策

### 1. 采用 Astro 原生 `<ClientRouter />`，弃用 swup

- `MainLayout.astro` 的 `<head>` 加入 `<ClientRouter fallback="swap" />`（老浏览器降级为无动画 SPA，而非整页刷新）。
- 理由：
  - **架构同构**：全站内容在 LayoutShell 单岛内，ClientRouter 的 body swap + island 重新水合正好让每次导航拿到新 pathname（SidebarRight 陈旧状态被默认行为修复）；swup 只换 `<main>` 容器，LayoutShell 不重挂载，陈旧问题需手工补丁。
  - **零依赖**：swup 需引入第三方 + 模拟层（`@swup/astro` 内部靠派发 `astro:before-swap/after-swap/page-load` 模拟 Astro 生命周期）。
  - swup 的卖点（smoothScrolling/progress/preload 开箱即用）在 ClientRouter 生态里都有对等实现，且 ClientRouter 无内置进度条/平滑滚动——本 ADR 自建。
- 对比结论：Fuwari 主题用 swup 是「静态 Svelte 博客 × swup 生态 × 时代背景（Astro 5 前 ClientRouter 未成熟）」的合理选择；本项目是 React 岛屿架构，ClientRouter 才是同构方案。

### 2. 平滑滚动：按需启用 + 生命周期驱动

- `tailwind.css`：全局 `html { scroll-behavior: smooth }` 改为 `html.smooth-scroll` 选择器 + `@media (prefers-reduced-motion: no-preference)` 守卫。
- `MainLayout.astro` 脚本：`astro:before-preparation` 给 `<html>` 加 `.smooth-scroll`，`astro:page-load` 后 500ms 移除——导航滚顶平滑、普通程序化滚动保持瞬时、reduced-motion 无动画。

### 3. 双进度条（自建，ClientRouter 无内置）

- **导航进度条** `NavigationProgress.tsx`：`z-[90]` 顶部 2px 细条，`astro:before-preparation` 显示并动画 0→90%（1.2s easeOut），`astro:before-swap` 加速至 95%，`astro:page-load` 跳 100% 后淡出。`activeRef` 防首屏闪烁；`useReducedMotion` 尊重。
- **阅读进度条** `ScrollProgress.tsx`：`z-[80]`，motion `useScroll` + `useSpring` 驱动 `scaleX`，scrollY > 200 时显隐；reduced-motion 降级为直连 scrollYProgress。
- 视觉复用 `ProgressBars.tsx` 规范：`var(--primary)` 填充 + `color-mix` 发光。
- 挂载于 LayoutShell 顶层 fragment（在 AuthProvider 之外，随 persist 或重挂载都稳定）。

### 4. 跨页状态保留：组件内 storage，而非 transition:persist

- **否决 `transition:persist` 于 LayoutShell**：实测证实 persist island 保留旧 DOM（含 children slot），新页面 body 内容不更新——URL/title 变了但正文仍显示旧页面。persist 只适合不包 children 的独立元素。
- **看板娘位置**：`Live2DAvatar` 将 offset 持久化到 `sessionStorage`（key `maltose:avatar-offset`）。SSR 恒 0,0（避免 hydration mismatch）+ 挂载后 effect 恢复 + persist effect 跳过首次执行（防 0,0 覆盖 storage）。
- **登录态/侧栏开关**：已有 cookie 机制（AuthProvider `/api/auth/me` + SidebarProvider cookie），导航重挂载后天然恢复，无需额外处理。

### 5. 附带增强（用户征询的推荐功能）

- **prefetch**：`astro.config` 开 `prefetch: { prefetchAll: true, defaultStrategy: "hover" }`——悬停即预取，导航近零延迟。
- **分页历史**：`Pagination.astro` 链接加 `data-astro-history="replace"`，翻页不堆积历史记录。
- **back-to-top**：`BackToTop.tsx`，`z-[70]`，滚动超 400px 浮现，平滑回顶，`lg:bottom-52` 避开右下角看板娘（h-44 ≈196px）。
- **StickyCarousel 重跑**：内联脚本加 `data-astro-rerun`，导航回首页时轮播重新初始化。

### 6. 陈旧状态修复（ClientRouter 引入后必须）

- `useToc` 与 `ArticleComments` 的 effect 依赖 `[]` → 改为依赖 `pathname`：ClientRouter 全 body 替换后，旧 article 元素被移除、MutationObserver 静默失效；依赖 pathname 使导航后重建 TOC / 重读评论数据。
- `LazyLoad` 的 MutationObserver 从观察 `document.body` 改为 `document.documentElement`（body 会被 swap 替换，观察器随旧 body 失效）；`astro:page-load` 时 `instance.update()`。
- 嵌套 `<main>` 清理：index/timeline 归档/评论/错误态/friends 的 6 处内层 `<main>` → `<div>`，全站唯一 `<main>`（LayoutShell 的 SidebarInset）。

## 影响

- 新增文件：`src/components/NavigationProgress.tsx`、`src/components/ScrollProgress.tsx`、`src/components/BackToTop.tsx`。
- 修改文件：`MainLayout.astro`（ClientRouter + 平滑滚动 + LazyLoad 观察目标）、`LayoutShell.tsx`（挂载三个新组件）、`Live2DAvatar.tsx`（offset 持久化）、`SidebarRight.tsx`（useToc/ArticleComments 依赖 pathname）、`Pagination.astro`、`StickyCarousel.astro`、`astro.config.mjs`（prefetch）、`friends.astro`（补 MainLayout）、`tailwind.css`（smooth-scroll 按需）、6 个页面（嵌套 main 清理）。
- 依赖：无新增。
- 验证：Playwright 全链路（SPA 导航事件序列、看板娘位置跨页保持、TOC/评论重建、双进度条显隐、back-to-top、friends SPA 导航、历史返回、hydration 0 错误）+ 29 单测 + 构建通过。

## 备选方案

- **swup / @swup/astro**：见「决策 1」——岛屿架构错配 + 模拟层风险。
- **transition:persist 保持 LayoutShell state**：实测 children 冻结，正文不更新，否决。
- **全局 `scroll-behavior: smooth` 保留**：与 ClientRouter 滚动恢复打架（恢复变动画化、位置抖动），改为按需启用。

## 参考文献

- Astro 官方文档：View Transitions / ClientRouter（`astro:transitions`）、transition directives、数据属性（`data-astro-reload`/`data-astro-history`/`data-astro-rerun`）、prefetch。
- `@swup/astro` 源码（`src/script.ts`）：生命周期事件模拟机制。
- Fuwari 主题（saicaca/fuwari）：swup 配置参考（`theme: false, containers: ["main", "#toc"]`）。
