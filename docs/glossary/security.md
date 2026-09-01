# 术语表 (Glossary) — 安全

## 站外链接守卫（External Link Guard）

全站站外链接跳转前的安全弹窗组件（ADR-0022，`src/components/ExternalLinkGuard.tsx`）。通过 **document 级 click 事件委托**捕获所有站外 `<a>`（含动态渲染的 markdown/评论链接），`preventDefault` 后弹 `ConfirmDialog` 显示完整 URL + 安全提示，确认后 `window.open(url, "_blank")` 新标签打开。站外判断：`url.hostname !== window.location.hostname`；非 http（mailto/tel/#）不拦截。

## 事件委托（Event Delegation）

在父元素（如 document）统一监听事件，通过 `closest("a[href]")` 从点击目标向上查找链接的技术。优点：自动覆盖动态添加/渲染的元素（markdown `dangerouslySetInnerHTML`、异步加载内容），无需逐个绑定。
