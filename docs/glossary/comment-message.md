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
