# ADR-0010: 用户自己评论中表格斑马纹配色优化

## 状态

已接受（2026-08-06 修订：从"黑 10% 叠绿"改为"灰色系统一"）

## 日期

2026-08-06

## 背景

ADR-0009 为评论表格添加了斑马纹（偶数行 `--muted` 浅灰 + hover 淡绿）。该配色在**他人评论**（secondary 灰底）上表现良好，但在**用户自己评论**（primary 亮绿底 `rgb(0,240,160)`）上出现视觉问题：

- 自己评论背景为 `--primary` 亮绿。
- 斑马纹偶数行用 `--muted`（浅灰 `rgb(248,249,250)`）。
- 实际渲染为 `[透明(露绿), 浅灰, 透明(露绿), 浅灰]` 交替——**绿底上浅灰行与绿行强烈跳变**，视觉割裂。

**首版方案**（黑 10% 叠绿）：偶数行用 `color-mix(var(--primary-foreground) 10%, transparent)`（黑 10% 叠绿 = 深绿灰），奇数行透明露绿底。**实测后用户反馈不满意**——"透明混绿"效果突兀。

**修订方案**（灰色系统一）：表格**所有行**都用灰色实色背景（不露绿底），与 header 的灰色系形成统一的灰色区块，与绿色气泡背景形成干净对比。

## 需求

- 用户自己评论（`data-align="end"`，primary 绿底）中，表格**所有行用灰色系实色**（不露绿底）。
- 灰阶深浅交替，与 header 协调。
- 表头（th）背景保持现状（`--muted` 浅灰）。
- 表格文字颜色不变（保持 `--primary-foreground` 深黑，已有 ADR-0007 覆盖）。

## 决策

### 1. 绿底场景表格所有行灰色实色

在 `#comments-section` 作用域内，为 `data-align="end"`（自己评论）单独覆盖斑马纹：

```scss
.chat-bubble[data-align="end"] .cherry-markdown {
  table {
    tbody tr:nth-child(odd) {
      background-color: var(--muted);   // #f8f9fa，与 header 同色
    }
    tbody tr:nth-child(even) {
      background-color: color-mix(
        in oklch,
        var(--muted) 90%,
        var(--foreground)
      );                                  // ≈ oklch(0.883)，完全不透明的深灰
    }
  }
}
```

- **奇数行**：`--muted`（`#f8f9fa`，与 header 同色）→ 表头与奇数行连续。
- **偶数行**：`--muted` 混 10% `--foreground`（纯黑）→ `oklch(0.883)` ≈ `rgb(223,224,225)`，与奇数行差约 25 级灰阶，**明显可区分**，且**完全不透明**。
- 所有行都是**不透明灰实色**，不露绿底 → 表格形成统一灰色区块。
- hover 保留 ADR-0009 的 `color-mix(in oklch, var(--primary) 8%, transparent)`（淡绿高亮）。

> **关键踩坑**：偶数行**不能混 `--muted-foreground`**——它定义为 `color-mix(in oklch, var(--foreground) 60%, transparent)`，**本身半透明**（60% 前景 + 40% 透明）。用它混出的颜色带 alpha（实测 `oklch(0.92 / 0.96)`），会**透出绿底**（"透着绿色的灰"）。改用 `--foreground`（纯黑 `#000000`，不透明）后结果为 `oklch(0.883)`，完全无 alpha。

> 另注：曾尝试偶数行用 `--secondary`（`#f5f6f7`），但与 `--muted` 仅差 3 个色阶、区分度不足，弃用。

### 2. 他人评论斑马纹不变

`data-align="start"`（他人评论，secondary 灰底）保持 ADR-0009 的 `--muted` 浅灰斑马纹——在灰底上协调，无需修改。

### 3. th 背景保持现状

表头 `th` 背景保持 `--md-inline-code-bg`（`--muted` 浅灰）。奇数行同色，形成"header → 奇数行"的连续灰。

### 4. 文字颜色不变

表格文字保持 `--primary-foreground` 深黑（ADR-0007 的 `data-align="end"` 覆盖已生效），灰色实色背景上深黑文字可读性良好。

## 数据流

```
用户自己评论（data-align="end"，primary 绿底）
  ├─ header:    --muted 浅灰
  ├─ 奇数行:    --muted 浅灰（与 header 连续）
  ├─ 偶数行:    --secondary 略深灰
  └─ 表格文字:  --primary-foreground 深黑
= 表格为统一灰色区块（灰阶深浅交替），与绿底形成干净对比
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 黑 10% 叠绿（首版） | 偶数行黑叠绿、奇数行透明 | 用户反馈"透明混绿"突兀 |
| 白色叠绿变浅 | `color-mix(white 12%, primary)` | 绿底上变浅不明显 |
| muted-foreground 全强度 | 黑 60% 叠绿 | 太深，接近黑底 |

## 影响

### 前端
- `src/styles/global.scss`：`#comments-section` 作用域内 `.chat-bubble[data-align="end"] .cherry-markdown table` 的 `tbody tr:nth-child(odd/even)` 规则（奇数行 `--muted`、偶数行 `color-mix(muted 90%, foreground)` 不透明灰阶递进）。

### 风险与注意
- 偶数行灰阶（≈ oklch 0.883）与奇数行（rgb(248,249,250)）差约 25 级，区分度良好且**完全不透明**（无 alpha，不露绿底）。
- 暗色模式下 `--muted`（#1f2020）混 `--foreground`（纯黑）会产生更深的灰阶，交替同样成立。

## 参考文献

- ADR-0009（评论标题装饰条与表格斑马纹）：`docs/adr/0009-comment-heading-bars-and-table-zebra.md`
- ADR-0008（评论 bubble 背景与表格原文修复）：`docs/adr/0008-comment-bubble-bg-and-table-fix.md`
- ADR-0007（评论 markdown 渲染样式对齐 Cherry）：`docs/adr/0007-comment-markdown-style-alignment.md`
- `src/styles/global.scss` 的 `#comments-section` 作用域

