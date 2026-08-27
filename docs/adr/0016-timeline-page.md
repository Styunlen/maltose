# ADR-0016: 时间轴页面（Timeline）

## 状态

已接受

## 日期

2026-08-12

## 背景

导航菜单"⏳时光轴"指向 `/timeline`（当前 404，待建页面）。参考 [lifengdi.com/timeline](https://www.lifengdi.com/timeline) 开发类似时间轴页面。

**参考目标（lifengdi）**：
- 按 年份→月份 分组的文章时间轴（2026-08、2026-07...）
- 每条：日期 + 标题 + 热度 + 评论数
- 页码分页（tl_page）

**参考组件（timeline19）**：垂直时间轴 + 圆点标记 + Framer Motion 进度线动画（shadcn/ui）。

**用户需求**（三项）：
1. GitHub commit 风格贡献热力图图标
2. 基础统计内容
3. 按时间轴展开的文章列表

## 需求

- 页面布局：**GitHub 贡献热力图 → 基础统计 → 时间轴文章列表**。
- 热力图：53x7 经典绿格矩阵（约一年，按周列排列），颜色深浅对应当天文章数（0/1/2+），hover 显示日期+文章数。**数据由文章发布日期生成**（无 GitHub API 外部依赖）。
- 统计：总文章数 / 总评论数 / 总浏览数 / 写作天数 / 活跃月份数 / 最长连续更新。
- 时间轴：按 年份→月份 折叠分组（参考 lifengdi），每条含日期+标题+浏览数+评论数。
- 分页：页码分页（复用现有 Pagination 模式，参数化 URL）。
- 技术栈：Astro SSR + React + shadcn/ui + Tailwind，数据来自 WP GraphQL（用 cachedQuery 60s 缓存）。

## 决策

### 1. 页面结构与路由

`src/pages/timeline.astro`（SSR，非静态）：
```
GitHub 热力图（53x7 绿格矩阵，文章日期聚合）
基础统计（6 项指标卡片）
时间轴（年份 → 月份 → 文章列表）
分页（?page=N）
```

### 2. GitHub 热力图（自研 React 组件）

`src/components/timeline/GitHubCalendar.tsx`（client 组件）：
- **53x7 矩阵**：53 列（周）× 7 行（周日-周六），覆盖近一年。
- 数据：WP 文章发布日期 → 按天聚合文章数 → 映射颜色（0 透明 / 1 浅绿 / 2+ 深绿）。
- 交互：hover 显示 tooltip（日期 + 当天文章数）。
- 实现：CSS Grid + 颜色映射，无第三方依赖（用户确认自研）。

### 3. 基础统计

`src/components/timeline/StatsCards.tsx`：
- 总文章数 / 总评论数 / 总浏览数（从文章数据聚合）。
- 写作天数（最早文章至今的天数）。
- 活跃月份数（有文章发布的月份数）。
- 最长连续更新（连续有文章的天数上限）。

### 4. 时间轴文章列表

`src/components/timeline/TimelineList.tsx`：
- 按年份分组 → 月份分组 → 文章列表（折叠交互：点击年份/月份展开收起，默认最新展开）。
- 每条：日期（MM-DD）+ 标题链接 + 浏览数 + 评论数（参考 lifengdi）。
- 数据：WP GraphQL 文章查询（标题/日期/uri/viewCount/commentCount）。

### 5. 分页

- 复用现有 `Pagination.astro` 模式，但 **URL 参数化**：`getPageUrl` 需支持 `/timeline?page=N`（现有组件硬编码 `/?page=N`，需改造为可传 basePath prop 或新建）。
- 每页文章数：10（与首页一致）。

### 6. 数据获取

- 新建 `getTimelinePosts(page, perPage)`：WP GraphQL 查询文章（含标题/日期/uri/viewCount/commentCount），用 cachedQuery 60s 缓存。
- 统计与热力图需要**全量文章数据**（不止当前页）——独立查询所有文章的日期/浏览/评论（轻字段）。

## 数据流

```
/timeline 请求
  ├─ getTimelineStats(): 全量文章轻字段 → 热力图矩阵 + 统计卡片
  └─ getTimelinePosts(page): 当前页文章 → 时间轴列表
  └─ 分页组件（?page=N 切换）
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| GitHub API 真实 commit | 真实贡献数据 | 需 token/代理，依赖外部，且与博客无关 |
| react-github-calendar 库 | 现成热力图 | 新依赖，样式定制受限 |
| 平铺展开 | 无折叠 | 文章多时冗长，lifengdi 用分组 |
| 按年份懒加载 | 滚动加载 | 用户选页码分页 |

## 影响

### 前端
- 新增 `src/pages/timeline.astro`。
- 新增 `src/components/timeline/`（GitHubCalendar、StatsCards、TimelineList）。
- `src/api/api.ts`：新增 `getTimelineStats`、`getTimelinePosts`（走 cachedQuery）。
- `src/components/Pagination.astro`：支持 basePath 参数（或新建 TimelinePagination）。

### 风险与注意
- 全量文章查询数据量：博客几百篇文章可接受；量大时统计/热力图数据需单独缓存。
- 热力图矩阵年份边界：跨年时列对齐需处理。
- 分页 URL 需与现有 `?page` 模式一致，避免与其他页面冲突。

## 参考文献

- lifengdi 时间轴: https://www.lifengdi.com/timeline
- shadcnblocks timeline19: https://www.shadcnblocks.com/block/timeline19
- 现有 Pagination 组件: `src/components/Pagination.astro`
- ADR-0015（分层缓存）：`docs/adr/0015-graphql-layered-caching.md`
