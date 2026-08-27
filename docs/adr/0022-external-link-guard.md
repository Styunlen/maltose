# ADR-0022: 全站站外链接安全弹窗

## 状态

已接受

## 日期

2026-08-13

## 背景

博客存在多处站外链接（文章 markdown 链接、评论内容、SiteFooter 友链、FriendCard），用户点击时直接跳转，无任何安全提示。需开发**全站链接跳转前安全弹窗**——点击站外链接先弹确认，用户确认后才跳转。

## 需求

- 点击**站外链接**（域名非本站）时弹安全提示，确认后才跳转。
- 站内链接（本站文章/分类/首页）直接跳转，不弹窗。
- 弹窗显示**完整 URL** + 安全提示 + 确认/取消。
- **全局覆盖**所有站外链接（含动态渲染的 markdown/评论链接）。
- 确认后**统一新标签打开**。

## 决策

### 1. 全局事件委托

新建客户端组件 `ExternalLinkGuard`（挂在 LayoutShell 或 MainLayout）：

```tsx
// document 级 click 委托，捕获所有站外 <a>
useEffect(() => {
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest?.("a[href]");
    if (!a) return;
    const href = a.getAttribute("href") || "";
    if (!isExternal(href)) return;  // 站内/非 http 不拦截
    e.preventDefault();
    setPendingUrl(href);
  };
  document.addEventListener("click", onClick);
  return () => document.removeEventListener("click", onClick);
}, []);
```

- `closest("a[href]")` 从点击目标向上找链接——覆盖嵌套元素点击。
- 覆盖动态渲染的链接（markdown `dangerouslySetInnerHTML`、评论内容）。
- `e.preventDefault()` 阻止默认跳转，弹窗确认后手动跳转。

### 2. 站外判断

```ts
function isExternal(href: string): boolean {
  // 非 http(s)（mailto/tel/#/javascript）不拦截
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    const url = new URL(href);
    return url.hostname !== window.location.hostname;
  } catch {
    return false;
  }
}
```

- **域名比较**：`url.hostname !== window.location.hostname`——站外（含子域名、不同端口）。
- **非 http 不拦截**：mailto/tel/#/javascript 直接放行。
- `new URL` 解析失败（相对路径等）→ 站内，放行。

### 3. 弹窗（复用 ConfirmDialog）

```tsx
<ConfirmDialog
  open={pendingUrl !== null}
  onOpenChange={(o) => !o && setPendingUrl(null)}
  title="即将离开本站"
  description={`您即将访问外部网站：${pendingUrl}。请注意信息安全。`}
  confirmLabel="继续访问"
  cancelLabel="取消"
  onConfirm={() => {
    if (pendingUrl) window.open(pendingUrl, "_blank", "noopener,noreferrer");
    setPendingUrl(null);
  }}
/>
```

- 复用现有 `ConfirmDialog`（AlertDialog 版）。
- 确认后 `window.open(url, "_blank")` **统一新标签**打开（`noopener` 安全）。

### 4. 挂载位置

`ExternalLinkGuard` 挂载在 `LayoutShell`（全站布局，所有页面生效）——全局单实例，不重复弹窗。

## 数据流

```
点击站外链接
  → document click 委托捕获 <a href="外部URL">
  → isExternal 判断 → 站外
  → preventDefault + 弹窗（显示 URL + 安全提示）
  → 确认 → window.open(url, "_blank") 新标签
  → 取消 → 关闭弹窗，不跳转
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 逐组件绑定 onClick | SiteFooter/文章逐个加 | 动态链接（markdown）难覆盖 |
| 新建专用弹窗组件 | 定制样式 | ConfirmDialog 已满足，复用更简 |
| 全部 http 拦截 | 含 mailto 也弹 | 非 http 链接无需安全提示 |

## 影响

### 前端
- 新增 `src/components/ExternalLinkGuard.tsx`。
- `LayoutShell.tsx` 挂载 ExternalLinkGuard。
- 复用现有 `ConfirmDialog`。

### 风险与注意
- **弹窗内链接**：ConfirmDialog 内容不含链接，无递归拦截风险。
- **修饰键点击**（Ctrl/Cmd+点击新标签）：`preventDefault` 阻止——应尊重修饰键（可检测 `e.metaKey/ctrlKey` 跳过或同样拦截）。
- **站内新窗口链接**：`target="_blank"` 的站内链接（如友链站内页）——按域名判断站内放行。

## 参考文献

- 现有 `ConfirmDialog`（AlertDialog 版）：`src/components/ConfirmDialog.tsx`
- 站外链接分布：SiteFooter、FriendCard、markdown 渲染
- shadcn AlertDialog 文档（radix-ui）
