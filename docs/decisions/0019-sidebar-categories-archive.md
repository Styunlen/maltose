# ADR-0019: 首页侧边栏"文章目录"改为分类+归档

## 状态

已接受

## 日期

2026-08-13

## 背景

首页右侧边栏的 `ArticleDirectory` 区块标题为"文章目录"，但实际展示的是**导航菜单**（时光轴/折腾/友链/开往）——`menu.menuItems`。语义严重不符：用户期望看到的是文章相关内容。

参考 [styunlen.cn](https://styunlen.cn/) 生产版右侧边栏，包含：
- 站点概览（头像 + 文章/分类/标签统计）
- 近期文章（已有：TabsSection）
- 近期评论
- 分类
- 标签
- 归档（按月份）

当前 Maltose 首页侧边栏（HomepageSidebar）：
- Navigation / Recent Posts / 日历 / 动态（TabsSection）/ **文章目录（=菜单，错误）** / 标签云

## 需求

- "文章目录"区块替换为**分类 + 归档**两个独立区块。
- 分类：分类名 + 文章数，按文章数排序，点击跳分类归档页。
- 归档：按月列表（`2026年7月 (1)`），最新在前。
- 数据：megaQuery 扩展 categories 字段；归档从全量 posts 的日期聚合。

## 决策

### 1. megaQuery 扩展 categories

`megaQuery` 查询增加全量分类（含文章数）：

```graphql
allCategories: categories(first: 100) {
  nodes {
    id
    name
    uri
    count
  }
}
```

- `cachedQuery` 60s 缓存（低变动数据，ADR-0015 分层缓存）。
- MainLayout 消费后传入 sidebarData。

### 2. 归档数据聚合

从 `getTimelineStats()`（或 sidebarData 全量 posts）的日期聚合月度归档：

```ts
function buildArchive(posts: { date: string }[]) {
  const months = new Map<string, number>();
  for (const p of posts) {
    const m = p.date.slice(0, 7); // "2026-07"
    months.set(m, (months.get(m) || 0) + 1);
  }
  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, count]) => ({ month, count }));
}
```

- 展示格式 `YYYY年M月 (N)`。
- 点击跳 `/?archive=YYYY-MM`（或归档页路由，需确认）。

### 3. SidebarRight 替换 ArticleDirectory

删除 `ArticleDirectory`（导航菜单版），新增两个组件：
- `CategoryList`：分类名 + 计数，按 count 排序，点击跳分类页。
- `ArchiveList`：月度归档列表，点击跳归档。

`HomepageSidebar` 用它们替换 `ArticleDirectory`。

## 数据流

```
/timeline 或任意页面
  └─ megaQuery（含 allCategories）
       └─ sidebarData.categories → CategoryList
  └─ getTimelineStats（全量 posts 日期）→ buildArchive → ArchiveList
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 保留菜单改标题"站点导航" | 最小改动 | 用户要真正的文章目录 |
| 分类+归档 tab 切换 | 单区块 | 用户选两独立区块 |
| 按年→月折叠 | 层级深 | 用户选平铺月度列表 |

## 影响

### 前端
- `src/api/api.ts`：`megaQuery` 增加 `allCategories`。
- `src/layouts/MainLayout.astro`：sidebarData 增加 `categories` 与 `archive`。
- `src/layouts/SidebarRight.tsx`：删除 `ArticleDirectory`，新增 `CategoryList`/`ArchiveList`，HomepageSidebar 使用。

### 风险与注意
- 归档跳转目标路由需确认（`?archive=` 或独立页面）。
- 分类 `count` 字段：WPGraphQL 的 `terms` 连接提供 `count`（文章数）。
- 归档聚合依赖全量 posts（已有 getTimelineStats 分页拉全量）。

## 参考文献

- styunlen.cn 生产版侧边栏（分类/归档结构）
- ADR-0015（分层缓存）：`docs/decisions/0015-graphql-layered-caching.md`
- ADR-0018（时间轴重构，含 getTimelineStats 全量）：`docs/decisions/0018-timeline19-refactor.md`
