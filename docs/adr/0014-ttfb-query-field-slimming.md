# ADR-0014: TTFB 优化——查询字段瘦身与候选池缩小

## 状态

已接受

## 日期

2026-08-09

## 背景

ADR-0013 拼接查询后，首页 TTFB 仍为 2.2-3.0s（波动）。`[perf]` 日志量化定位瓶颈：

| 查询 | 优化前耗时 | 优化后耗时 |
|---|---|---|
| MegaQuery | 1211ms | 866ms |
| 其中 mostViewed(50) | 835ms | — |
| HomePosts | 870ms | 718ms |

**根因**：查询请求了远超组件实际消费的字段，WP GraphQL 解析负担大。

### mostViewed（随机推荐数据源）字段过度

`mostViewedPosts(first: 50)` 查询了 `date/excerpt/tags/featuredImage/srcSet/mediaDetails/altText` 等字段，但 **PopularPosts 组件只消费 5 个字段**（`categories/commentCount/title/uri/viewCount`）——大量无用字段解析拖慢 835ms。

### HomePosts featuredImage 字段过度

`homePagePostsQuery` 查询 `srcSet/mediaDetails/altText`，但 **PostCard 只用 `sourceUrl`**。

## 需求

- 查询字段瘦身到组件实际消费，减少 WP 解析负担。
- 缩小随机推荐候选池（50 → 30），减少解析行数。
- 保持功能不变（随机推荐、首页卡片、置顶轮播正常）。

## 决策

### 1. mostViewedPosts 字段瘦身

`megaQuery` 的 `mostViewedPosts` 裁剪为 PopularPosts 所需：

```graphql
mostViewedPosts(first: $randomFirst) {
  databaseId
  title
  uri
  commentCount
  viewCount
  categories {
    nodes { name uri }
  }
}
```

去掉 `date/excerpt/tags/featuredImage/srcSet/mediaDetails/altText`。

### 2. 候选池 50 → 30

`index.astro` 的 `megaQuery({ randomFirst: 50 })` → `randomFirst: 30`。随机推荐只展示 8 篇，30 候选池足够多样。

### 3. homePagePostsQuery featuredImage 瘦身

```graphql
featuredImage {
  node { sourceUrl }
}
```

去掉 `srcSet/mediaDetails/altText`（PostCard 只用 sourceUrl）。

### 4. 保留项

- `megaQuery` 的 `stickyPosts` 保留 `srcSet`（StickyCarousel 响应式轮播图需要）。
- `getStickyPosts`/`getRandomPosts` 等旧函数保留（PopularPosts fallback 使用）。

## 数据流

```
首页 SSR
  ├─ homePagePostsQuery（featuredImage 瘦身）→ 718ms
  └─ megaQuery（mostViewed 瘦身 + 候选池 30）→ 866ms
  ≈ 并行最慢 866ms → TTFB ~1.5s
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 保持全字段 | 不裁剪 | WP 解析负担大，TTFB 慢 |
| 候选池保持 50 | 多样性强 | 30 已够（只展示 8 篇），50 浪费 |
| 缓存 slow 查询 | TTL 缓存 | 用户坚持不缓存（实时性） |

## 影响

### 前端
- `src/api/api.ts`：`megaQuery` 的 mostViewedPosts 字段瘦身、`homePagePostsQuery` 的 featuredImage 瘦身。
- `src/pages/index.astro`：`randomFirst: 50 → 30`。

### 风险与注意
- 若未来 PopularPosts 需要更多字段（如缩略图），需在 mostViewedPosts 补字段。
- 字段瘦身依赖组件实际消费——组件改字段时需同步查询。

## 参考文献

- ADR-0013（GraphQL 查询拼接）：`docs/adr/0013-graphql-query-merge.md`
- 组件字段消费分析：`src/components/PopularPosts.astro`（5 字段）、`src/components/PostCard.astro`（sourceUrl）
