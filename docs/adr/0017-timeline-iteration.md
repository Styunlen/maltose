# ADR-0017: 时间轴页面迭代——timeline19 样式、年份热力图、全量统计

## 状态

已接受

## 日期

2026-08-12

## 背景

ADR-0016 实现的时间轴页面经用户验收后，反馈三个问题：

### 问题 1：时间轴样式不符

当前实现是"年份→月份折叠列表"，用户期望的是 **timeline19 风格**（shadcnblocks Pro 块）：
- 垂直时间轴，左侧连续线
- 每个文章一个节点：圆点标记 + 日期 + 标题 + 描述
- muted 轨道线 + 深色动画填充（Framer Motion，进入视口时进度线生长）
- 无边框极简风格

### 问题 2：热力图仅近一年

当前 `GitHubCalendar` 固定展示近一年（53x7）。用户期望**支持选择任意年份**（有文章的年份）。

### 问题 3：统计只显示近 100 条

**根因**：WPGraphQL 的 `posts` 连接**默认上限 100**——`getTimelineStats(first: 200)` 实测只返回 100 条（WP 文章总数 167）。热力图和统计基于不完整的 100 篇。

## 需求

- 时间轴改为 **timeline19 风格垂直时间轴**（连续线 + 圆点 + 进度线动画），展示全部文章。
- 热力图支持**年份选择**：最近几年用按钮，其余年份用 shadcn Select 下拉。
- 统计/热力图基于**全量文章数据**（分页拉取，突破 100 上限）。

## 决策

### 1. 全量文章数据获取（修复问题 3）

> 依赖说明：`offsetPagination`（`where: { offsetPagination: { size, offset } }`）**不是 WPGraphQL 原生功能**（原生仅 cursor 分页 `after`/`endCursor`），由第三方插件 [valu-digital/wp-graphql-offset-pagination](https://github.com/valu-digital/wp-graphql-offset-pagination) 提供。实际实现（api.ts `getTimelineStats`）用 `pageInfo.offsetPagination.total` 判断终止，而非下述伪代码的短批判断（避免总数恰为 100 整数倍时多发一次空请求）。

`getTimelineStats` 改为**分页拉全量**：

```ts
export async function getTimelineStats(): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const PAGE = 100;
  while (true) {
    const key = `timelineStats:${offset}`;
    const data = await cachedQuery<any>(key, pageQuery, { first: PAGE, offset });
    const nodes = data.posts.nodes || [];
    all.push(...nodes);
    if (nodes.length < PAGE) break;  // 取完
    offset += PAGE;
  }
  return all;
}
```

- 每批 100，循环到取完（167 篇 = 2 批）。
- 每批独立 cachedQuery 键（`timelineStats:offset`），60s TTL。
- 统计 + 热力图基于全量数据。

### 2. 热力图年份选择（问题 2）

`GitHubCalendar` 增加年份选择：
- 从全量文章提取有文章的年份列表。
- **最近 N 年**（如 3 年）用按钮组（`2026` `2025` `2024`...），**其余年份**用 shadcn Select 下拉。
- 点击/选择后切换该年的 53x7 热力图。
- 默认显示最近一年。

### 3. timeline19 风格时间轴（问题 1）

`TimelineList` 重写为垂直时间轴：
- 左侧连续线（muted 轨道），圆点标记每个文章。
- 每节点：日期 + 标题链接 + 浏览数 + 评论数。
- **进度线动画**：进入视口时，motion 驱动轨道线从 0 生长到当前进度（timeline19 核心效果）。
- 展示全部文章（降序）。

### 4. 新增 shadcn Select

`src/components/ui/select.tsx`（遵循项目 shadcn 组件风格，Base UI/Radix 模式）。

## 数据流

```
/timeline 请求
  ├─ getTimelineStats(): 分页拉全量（2 批 100+67）→ 热力图年份 + 统计
  └─ getTimelinePosts(page): 时间轴分页列表（timeline19 样式）
  └─ GitHubCalendar: 年份按钮/Select 切换
  └─ TimelineList: motion 进度线生长动画
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 按年过滤查询 | 每年实时查 | 慢，无缓存 |
| 原生 select | 简单 | 非 shadcn 风格 |
| 静态线 | 无动画 | timeline19 特色是进度线动画 |

## 影响

### 前端
- `src/api/api.ts`：`getTimelineStats` 分页拉全量。
- `src/components/timeline/GitHubCalendar.tsx`：年份选择（按钮 + Select）。
- `src/components/timeline/TimelineList.tsx`：timeline19 风格重写（圆点 + 进度线动画）。
- `src/components/ui/select.tsx`：新增 shadcn Select。
- `src/pages/timeline.astro`：适配。

### 风险与注意
- 全量分页拉取：每次页面加载最多 2 批请求（但 cachedQuery 缓存，首次后 60s 内命中）。
- motion 进度线动画：需 `useInView` 检测进入视口；SSR 首屏无动画（客户端水合后触发）。
- Select 组件：需确认项目用 Base UI 还是 Radix（bubble.tsx 用 @base-ui/react，但 alert/confirm 用 radix-ui）——需统一。

## 参考文献

- shadcnblocks timeline19: https://www.shadcnblocks.com/block/timeline19
- ADR-0016（时间轴页面初版）：`docs/adr/0016-timeline-page.md`
- WPGraphQL `posts` 连接默认 `first` 上限 100
- motion 库：项目已装 `motion@^12.38.0`
