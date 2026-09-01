# ADR-0009: 评论标题装饰条与表格斑马纹

## 状态

已接受

## 日期

2026-08-06

## 背景

ADR-0008 修复后，评论区仍有两个视觉问题：

### 问题 1：评论标题前出现文章标题装饰条，与 bubble 背景融合

- `wordpress.scss` 定义了 `article h1::before / h2::before / h3::before` 装饰条（绿色圆点/竖条，`background: var(--primary)`，8px 宽 + 12px 右距）。
- Single.astro 的 `<article>` 元素**包裹了评论区**（`#comments-section` 在 article 内）→ 评论内的 markdown 标题（h1-h3）也应用此装饰条。
- **用户自己评论**（`data-align="end"`，背景 `--primary` 亮绿）中，装饰条 `background: var(--primary)` 与绿底**完全融合**，不可见且突兀。
- 实证：`getComputedStyle(h1, '::before')` 返回 `background: rgb(0, 240, 160)`（primary 绿），与 bubble 背景相同。

### 问题 2：表格 header 有背景、body 透明，视觉不协调

- Cherry markdown CSS 的表格只有 `th` 背景（`background-color: var(--md-inline-code-bg)` = muted 灰），`td`（body 行）无背景。
- 实证：`th` 背景 `rgb(248, 249, 250)`（灰），`td` 背景 `rgba(0, 0, 0, 0)`（透明）。
- header 灰底 + body 透明 → 表格上下视觉割裂，阅读不适。

## 需求

- 评论区内标题**不显示**文章装饰条（避免与 bubble 背景融合；文章正文标题装饰条保留）。
- 评论表格 body 有**斑马纹**（交替行背景）+ 行 hover 效果，与 header 背景协调。

## 决策

### 1. 评论区禁用标题装饰条

`global.scss` 的 `#comments-section` 作用域内覆盖：

```scss
#comments-section {
  .cherry-markdown {
    h1::before,
    h2::before,
    h3::before {
      content: none;
    }
  }
}
```

- 只影响评论区内的 markdown 标题；文章正文标题（`.post-content` / `article` 作用域）装饰条保留。
- 评论标题回归纯文本样式（Cherry 的 h1-h3 排版，无装饰条）。

### 2. 评论表格斑马纹 + 行 hover

`#comments-section` 作用域内为 `.cherry-markdown` 表格添加：

```scss
.cherry-markdown {
  table {
    tbody tr:nth-child(even) {
      background-color: var(--muted);
    }
    tbody tr:hover {
      background-color: color-mix(in oklch, var(--primary) 8%, transparent);
    }
  }
}
```

- **偶数行**：`--muted`（淡灰），与 `th` 背景（`--md-inline-code-bg` = muted 系）协调。
- **奇数行**：透明（默认），形成交替斑马纹。
- **行 hover**：`color-mix(in oklch, var(--primary) 8%, transparent)` 淡绿高亮。
- 作用域限于评论区，不影响文章正文表格（`.wp-block-table` 有独立样式）。

### 3. 与既有规则协调

- 与 ADR-0007 的 `[data-align="end"]` 字体覆盖（`--primary-foreground`）不冲突：装饰条禁用后无颜色冲突；斑马纹的 muted/primary 淡色在绿底/灰底 bubble 上均协调。
- Cherry 表格的 `border-collapse: collapse` 保留，斑马纹基于 `tr` 背景（不破坏边框）。

## 数据流

```
评论标题（h1-h3 markdown）
  → #comments-section 内 h1::before { content: none } → 无装饰条
评论表格
  → tbody tr:nth-child(even) { background: var(--muted) } → 斑马纹
  → tbody tr:hover { background: primary 8% } → hover 高亮
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 改装饰条颜色 | 装饰条改 --primary-foreground | 评论标题带装饰条语义不符（装饰条是文章标题标记） |
| 全局禁用装饰条 | 所有 article 标题无装饰条 | 影响文章正文视觉 |
| 表格 body 统一浅灰 | 每行都灰底 | 无斑马纹层次，hover 无反馈 |
| 去掉 header 背景 | th 也透明 | 表头失去辨识度 |

## 影响

### 前端
- `src/styles/global.scss`：`#comments-section` 作用域新增两条规则（装饰条禁用 + 表格斑马纹/hover）。

### 风险与注意
- 斑马纹的 `--muted` 在暗色模式下为深灰，需确认与 bubble 背景（primary 绿 / secondary 灰）的协调性。
- `tr:hover` 的 `color-mix` 需浏览器支持（现代浏览器均支持）。
- 评论内表格可能嵌套在 blockquote/list 内，斑马纹选择器基于 `tbody tr`，不受嵌套影响。

## 参考文献

- ADR-0007（评论 markdown 渲染样式对齐 Cherry）：`docs/adr/0007-comment-markdown-style-alignment.md`
- ADR-0008（评论 bubble 背景与表格原文修复）：`docs/adr/0008-comment-bubble-bg-and-table-fix.md`
- `src/styles/wordpress.scss:62-88`（article 标题装饰条）
- Cherry markdown CSS 表格规则（`--md-inline-code-bg` 用于 th 背景）
