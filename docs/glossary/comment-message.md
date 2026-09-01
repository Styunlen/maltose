# 术语表 (Glossary)

## Message（消息组件）

shadcn/ui 的对话消息布局组件。本项目的评论区用它重构单条评论，负责行布局（头像、对齐、头部、尾部）。架构为：`Message`（行）→ `MessageAvatar` + `MessageContent`（`MessageHeader` + `Bubble` + `MessageFooter`）。

## Bubble（气泡）

消息气泡表面组件，包裹评论内容，提供背景、圆角、阴影。`BubbleContent` 承载实际内容。

## MessageGroup（消息组）

将同一发送者的**连续**消息堆叠的容器。组内第一条显示头像，后续条用空头像占位保持对齐。主评论区与回复弹窗均使用它做发送者分组。

## MessageAvatar / MessageContent / MessageHeader / MessageFooter

Message 组件的子部件：
- `MessageAvatar`：头像槽位，底部对齐
- `MessageContent`：包裹头部、气泡、尾部
- `MessageHeader`：头部内容（作者名、@父评论、时间、UA）
- `MessageFooter`：尾部内容（回复/编辑/删除操作按钮、回复数）

## 回复弹窗（Reply Popup Modal）

点击评论下「↳ N 条回复」后弹出的模态框，展示该评论的子回复。重构后改为**数据渲染**（从 `localComments` 取数据 + MessageGroup 分组），替代原先的 `cloneNode` DOM 克隆机制。

## 发送者连续分组（Group by Author）

将评论列表按**严格相邻且发送者相同**的规则分组，用于 MessageGroup 堆叠。例如用户 A 连续发两条评论则归为一组，中间隔了别人的评论则不合并。

## 原位编辑（In-Place Edit）

评论编辑交互：编辑框在被编辑评论的**气泡下方**展开（而非渲染在列表顶部）。展开时原气泡**收成摘要**（头像+作者+时间+提示条），该评论的操作按钮全部隐藏。评论不在视口时自动平滑滚动到编辑框。

## 编辑作用域（Edit Scope）

编辑状态的归属上下文，取值为 `main`（主区评论列表）或 `popup`（子回复弹窗）。同一份评论数据可能同时在主区列表与弹窗中显示，用作用域保证**只有当前作用域**展开编辑框。全局同时只能有一条评论处于编辑态。

## 编辑状态 store（Edit Store）

基于 **nanostores**（框架无关的原子 store）的独立状态模块（`src/stores/edit-store.ts`），用单个 `atom` 组合 `{ id, scope }` 管理编辑态。React 组件通过 `useEditStore()` hook 订阅；非 React 代码可直接 `editTargetStore.get()/set()` 读写。主区与弹窗通过它共享编辑态；跨作用域切换编辑（如弹窗内点编辑而主区已有草稿）时先弹确认对话框再丢弃草稿。

## 编辑守卫（Edit Guard）

离开编辑态或关闭弹窗时，若存在未保存的编辑草稿，弹 `ConfirmDialog` 确认是否丢弃。确认则清理编辑态并继续（关闭弹窗/切换编辑目标），取消则阻止该操作，保留草稿。

## 编辑框加载态（Edit Loading State）

评论编辑框打开后的加载状态，由两个条件决定：
- **editorReady**：Cherry Markdown 编辑器实例就绪（`onReady` 回调触发）。
- **rawLoaded**：raw 评论内容已 fetch 并 `setMarkdown` 填充完成（或降级用本地 `rawContent`）。

两者都满足才视为"加载完毕"。加载完成前编辑框**只读**（通过 `MarkdownEditor.setDisabled` 动态切换 CodeMirror 的 `EditorState.readOnly` facet），并显示半透明 overlay + "正在加载评论内容…"提示，保存按钮禁用，取消按钮始终可用。

## setDisabled（编辑器只读开关）

