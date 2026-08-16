# ADR-0018: timeline19 时间轴重构——年份分组、对齐、全量展示

## 状态

已接受

## 日期

2026-08-13

## 背景

ADR-0017 的 TimelineList 实现存在三个问题（用户反馈）：

1. **展示文章太少**：`TimelineList posts={posts}` 只接收 `getTimelinePosts(page)` 的**当前页 10 篇**，而非全量。全量 167 篇在 `statsPosts` 但缺 `uri/title` 字段。
2. **圆点与轨道线不对齐**：轨道线 `left: 5`（外层相对容器），圆点 `left: 0`（内层 padding 容器）——两个不同偏移，视觉错位。
3. **无年份分组/具体日期**：全部平铺，日期只显示 `YYYY.MM`，用户期望**年份突出显示 + 展开该年文章 + 具体 MM-DD 日期**。

用户期望严格参考 [shadcnblocks timeline19](https://www.shadcnblocks.com/block/timeline19)（Pro 块）：垂直时间轴 + 轨道线 + 圆点标记 + 进度线动画。

## 需求

- 时间轴展示**全量文章**（按年份分组）。
- **年份作为大节点**：大圆点 + 年份大字 + 该年文章数，**折叠功能**（默认展开），融入时间轴（类似折叠面板）。
- **子节点**（文章）：小圆点 + **MM-DD 具体日期** + 标题 + 浏览/评论数。
- **圆点与轨道线精确对齐**（固定日期列 + 轨道线居中）。
- 保留 timeline19 的 motion 进度线动画。

## 决策

### 1. 全量数据

扩展 `getTimelineStats()` 查询增加 `uri` 和 `title` 字段——时间轴直接消费全量数据，不再依赖分页的 `posts`：

```ts
nodes { databaseId date uri title viewCount commentCount }
```

`timeline.astro` 将 `statsPosts`（全量 167 篇）传给 `TimelineList`，移除对 `getTimelinePosts` 的依赖（或保留分页仅用于历史兼容）。

### 2. 固定日期列 + 轨道线居中（对齐方案）

布局结构（数学精确对齐，**同一参考系**）：

```tsx
<div style={{ position: "relative" }}>  // 无 paddingLeft——所有绝对定位同参考系
  {/* 轨道线：相对外层容器 */}
  <div style={{ position: "absolute", left: TRACK_LEFT, ... }} />
  {/* 进度线：同位置 */}
  <motion.div style={{ position: "absolute", left: TRACK_LEFT, ... }} />
  {items.map(item => (
    <div style={{ position: "relative", display: "flex" }}>
      {/* 圆点：相对 item（与外层同参考系，因 item 无 padding 偏移） */}
      <span style={{ position: "absolute", left: TRACK_LEFT - DOT/2 + 1, ... }} />
      {/* 日期：marginLeft 撑开（非容器 padding） */}
      <div style={{ marginLeft: DATE_COL }}>{date}</div>
      ...
    </div>
  ))}
</div>
```

- `DATE_COL = 56px`，`DOT = 12px`，`YEAR_DOT = 16px`，`TRACK_LEFT = DATE_COL - 1`（2px 线居中）。
- **关键（2026-08-13 修复）**：外层容器**不设 `paddingLeft`**（早期版本设了导致圆点相对 item 偏移 56px），改为 item 行内 `marginLeft: DATE_COL` 撑开。轨道线（外层 absolute）与圆点（item absolute）因此**同参考系**。
- 验证：getBoundingClientRect 实测轨道中心 = 文章圆点中心 = 年份圆点中心（精确重合）。

### 2b. 分页（每页 100）

时间轴**单页最多 100 篇**，超出用页码分页：
- `timeline.astro` 用 `getTimelinePosts(page, PER_PAGE=100)` 获取当前页。
- `Pagination` 组件（basePath="/timeline"）。
- **热力图/统计仍用全量** `getTimelineStats()`（不受分页影响）。
- 验证：第 1 页 100 篇，第 2 页 67 篇（167 总）。

### 2c. 文本与轨道线间距（2026-08-13 调整）

- 日期列 `DATE_COL` 56 → **72px**（内容起点右移，`TRACK_LEFT` 自动跟随）。
- 文章内容 `paddingLeft` → 16px；年份按钮 `marginLeft: DATE_COL + 16`——**年份标题与文章标题起点统一**（距轨道线 16px）。
- 验证：年份标题距轨道线 16px、文章标题距轨道线 16px、年份/文章起点一致、圆点对齐保持。

### 3. 年份大节点 + 折叠

```
年份节点（大圆点 16px + 年份大字 + N 篇）
  ├─ 点击切换展开/收起（默认展开）
  └─ 展开时渲染该年文章子节点（小圆点 12px + MM-DD + 标题 + meta）
```

- 年份节点：`useState<Set<number>>(所有年份)`（默认全展开），点击 toggle。
- 年份大圆点 16px，文章小圆点 12px，视觉层级区分。

### 4. 日期格式

- 年份节点：显示 `2026`（大字）。
- 文章子节点：`MM-DD`（如 `08-12`），年份由所属分组隐含。

### 5. 保留 timeline19 动画

- 轨道线 muted + motion 进度线（`useInView` 进入视口生长）。
- 子节点进入视口淡入。

## 数据流

```
/timeline
  └─ getTimelineStats(): 全量文章（含 uri/title，分页拉取）→ TimelineList
       └─ 按年份分组 → 年份大节点（默认展开）
            └─ 文章子节点（MM-DD + 标题 + 浏览/评论）
       └─ motion 进度线动画
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 分页列表 | 每页 10 篇 | 用户要全量展示 |
| 年份独立折叠区 | 年份不在时间轴上 | 用户要年份融入时间轴 |
| 统一 left 偏移 | 圆点线同偏移 | 固定日期列更精确 |

## 影响

### 前端
- `src/api/api.ts`：`getTimelineStats` 增加 `uri/title` 字段。
- `src/components/timeline/TimelineList.tsx`：重构（固定日期列 + 年份分组折叠 + 精确对齐）。
- `src/pages/timeline.astro`：`TimelineList` 接收全量 `statsPosts`。

### 风险与注意
- 全量 167 篇文章渲染：DOM 节点数可接受（折叠后默认全展开，可能较长）。
- 日期列宽度需容纳 `MM-DD` 且年份大字不溢出。
- 保留 Pagination 可能不再需要（全量展示）——评估后决定。

## 参考文献

- shadcnblocks timeline19: https://www.shadcnblocks.com/block/timeline19
- ADR-0017（时间轴迭代）：`docs/decisions/0017-timeline-iteration.md`
- ADR-0016（时间轴初版）：`docs/decisions/0016-timeline-page.md`
