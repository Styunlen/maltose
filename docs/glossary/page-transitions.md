# 术语表 (Glossary) — 页面过渡（ClientRouter）

## ClientRouter（Astro 客户端路由）

Astro 内置的客户端路由组件（`astro:transitions` 模块导出），将多页应用变成单页应用（SPA）：拦截 `<a>` 点击与浏览器前进/后退，`fetch` 新页面后平滑替换 DOM。全站启用方式：在共享布局的 `<head>` 放 `<ClientRouter fallback="swap" />`。对比 swup：ClientRouter 与 Astro 渲染/水合运行时深度集成（知道 astro-island 怎么水合/卸载），swup 是框架无关的 PJAX 库（ADR-0028 弃用 swup，理由见该 ADR）。

## 生命周期事件（Lifecycle Events）

ClientRouter 在导航过程中派发的 DOM 事件（`document` 上监听）：

- `astro:before-preparation` — 导航开始、请求发出前。可改 `direction`/`to`，可覆盖 `loader()`。
- `astro:after-preparation` — 新页面已加载完。
- `astro:before-swap` — DOM 交换前。有 `viewTransition` 与 `swap()`（可自定义 swap 函数）。
- `astro:after-swap` — 内容已交换、历史与滚动位置已更新。
- `astro:page-load` — 页面完全加载（含首屏）。

用途（ADR-0028）：`before-preparation` 触发导航进度条显示 + `<html>.smooth-scroll` 启用；`page-load` 进度条完成淡出 + 平滑滚动类移除 + LazyLoad 重扫。

## transition:persist（跨页持久化）

Astro 指令，标记元素/island 在导航时**保留旧实例**（含 React state），而非替换为新页面的对应元素。**已知陷阱（ADR-0028 实测）**：persist 一个包裹 children（slot 内容）的 island 时，旧 DOM 整体保留——新页面正文不会替换进来（URL/title 更新但内容冻结）。因此本项目否决将 persist 用于 LayoutShell，改由组件内部持久化（看板娘 offset → sessionStorage）。

## sessionStorage 位置恢复（Avatar Offset Persistence）

`Live2DAvatar` 把拖拽/游动后的 offset 存 `sessionStorage`（key `maltose:avatar-offset`）。SPA 导航组件重挂载时恢复位置（不跳动）；整页刷新 sessionStorage 清空，回到右下角默认位置。实现要点（防 hydration mismatch）：SSR 阶段恒 0,0，客户端挂载后 effect 恢复，persist effect 跳过首次执行（避免 0,0 覆盖已存值）。

## 平滑滚动按需启用（Opt-in Smooth Scroll）

全局 `scroll-behavior: smooth` 会与 ClientRouter 的滚动恢复冲突（恢复位置被动画化、抖动）。本项目改为 `html.smooth-scroll` 选择器 + `prefers-reduced-motion` 守卫：导航期间（before-preparation → page-load + 500ms）临时加类，普通程序化滚动保持瞬时。

## 数据属性（data-astro-*）

- `data-astro-reload` — 链接/表单强制整页刷新，绕过 ClientRouter（用于 `/api/auth/*` 等 302/OAuth 跳转）。
- `data-astro-history="auto|push|replace"` — 控制浏览器历史写入方式。分页链接用 `replace` 避免翻页堆积历史（ADR-0028）。
- `data-astro-rerun` — 脚本在每次导航后重新执行（Astro 打包模块脚本默认只跑一次）。StickyCarousel 轮播初始化靠它（ADR-0028）。