`MarkdownEditor` 暴露到 ref 的方法（`MarkdownEditorHandle.setDisabled(disabled)`）。内部通过 Cherry 的 `getCodeMirror()` 获取 CodeMirror 6 view，**切换 `view.contentDOM.contentEditable`**（`"false"`/`"true"`）实现只读。采用 DOM 级切换而非 `EditorState.readOnly` facet dispatch（后者是 Facet 非 StateEffect，直接 dispatch 会破坏 view）。加载完成前为 `true`，raw 填充完成后为 `false`。仅影响当前编辑器实例。

## Cherry Markdown 排版样式（cherry-markdown.markdown.css）

Cherry Markdown 编辑器自带的 markdown 排版 CSS（h1-h6、table、ul/ol、code、pre、blockquote 等完整规则）。所有规则以 `.cherry-markdown` 类为作用域前缀（166 处），**不依赖全局 CSS 变量**（`--primary`/`--foreground` 等 0 处），使用自身硬编码色值。评论渲染复用此 CSS（容器加 `.cherry-markdown` 类）以实现与编辑器预览**完全一致**（所见即所得）。

## 评论 markdown 渲染（Comment Markdown Rendering）

评论内容经 `marked` 解析 + sanitize 白名单过滤后，通过 `dangerouslySetInnerHTML` 渲染到 `.chat-content` 容器。容器同时加 `.cherry-markdown` 类，复用 Cherry 排版 CSS。自己评论（`data-align="end"`）因背景是 primary 亮绿，需在作用域内覆盖标题/代码等元素颜色为 `--primary-foreground` 保证对比度。

## reverseWpautop（wpautop 反转）

将 WordPress `wpautop` 过滤后的评论 HTML（每段包 `<p>`、行间 `<br>`）反转回 markdown 文本的工具函数（`src/lib/wpautop.ts`）。ADR-0008 修复：`</p><p>` → `\n\n` 后，**表格行间空行合并为单换行**（`\n\n(?=\|)` → `\n`），使 marked 能识别 markdown 表格（WP 会把表格每行独立包成 `<p>`，直接反转引入空行导致表格失效）。

## Bubble 变体背景（Bubble Variant Background）

bubble 的 `variant` 背景色：`default`（自己评论）= `--primary` 亮绿、`secondary`（他人评论）= `--secondary` 灰。Tailwind 生成 `:is(*:data-[slot=bubble-content]:bg-primary > *)` 变体规则，但**优先级低于** Cherry 的 `.cherry-markdown` 背景规则（`--base-previewer-bg`）。ADR-0008 在 global.scss 显式补回背景色（`.chat-bubble[data-align=end] .chat-content.cherry-markdown { background: var(--primary) }`），避免被 Cherry 覆盖。

## 标题装饰条（Heading Decorative Bar）

`wordpress.scss` 中 `article h1::before` 等定义的绿色竖条装饰（`background: var(--primary)`）。因评论区在 article 内，装饰条会应用到评论标题，且在自己评论的 primary 绿底上**完全融合**。ADR-0009 在 `#comments-section` 作用域将其 `content: none` 禁用（仅评论区，不影响文章正文）。

## 表格斑马纹（Table Zebra Striping）

评论 markdown 表格的交替行背景。Cherry 表格默认只有 th 背景（muted 灰）、body 行透明，视觉割裂。ADR-0009 增加 `tbody tr:nth-child(even) { background: var(--muted) }` 斑马纹 + `tr:hover` 淡绿高亮（`color-mix(primary 8%)`）。ADR-0010 优化：**用户自己评论**（`data-align="end"`，primary 亮绿底）的表格**所有行**改用灰色实色——奇数行 `--muted`（与 header 同色）、偶数行 `color-mix(muted 90%, foreground)`（纯黑混合，**完全不透明**的深灰，≈ oklch 0.883），形成统一灰色区块（不露绿底），与绿色气泡背景干净对比。**注意**：偶数行不能混 `--muted-foreground`——它本身半透明（60% 前景 + 40% 透明），混出的颜色带 alpha 会透出绿底。他人评论（灰底）保持 `--muted` 浅灰斑马纹。

