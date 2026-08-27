# ADR-0005: 评论区原位编辑（In-Place Edit）

## 状态

已接受

## 日期

2026-08-05

## 背景

评论编辑功能存在体验缺陷：点击"编辑"后，编辑框始终渲染在**评论区列表最顶部**（`CommentSection.tsx` 中 `{sorted.find(c => editingId === c.id) && ...}` 位于所有 `MessageGroup` 之前），同时被编辑的评论**从列表中过滤掉**（`sorted.filter(c => editingId !== c.id)`）。用户在大列表中编辑某条评论时，上下文完全丢失——不知道编辑的是哪条、编辑框出现在视线之外。

用户期望：编辑框在**当前评论所处位置**生成（原位编辑），多层嵌套的弹窗内编辑也应遵循同样交互。

## 需求

- 编辑框在被编辑评论的**气泡下方**展开（气泡保留）。
- 展开编辑框时，原气泡**收成摘要**：头像 + 作者 + 时间 + "正在编辑"提示条。
- 展开编辑框时，该评论的**全部操作按钮隐藏**（回复/编辑/删除）。
- 评论不在可视区域时，点击编辑**自动平滑滚动**到编辑框。
- 子回复**弹窗内直接编辑**，不关闭弹窗。
- **同时只能编辑一条评论**。
- 弹窗内点编辑时若主区已有正在编辑的评论（可能含未保存草稿）→ **弹确认对话框**，确认后才丢弃主区草稿并切换编辑作用域。
- 弹窗有关闭意图且弹窗内存在编辑态 → 弹确认对话框：确认则清理编辑态并关闭，取消则阻止关闭。
- 主区离开编辑态（取消/切换）→ 同样弹确认（有未保存改动时）。
- 保存成功后更新数据并收起编辑框恢复气泡；保存失败保留草稿并显示错误。

## 决策

### 1. nanostores 独立编辑状态 store

新建 `src/stores/edit-store.ts`，用 **nanostores**（框架无关的原子 store，非 React 代码可直接 `get()/set()`）管理编辑态：

```ts
import { atom } from "nanostores";
import { useStore } from "@nanostores/react";

interface EditTarget {
  id: string;      // 当前编辑的评论 id
  scope: "main" | "popup";  // 编辑作用域：主区列表 or 回复弹窗
}

export const editTargetStore = atom<EditTarget | null>(null);
export function startEdit(id: string, scope: EditScope): void;
export function cancelEdit(): void;
export function isEditing(id: string, scope: EditScope): boolean;
export function useEditStore(): { editingId; scope; startEdit; cancelEdit; isEditing };
```

- **作用域语义**：同一份 `localComments` 数据在主区列表与弹窗都可能显示某条评论，必须用 `scope` 保证**只有当前作用域**展开编辑框（主区只在 `scope === "main"` 且 id 匹配时展开；弹窗同理）。
- 弹窗内点编辑 → 先确认丢弃主区草稿（若有）→ `scope` 切到 `"popup"`。
- 主区点编辑 → `scope` 切到 `"main"`。
- **技术选型理由**：zustand 与 React 强耦合；nanostores 为框架无关的原子 store，未来若引入 React 之外的组件（vanilla JS、其他框架）可直接读写 `editTargetStore.get()/set()`，无需经过 React。`useEditStore()` hook 保持与原 zustand 版相同使用形态，迁移成本最小。

### 2. 编辑器随位置渲染 + 独立实例

每个编辑框是独立的 `MarkdownEditor` 实例（`forwardRef` + `useImperativeHandle` 暴露 `getMarkdown`/`setMarkdown`），渲染在目标评论气泡下方。进入编辑态后异步 `fetch /api/comments/raw` 获取 markdown 原文，编辑器就绪后 `setMarkdown` 填充。

### 3. 编辑框定位与滚动

- 编辑框渲染在评论气泡与操作按钮（footer）之间。
- 进入编辑态后，若目标评论不在可视容器（`#chat-scroll`）内，平滑滚动到编辑框使其可见。

### 4. 主区与弹窗的编辑态互斥

