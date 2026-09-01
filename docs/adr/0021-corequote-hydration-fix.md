# ADR-0021: 修复 CoreQuote 无效 HTML 嵌套导致的 hydration 高度跳变

## 状态

已接受

## 日期

2026-08-13

## 背景

用户报告 UI bug：文章页 `CoreQuote`（内容"热爱终将会将我们导向我们所向往的生活！"）的高度在**页面刚渲染出来时较高，一会儿后变低**。

### 排查

Playwright 环境无法复现（高度稳定 48.75px），但用户真实浏览器可复现。检查实际 DOM 结构发现：

```
descHtml: "<p><p>热爱终将会将我们导向我们所向往的生活！</p></p>"
```

**无效 HTML 嵌套**：CoreQuote 代码用 `<p dangerouslySetInnerHTML={{ __html: value }} />` 渲染，而 WP 返回的 `value` 本身就是 `<p>热爱...</p>` → 生成 `<p><p>...</p></p>`。

### 机制

- **SSR** 输出无效嵌套 `<p><p>`（React 不校验 HTML 合法性）。
- **浏览器解析**时自动修正无效 HTML（拆分 p 为兄弟元素）。
- **hydration** 时 React 发现 SSR DOM 与浏览器修正后的 DOM 不匹配 → **重新渲染该 subtree** → 高度跳变（"刚渲染高，一会儿变低"）。
- 之前 console 的 hydration 错误（CoreQuote `__html` mismatch）佐证此机制。

## 需求

- 消除 CoreQuote 的无效 HTML 嵌套。
- 使 SSR 与浏览器解析的 DOM 一致，避免 hydration 重渲染和高度跳变。

## 决策

### CoreQuote 改用 `<div>` 包裹

`src/components/wp-blocks/CoreQuote.tsx`：外层 `<p dangerouslySetInnerHTML>` 改为 `<div dangerouslySetInnerHTML>`：

```tsx
<AlertDescription className="text-foreground/90 italic">
  <div dangerouslySetInnerHTML={{ __html: value }} />
  {citation && <cite ... />}
</AlertDescription>
```

- `value` 是 `<p>...</p>`，`<div>` 可合法包裹任意块级元素。
- 修复后 DOM：`<div><p>热爱...</p></div>`（合法）。
- `children` 分支（有 innerBlocks 时）无 `<p>` 包裹，不受影响。

## 数据流

```
修复前: <p dangerouslySetInnerHTML="{{ __html: '<p>热爱...</p>' }}"> → <p><p>...</p></p> 无效
修复后: <div dangerouslySetInnerHTML="{{ __html: '<p>热爱...</p>' }}"> → <div><p>...</p></div> 合法
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 去掉外层标签直接渲染 | `<dangerouslySetInnerHTML>` 需宿主元素 | 无宿主元素无法用 dangerouslySetInnerHTML |
| 保留 p 但 sanitize value | 剥离 value 的 p 标签 | 改变内容结构，div 更简单直接 |

## 影响

### 前端
- `src/components/wp-blocks/CoreQuote.tsx`：`<p>` → `<div>` 包裹 value。

### 风险与注意
- 需确认 `value` 内容是否可能含非 p 元素（如多段），div 包裹可容纳任意块级元素，安全。
- 全局检查其他 wp-blocks 是否也有 `<p>` 包 dangerouslySetInnerHTML——已确认无（CoreParagraph 直接渲染）。

## 参考文献

- 无效 HTML `<p><p>` 嵌套：浏览器自动拆分，破坏 SSR/client 一致性
- React hydration mismatch: https://react.dev/link/hydration-mismatch
- `src/components/wp-blocks/CoreQuote.tsx`

## 修订（2026-08-13）：修复其余 3 个 hydration mismatch

Playwright 捕获到 3 个额外的 hydration mismatch，逐一修复：

### 1. AuthProvider SSR 预填充（NavUser 骨架 vs 登录/用户）

**根因**：`AuthProvider` 初始 `{ user: null, loading: true }`。SSR 渲染 NavUser 显示 **loading 骨架**（Skeleton），client hydration 后 loading=false 立即切换为**登录按钮或用户信息**——结构不同（Skeleton div vs 按钮）→ mismatch。

**修复**：`AuthProvider` 接受 `initialUser` prop，SSR 预填充（`{ user: initialUser, loading: false }`），使 SSR 与 client 首次渲染一致。MainLayout 传 `Astro.locals.user` → LayoutShell → AuthProvider。

### 2. CoreParagraph `<p><p>` 无效嵌套

**根因**：WP 返回的 paragraph `content` 有时含 `<p>` 包装（如空段落 `"\n<p class='wp-block-paragraph'></p>\n"`），被外层 `<p dangerouslySetInnerHTML>` 包裹 → `<p><p>` 无效嵌套 → 浏览器拆分 → mismatch。

**修复**：CoreParagraph 检测 `content` 是否以 `<p>` 开头（`wrappedInP`），若是则用 `<div>` 包裹渲染（与 ADR-0021 CoreQuote 同方案）。

### 3. SidebarRight getPageType SSR 回退（SidebarSkeleton vs ArticleSidebar）

**根因**：`getPageType()` 依赖 `window.location.pathname`，SSR 时 window undefined → 返回 `""` → 渲染 **SidebarSkeleton**（`<div class="flex items-center gap-2 px-2">`），client 返回 `"article"` → 渲染 **ArticleSidebar**（`<ul data-slot="sidebar-menu">`）→ `div` vs `ul` mismatch。

**修复**：`getPageType(pathname?)` 接受 SSR 传入的 pathname（MainLayout 传 `Astro.url.pathname` → LayoutShell → SidebarRight），SSR 与 client 计算一致，消除 Skeleton 分支差异。

### 验证

Playwright 实测：文章页/首页/时间轴 **hydrationErrors = 0**（修复前每页 2 个）。
