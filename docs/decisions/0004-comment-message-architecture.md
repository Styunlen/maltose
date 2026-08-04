# ADR-0004: 评论组件对齐 shadcn Message 架构

## 状态

已接受

## 日期

2026-08-04

## 背景

评论区的单条评论（`CommentSection.tsx` 的 `ChatBubble` 组件）当前为**纯内联样式**实现，与项目已引入的 shadcn `Message` 组件族（`src/components/ui/message.tsx`，含 `Message/MessageAvatar/MessageContent/MessageHeader/MessageFooter/MessageGroup`）完全脱节。同时，弹窗内的子回复通过 **`cloneNode` 克隆主区 DOM** 实现（`CommentSection.tsx:428-438`），依赖脆弱的 DOM 选择器事件委托。

参考 shadcn [Message 组件文档](https://ui.shadcn.com/docs/components/base/message)（含 `Bubble` 组件），将单条评论对齐 Message 架构，并引入 `MessageGroup` 实现发送者分组。

## 需求

- 单条评论改为**气泡式**呈现（Bubble 背景/圆角/阴影）。
- 保留作者名、时间、UA 信息；操作按钮移到气泡下方（MessageFooter）。
- 保留现有交互：评论平铺 + 有子评论的显示「查看回复」按钮 + 点击弹窗查看子回复（类似 QQ 频道）。
- **主评论区**引入 `MessageGroup`：同一发送者的**连续**评论堆叠（组内第一条带头像，后续条空头像占位）。
- **弹窗内**子回复也应用 `MessageGroup` 分组。
- 弹窗改为**数据渲染**（替代 cloneNode），事件委托改为 React 事件。

## 决策

### 1. 引入 shadcn 官方 Bubble 组件

`src/components/ui/bubble.tsx` 使用 shadcn 官方完整实现（依赖 `@base-ui/react` + `class-variance-authority`）：

```tsx
<Bubble variant="default|secondary|muted|tinted|outline|ghost|destructive" align="start|end">
  <BubbleContent>内容</BubbleContent>
  <BubbleReactions side="bottom" align="start|end">↳ N 条回复</BubbleReactions>
</Bubble>
```

- 7 种 variant、align 对齐、`BubbleReactions`（气泡边缘悬垂标签）、`BubbleGroup`
- `BubbleContent` 支持 `render`（多态）、`max-w-[80%]` 内容自适应

### 2. ChatBubble 重构为 Message 组件族

```
<Message align={isOwn ? "end" : "start"}>
  <MessageAvatar><Avatar .../></MessageAvatar>
  <MessageContent>
    <MessageHeader>作者名 @父评论 · 时间 · UA</MessageHeader>
    <Bubble variant={isOwn ? "default" : "secondary"}>
      <BubbleContent>评论内容</BubbleContent>
      {有子评论 && <BubbleReactions>↳ N 条回复</BubbleReactions>}
    </Bubble>
    <MessageFooter>回复/编辑/删除 按钮</MessageFooter>
  </MessageContent>
</Message>
```

**保留**：
- `chat-comment-{databaseId}` id（弹窗高亮、@提及跳转依赖）
- 父评论提及（`@name`）、UA 图标、回复/编辑/删除逻辑
- `.chat-content` 的 markdown 渲染（SSR `dangerouslySetInnerHTML`）

**变更**：
- 操作按钮（回复/编辑/删除）从头部行 → `MessageFooter`
- 内容移入 `Bubble` 气泡（自己评论用 default/primary 色，他人用 secondary）
- "↳ N 条回复"用 `BubbleReactions` 悬垂在气泡边缘（有回复时）
- 自己评论右对齐（`align="end"` + `flex-row-reverse`），他人左对齐

### 2b. 头像对齐决策（playwright 实测验证）

`MessageAvatar` 使用 `self-start`（顶部对齐），移除 `self-end` + `-translate-y-8`。

**行为**（经 playwright 对 9 条评论实测）：
- 头像顶部相对气泡顶部偏移**恒为 -26px**（对齐消息行顶部/header 区域），所有评论完全一致
- 与气泡高度（47px/72px）、是否有回复标签**完全无关**
- 头像在 **start**（顶部对齐），不依赖 footer/气泡动态高度

### 2c. 悬垂 reaction 与 footer 防重叠（playwright 实测验证）

`BubbleReactions` 的 `absolute + translate-y-3/4` 会悬垂到气泡底部之外。当评论内容短（气泡矮）时，悬垂标签会侵入 `MessageFooter` 区域。

**修复**：有回复的 Bubble 加 `mb-4`（16px 底部 margin），为悬垂标签预留空间：

```tsx
<Bubble className={comment.children.length > 0 ? "mb-4" : ""}>
```

**行为**（经 playwright 实测，内容最短的评论）：`reactionBottom - footerTop = -8`（悬垂标签底部比 footer 顶部高 8px，不重叠）。`self-start` 头像不受此 margin 影响。

### 2d. 评论区体验修复

1. **AvatarFallback**：`Avatar` 同时渲染 `AvatarImage`（有 url 时）+ `AvatarFallback`（始终渲染），Radix 自动在图片加载失败时隐藏 Image 显示 Fallback。

2. **评论内边距**：`.chat-bubble`（`data-slot="message"`）加 `padding: 0.35rem 0.5rem`，hover 背景不再贴边界。通过 global.scss 修改，不改 message.tsx。

3. **弹窗层级导航**：弹窗内部用栈（`stack`）管理层级：
   - 初始层 = 主区父评论 + 直接子回复
   - 弹窗内子评论的 reaction 点击 → `pushLevel` 用 `commentMap` 查该子评论的子回复并 push 新层
   - 面包屑导航（回复 / A / A→B）→ 点击返回对应层级
   - 弹窗新增 `commentMap` prop（全局评论索引）

### 3. 主评论区 MessageGroup 分组

`sorted` 数组按**严格连续同发送者**分组：

```ts
// 分组逻辑：连续且 author 相同则归为一组
function groupByAuthor(sorted: FlatComment[]): FlatComment[][]
```

每组渲染：
```tsx
<MessageGroup>
  {group.map((c, i) => (
    <Message key={c.id} align="start">
      {i === 0 ? <MessageAvatar>…</MessageAvatar> : <MessageAvatar />}
      …
    </Message>
  ))}
</MessageGroup>
```

分组判定：**严格连续**（相邻两条 author 相同即一组），按 Q9 确认。

### 4. 弹窗数据渲染 + MessageGroup

弹窗不再 `cloneNode`，改为直接渲染数据：
- 父评论 + 子回复均从 `localComments`（`commentMap`）取数据渲染
- 子回复按发送者分组，外层 `MessageGroup` 堆叠
- 事件委托（回复/编辑/删除/提及）改为 React `onClick`（复用主区逻辑）

## 数据流

```
localComments → buildCommentMap → sorted（按时间排序）
  ├─ 主区: sorted → groupByAuthor → MessageGroup(Message...) 
  └─ 弹窗: 父 + childrenIds → 子回复数据 → groupByAuthor → MessageGroup
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 保留内联样式微调 | 只改视觉不改结构 | 无法引入 MessageGroup，与 shadcn 架构脱节 |
| 保留 cloneNode 弹窗 | 只重构单条气泡 | cloneNode 无法应用动态 MessageGroup 分组 |
| 主区不分组 | 仅弹窗分组 | 用户明确要求主区也有分组（Q7） |

## 影响

### 前端
- 引入 shadcn 官方 `src/components/ui/bubble.tsx`（新增依赖 `@base-ui/react` + `class-variance-authority`）
- 重构 `CommentSection.tsx`：ChatBubble 用 Message 组件族、主区/弹窗 MessageGroup、弹窗数据化
- 事件委托从 DOM 选择器迁移到 React

### 风险与注意
- `chat-comment-*` id 必须保留（弹窗高亮、`@` 提及、`.chat-highlight` 动画依赖）
- `.chat-content` class 保留（`startReply` 引用 innerText 作回复引用）
- UA 解析（`parseUa`）逻辑不变

## 参考文献

- shadcn Message 组件文档: https://ui.shadcn.com/docs/components/base/message
- shadcn Bubble 组件文档: https://ui.shadcn.com/docs/components/bubble
- 项目现有: `src/components/ui/message.tsx`