- 全局仅允许一条评论处于编辑态（`editingId` 单值）。
- 主区已有编辑态时，弹窗内点编辑 → 弹 `ConfirmDialog`（"有正在编辑的评论，是否丢弃并切换到当前回复？"）→ 确认后丢弃草稿、`scope` 切换。
- 主区已有编辑态时，用户点击另一条评论的编辑 → 同样弹确认（Q16：主区也弹确认）。

### 5. 弹窗关闭时的编辑态守卫

弹窗关闭（✕ / 遮罩点击）时若 `scope === "popup"` 且存在编辑态 → 弹 `ConfirmDialog`：
- 确认关闭 → 清理编辑态、关闭弹窗。
- 取消关闭 → 阻止弹窗关闭。

复用现有 `ConfirmDialog`（删除确认已在用）。

### 6. 保存与数据同步

- 保存成功：`POST /api/comments/update` → 更新 `localComments` 对应条目的 `content`（主区/弹窗同一数据源自动同步）→ `cancelEdit()` → 气泡恢复显示新内容。
- 保存失败：保留编辑态与编辑框内草稿，展示错误提示（复用现有 `formError` 机制），可重试或取消。
- 弹窗内保存后主区同步更新（同一 `localComments` 数据源）。

### 7. 交互约束

- 编辑态下该评论操作按钮（回复/编辑/删除）全部隐藏。
- 编辑态与底部"发表评论"表单**可并存**（不强制互斥）。

## 数据流

```
点击编辑(onEdit)
  → store.startEdit(id, scope)
  → 异步 fetch /api/comments/raw → 编辑器就绪后 setMarkdown(原文)
  → 若目标不在视口 → 平滑滚动到编辑框
保存(成功)
  → POST /api/comments/update → setLocalComments(更新 content) → store.cancelEdit()
保存(失败)
  → 保留草稿 + formError 展示
离开编辑态（有草稿）
  → ConfirmDialog 确认 → store.cancelEdit()
弹窗关闭（popup 编辑态中）
  → ConfirmDialog 确认 → store.cancelEdit() + setPopup(null)
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 保留顶部编辑框 | 现状实现 | 上下文丢失，编辑体验差 |
| Context + useReducer | 不引新依赖 | 需 Provider 包裹，组件外访问不便 |
| zustand | React 绑定状态库 | 与 React 强耦合；本项目需支持未来非 React 组件访问编辑态 |
| 单一编辑器实例移动 | 复用一份 DOM 移到目标下方 | 与 React 渲染模型冲突，状态管理复杂 |
| 仅 editingId 无作用域 | 弹窗打开即清主区编辑态 | 丢失草稿无确认，用户可能在编辑中被强制打断 |

## 影响

### 前端
- 新增 `src/stores/edit-store.ts`（nanostores + @nanostores/react 依赖）。
- `CommentSection.tsx`：
  - 删除顶部 `{sorted.find(c => editingId === c.id) && ...}` 编辑框渲染块。
  - 删除 `sorted.filter(c => editingId !== c.id)` 过滤逻辑。
  - `ChatBubble` 增加编辑态渲染分支（气泡收成摘要 + 气泡下方编辑框）。
  - 主区/弹窗的编辑回调改为调用 `editStore`，作用域区分。
  - 弹窗关闭守卫 + 主区编辑切换守卫复用 `ConfirmDialog`。
- 滚动逻辑复用现有 `scrollRef` / `scrollIntoView` 模式。

### 风险与注意
- `MarkdownEditor` 异步初始化：`setMarkdown` 必须在实例就绪后调用（现状已处理，需保持）。
- `chat-comment-*` id、`.chat-highlight` 动画、@提及跳转逻辑不受影响。
- 弹窗与主区共用 `localComments`，保存后同步天然一致。

## 参考文献

- ADR-0004（评论 Message 架构）：`docs/adr/0004-comment-message-architecture.md`
- 现有删除确认：`CommentSection.tsx` 的 `ConfirmDialog` 用法
- nanostores 文档: https://github.com/nanostores/nanostores
- @nanostores/react 文档: https://github.com/nanostores/react
