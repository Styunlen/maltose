# ADR-0006: 评论编辑框加载期间只读

## 状态

已接受

## 日期

2026-08-05

## 背景

`InlineEditBox`（评论原位编辑框）在挂载后异步执行两件事：
1. **Cherry Markdown 编辑器异步初始化**（动态 import + `new Cherry(...)`）。
2. **`fetch /api/comments/raw`** 获取评论 markdown 原文。

当前缺陷：Cherry 就绪后**立即可编辑**，即使 raw 内容尚未返回。用户此时输入，等 raw 返回后 `setMarkdown` 会**覆盖用户输入**（数据丢失风险）。且 `loaded` 状态语义混乱——它在 Cherry 就绪时就为 `true`，与 raw 内容是否填充无关。

用户需求：raw 内容加载并填充**完成之前**，编辑框保持**只读**，直到加载完毕。

## 需求

- 编辑框在"加载完毕"前**只读**，不可输入、不可粘贴、不可格式化。
- **加载完毕**的定义（两个条件都满足）：① Cherry 编辑器实例就绪；② raw 内容已 fetch 成功并 `setMarkdown` 填充完成。
- raw 接口失败时降级用本地 `rawContent`（若存在）填充并解锁；无 `rawContent` 则显示错误并保持只读（用户可取消）。
- 加载期间的视觉：编辑器内 overlay（半透明遮罩 + spinner + "正在加载评论内容…"）。
- 加载完成前保存按钮禁用；取消按钮始终可用。
- 只读状态仅影响当前编辑框实例，不影响新评论表单等其他编辑器。

## 决策

### 1. MarkdownEditor 暴露 `setDisabled` 到 ref

`MarkdownEditor`（`src/components/MarkdownEditor.tsx`）的 `MarkdownEditorHandle` 增加 `setDisabled(disabled: boolean)`：

```ts
export interface MarkdownEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (md: string) => void;
  setDisabled: (disabled: boolean) => void;  // 新增
}
```

实现：Cherry 就绪后缓存 CodeMirror view（`cherryInstance.getCodeMirror()`），`setDisabled` 通过 `view.dispatch` 切换只读：

```ts
import { EditorState } from "@codemirror/state";  // Cherry 的直接依赖

// 在 Cherry 就绪时:
const view = cherryInstance.getCodeMirror();
setDisabled = (d: boolean) => {
  view?.dispatch({ effects: EditorState.readOnly.of(d) });
};
```

- `@codemirror/state` 是 `cherry-markdown` 的**直接依赖**（^6.5.2），版本由 Cherry 锁定，无额外版本冲突风险。
- `EditorState.readOnly.of(true)` 是 CodeMirror 6 标准的只读 facet 效果，动态 dispatch 即可切换，无需重建编辑器。
- **禁用时机**：Cherry 就绪后**立即**调用 `setDisabled(true)`（防止就绪瞬间可编辑），raw 填充完成后 `setDisabled(false)`。

### 2. InlineEditBox 加载状态机

`InlineEditBox`（`src/components/CommentSection.tsx`）引入明确的加载状态：

```
editorReady: Cherry 实例就绪（onReady 回调触发）
rawLoaded:   raw 内容已填充（fetch 成功 setMarkdown / 降级 rawContent / 失败无内容）
```

解锁条件：`editorReady && rawLoaded`。

- **编辑器挂载后立即 `setDisabled(true)`**（编辑框一出现就只读）。
- raw fetch 完成 → 若 `editorReady` 已就绪则 `setMarkdown(raw)` + `setDisabled(false)`；若尚未就绪则缓存 raw，`onReady` 时先 `setDisabled(true)` → `setMarkdown(raw)` → `setDisabled(false)`（消除与 Cherry 异步初始化的竞态，沿用现有 `rawRef` 模式）。
- raw 失败 → 降级 `comment.rawContent`；无则显示错误、保持只读。

### 3. 加载 overlay

`InlineEditBox` 内渲染覆盖层（编辑框容器 `position: relative`）：

```tsx
{!loadingDone && (
  <div style={{
    position: "absolute", inset: 0, zIndex: 5,
    background: "color-mix(in oklch, var(--card) 60%, transparent)",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: "0.5rem", borderRadius: "var(--radius)",
  }}>
    <span spinner /> 正在加载评论内容…
  </div>
)}
```

- 半透明遮罩覆盖在编辑器上方，用户无法交互（叠加 readonly 双保险）。
- 加载完成（`editorReady && rawLoaded`）后移除。

### 4. 按钮状态

- **保存**：`disabled={!loadingDone || saving}`，未加载完成时半透明。
- **取消**：始终可用，点击即退出编辑态（与加载状态无关）。

## 数据流

```
点击编辑 → InlineEditBox 挂载
  ├─ MarkdownEditor 挂载 → 异步初始化 Cherry → onReady → setDisabled(true)
  ├─ fetch /api/comments/raw（异步）
  │    ├─ 成功 → setMarkdown(raw) → setDisabled(false) → rawLoaded=true
  │    ├─ 失败+有 rawContent → setMarkdown(rawContent) → setDisabled(false) → rawLoaded=true
  │    └─ 失败+无 rawContent → 显示错误，保持只读（可取消）
  └─ 解锁条件：editorReady && rawLoaded → 移除 overlay、启用保存
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 延迟创建 Cherry | 加载期间只显示占位 div，raw 就绪后才 `new Cherry` | 无法提前展示编辑器骨架，切换有视觉跳动；且失去"就绪即禁用"的精细控制 |
| 仅 readOnly 无 overlay | 只读但无提示 | 用户看到编辑器无法输入会困惑 |
| 全局只读 | 影响所有 MarkdownEditor 实例 | 破坏新评论表单等独立实例 |

## 影响

### 前端
- `src/components/MarkdownEditor.tsx`：`MarkdownEditorHandle` 增加 `setDisabled`；内部依赖 `@codemirror/state`（Cherry 直接依赖，无需新增顶层依赖）。
- `src/components/CommentSection.tsx`：`InlineEditBox` 增加加载状态机（`editorReady`/`rawLoaded`）、`setDisabled` 调用、加载 overlay、按钮禁用逻辑。

### 风险与注意
- `EditorState.readOnly.of()` 动态 dispatch 是 CodeMirror 6 标准能力，Cherry 内部不干预该 facet。
- `setDisabled` 必须在 Cherry 就绪后调用（`getCodeMirror` 返回有效 view 后），否则需缓存待就绪。
- 与 ADR-0005（原位编辑）的 `onEditSave`/`onEditCancel` 流程无冲突，仅新增加载态 UI。

## 参考文献

- ADR-0005（评论区原位编辑）：`docs/decisions/0005-comment-in-place-edit.md`
- cherry-markdown `getCodeMirror()`: 返回 CodeMirror 6 view（dist 源码 `{key:"getCodeMirror",value:function(){return this.editor.editor.view}}`）
- CodeMirror 6 `EditorState.readOnly` facet: https://codemirror.net/docs/ref/#state.EditorState.readOnly
- `@codemirror/state`: cherry-markdown 的直接依赖（^6.5.2）
