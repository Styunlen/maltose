# ADR-0007: 评论 markdown 渲染样式对齐 Cherry 编辑器

## 状态

已接受

## 日期

2026-08-05

## 背景

评论区存在两个样式问题：

### 问题 1：markdown 渲染样式与编辑器不一致 + 表格无法正常显示

- 评论编辑器（Cherry Markdown）用自带 `cherry-markdown.markdown.css`（283KB，含 h1-h6、table、ul/ol、code、pre、blockquote 等完整排版，全部 `scoped` 在 `.cherry-markdown` 类下，166 处规则）。
- 评论渲染容器 `.chat-content`（`global.scss`）**只有 `p` 和 `a` 两条规则**，缺 h1-h6、table、ul/ol、code、pre、blockquote 的所有样式。
- 表格 HTML 会渲染（`src/lib/markdown.ts` 的 sanitize 白名单含 `table/thead/tbody/tr/th/td`），但**无任何 CSS** → 无边框、无宽度、无表头背景，呈现为无结构的文本 → "表格无法正常显示"。

### 问题 2：自己评论 primary 背景上的字体颜色冲突

- 自己发的评论（`data-align="end"`）气泡背景为 `--primary`（亮绿 `#00f0a0`）。
- 链接已用 `--primary-foreground`（深黑 `--base-color-blackbtn`）修复（见 global.scss `[data-align="end"] [data-slot="bubble-content"] a`）。
- 但 h1-h6 标题、blockquote、code、strong 等元素无专门处理；引入 Cherry markdown CSS 后这些元素将使用 Cherry 的**硬编码深色文字**（不依赖 `--primary`/`--foreground` 等 CSS 变量），可能与亮绿背景对比不足。

## 需求

- 评论 markdown 渲染样式与 Cherry 编辑器预览**完全一致**（所见即所得）。
- 评论表格完整显示（边框、表头背景、斑马纹等，与编辑器预览一致）。
- 自己评论（`data-align="end"`）内所有文字元素在 primary 亮绿背景上对比度足够。

## 决策

### 1. 复用 Cherry markdown CSS

`global.scss` 引入 `cherry-markdown/dist/cherry-markdown.markdown.css`：

```scss
@import url("cherry-markdown/dist/cherry-markdown.markdown.css");
```

（或通过 Vite `~` 别名 / 相对路径引入 `node_modules/cherry-markdown/dist/cherry-markdown.markdown.min.css`，134KB min 版。）

评论内容容器（`.chat-content`，即 `[data-slot="bubble-content"]`）增加 `.cherry-markdown` 类：

```tsx
<BubbleContent className="chat-content cherry-markdown">
```

- Cherry markdown CSS 全部 `scoped` 到 `.cherry-markdown`，不会污染其他区域（文章 `wp-block-*`、UserComments 等）。
- 不引入 `@tailwindcss/typography`——文章内容用的是 WP 区块（`.wp-block-*`）而非 markdown，与 prose 体系无关，保持 `wordpress.scss` 不变。

### 2. 表格样式

Cherry markdown CSS 自带 `.cherry-markdown table/td/th` 规则（边框、表头背景、内边距），加 `.cherry-markdown` 类后自动生效，无需额外编写表格样式。

### 3. primary 背景字体颜色覆盖

`global.scss` 在 `[data-align="end"]`（自己评论）作用域下，统一覆盖 `.chat-content` 内所有文字元素颜色为 `--primary-foreground`：

```scss
.chat-bubble[data-align="end"] [data-slot="bubble-content"] .cherry-markdown {
  h1, h2, h3, h4, h5, h6,
  p, li, td, th, blockquote, pre, code, strong, em {
    color: var(--primary-foreground);
  }
}
```

- 覆盖 Cherry 的硬编码深色，确保在 primary 亮绿背景上对比度足够。
- 链接沿用已有的 `[data-align="end"] a { color: var(--primary-foreground) }` 规则。
- 仅作用于 `data-align="end"`（自己评论），他人评论（`data-align="start"`，secondary 灰底）保持 Cherry 默认样式。

### 4. 作用域隔离

- `.cherry-markdown` 类仅加在评论内容容器，不作用于编辑器实例（编辑器自身已用 `cherry-markdown.css` 的编辑器部分）。
- UserComments（用户评论列表）保持现有内联样式，不接入（非气泡展示，样式需求不同）。

## 数据流

```
评论内容（markdown）
  ├─ 编辑器: Cherry 实例 + cherry-markdown.css（编辑器 UI）+ markdown 预览 CSS
  └─ 渲染:   marked 解析 → sanitize → .chat-content.cherry-markdown 容器
              + global.scss 引入的 cherry-markdown.markdown.css → 与预览一致
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| @tailwindcss/typography prose | 评论容器套 prose 类 | ① 与 Cherry 预览不一致（不同排版引擎）② 文章内容是 wp-block 非 markdown，prose 无益 ③ 引入新依赖 |
| 手写 .chat-content 全套样式 | 自主控制 | 工作量大且难与 Cherry 预览完全一致 |
| 仅修复表格 + primary 冲突 | 最小改动 | 无法解决"与编辑器预览不一致"的核心诉求 |

## 影响

### 前端
- `src/styles/global.scss`：引入 cherry-markdown.markdown.css；新增 `[data-align="end"]` 的文字颜色覆盖。
- `src/components/CommentSection.tsx`：评论内容容器（BubbleContent）加 `.cherry-markdown` 类。

### 风险与注意
- Cherry markdown CSS 体积 134-174KB，全量引入会增大样式体积（构建时压缩）。
- `.cherry-markdown` 的硬编码色值（如链接色、标题色）可能与评论气泡的 secondary 灰底不完全协调——用户可通过后续微调。
- `data-align="end"` 的覆盖规则需放在 Cherry CSS 引入之后（或提高特异性），确保覆盖生效。

## 参考文献

- Cherry Markdown: https://github.com/Tencent/cherry-markdown
- cherry-markdown 的 markdown 排版 CSS：`node_modules/cherry-markdown/dist/cherry-markdown.markdown.css`（所有规则 `.cherry-markdown` scoped，不依赖全局 CSS 变量）
- ADR-0004（评论 Message 架构）：`docs/adr/0004-comment-message-architecture.md`
- `src/lib/markdown.ts` 的 sanitize 白名单（已含 table 标签）
