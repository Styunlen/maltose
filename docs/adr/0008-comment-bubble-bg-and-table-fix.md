# ADR-0008: 修复评论 bubble 背景覆盖与 markdown 表格原文问题

## 状态

已接受

## 日期

2026-08-05

## 背景

ADR-0007 引入 Cherry markdown CSS 后，暴露了两个此前未发现的问题：

### 问题 1：Cherry 背景规则覆盖 bubble 变体背景

- 评论内容容器（BubbleContent）的 className 合并了 `chat-content cherry-markdown`（同一元素）。
- Cherry 的 `.cherry-markdown { background-color: var(--base-previewer-bg) }` 会**选中评论容器**。
- 实证：在 `:root` 设置 `--base-previewer-bg: red` 后，bubble-content 背景立即变红——**Cherry 规则覆盖了 bubble 的 `:is(*:data-[slot=bubble-content]:bg-primary > *)` 变体规则**。
- 当前背景透明是 `--base-previewer-bg` 未解析的侥幸；一旦该变量被定义（编辑器会话、未来 Cherry 版本），bubble 背景会被白底覆盖。
- **更深层**：bubble 的 `variant="default"`（自己，`bg-primary` 绿）和 `variant="secondary"`（他人，`bg-secondary` 灰）背景**从未正常显示**（透明/白底）。

### 问题 2：markdown 表格以原文显示

- 评论存储的是 markdown 原文（含 `| Header |` 表格语法）。
- WordPress `wpautop` 过滤后，**每行表格被独立包裹成 `<p>`**：`<p>| Header |</p><p>| ------ |</p>...`。
- GraphQL `comment.content`（RENDERED 格式）返回上述 HTML。
- SSR 的 `renderCommentMd` → `reverseWpautop` 把 `</p><p>` 转成 `\n\n`（**引入空行**）。
- marked 对**表格行间有空行**的 markdown **不识别为表格**，输出每行 `<p>` 原文 → 用户看到 `| Header |` 原文而非表格。

## 需求

- bubble 的变体背景（自己=primary 绿、他人=secondary 灰）正常显示，不被 Cherry 背景规则覆盖。
- 评论里的 markdown 表格正确渲染为 HTML 表格（而非原文）。
- 与 ADR-0007 的字体覆盖规则（`data-align="end"` → `--primary-foreground`）协调。

## 决策

### 1. global.scss 显式补 bubble 背景色

在 `#comments-section` 作用域内，用比 `.cherry-markdown` 更高的优先级恢复 bubble 背景，并按 `data-align` 区分：

```scss
.chat-content.cherry-markdown {
  // 阻断 Cherry 的 --base-previewer-bg 白底覆盖
  background-color: transparent;
  background-image: none;
}
// 自己评论：primary 亮绿背景 + 深黑文字（沿用已有字体覆盖）
.chat-bubble[data-align="end"] .chat-content.cherry-markdown {
  background-color: var(--primary);
}
// 他人评论：secondary 灰背景
.chat-bubble[data-align="start"] .chat-content.cherry-markdown {
  background-color: var(--secondary);
}
```

- 特异性：`.chat-bubble[data-align="end"] .chat-content.cherry-markdown`（2 类 + 1 属性）> `.cherry-markdown`（1 类）→ 稳定覆盖。
- `background-color: transparent` 兜底（默认分支）阻断任何 Cherry 背景残留。
- 与已有 `[data-align="end"]` 字体覆盖（`--primary-foreground` 深黑）协调：绿底黑字。

### 2. 修复 reverseWpautop 的表格行空行

`src/lib/wpautop.ts` 的 `reverseWpautop` 增加一步：**表格行间的空行合并为单换行**（markdown 表格要求连续行）：

```ts
// 表格行间空行 → 单换行（markdown 表格要求连续行）
.replace(/\n\n(?=\|)/g, "\n")
```

- 放在 `</?p>` 删除之后。
- 实证：`| A |\n\n| - |` 合并为 `| A |\n| - |` 后 marked 正确输出 `<table>`。
- 边界验证：非表格的管道文本被合并到前一段（`文本\n| 管道符`），不破坏结构。

### 3. 编辑流程一致性

- 编辑时的 `renderMd`（前端 markdown 渲染）与 SSR 的 `renderCommentMd` 使用相同的 `reverseWpautop` 修复——编辑时看到的表格与渲染后一致（所见即所得）。

## 数据流

```
评论存储（markdown 原文含表格）
  → WP wpautop: 每行表格包 <p>
  → GraphQL content（RENDERED）
  → SSR renderCommentMd:
      reverseWpautop（修复后: 表格行空行 → 单换行）
      → marked.parse → <table> HTML
      → sanitize（白名单含 table）
  → 渲染到 .chat-content.cherry-markdown
      → 背景: global.scss 显式补 primary/secondary
      → 表格: Cherry 表格样式生效
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 修改 bubble.tsx 背景类 | 背景类直接加 BubbleContent | 变体规则已生成，问题是优先级；改结构收益有限 |
| 不用 cherry 类 | 复制 Cherry 规则到 .chat-content | 工作量大，维护负担 |
| WP 存 HTML | 避开 wpautop | 改动大，影响 markdown 编辑 |
| 前端表格还原 | 渲染前正则合并表格行 | 与 reverseWpautop 修复重复 |

## 影响

### 前端
- `src/lib/wpautop.ts`：`reverseWpautop` 增加表格行空行合并。
- `src/styles/global.scss`：`#comments-section` 内显式补 bubble 背景色 + Cherry 背景透明化兜底。

### 风险与注意
- `\n\n(?=\|)` 的正则对"段落以 `|` 开头的非表格文本"会把行合并——实证不破坏结构，但需在真实评论中回归。
- bubble 背景从透明变为 primary/secondary 是**视觉变化**（用户此前可能已适应透明），需确认符合预期。
- 暗色模式下 primary 亮绿背景上的深黑文字对比度需验证。

## 参考文献

- ADR-0007（评论 markdown 渲染样式对齐 Cherry）：`docs/adr/0007-comment-markdown-style-alignment.md`
- `src/lib/wpautop.ts`（reverseWpautop）
- `src/components/ui/bubble.tsx`（bubble 变体背景类）
