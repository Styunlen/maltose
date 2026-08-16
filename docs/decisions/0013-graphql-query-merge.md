# ADR-0013: GraphQL 查询拼接优化 SSR 渲染

## 状态

已接受

## 日期

2026-08-07

## 背景

页面加载慢（TTFB 秒级），性能诊断定位到 WP GraphQL 查询慢：

| 查询 | 平均耗时 |
|---|---|
| RecentComments | 979ms |
| mostViewed(50) | 822ms |
| HomePosts | 515ms |
| StickyPosts | 406ms |
| AllTags | 376ms |

**根因**：每个查询都有**独立的 HTTP 连接开销**（约 300ms：连接 + 签名验证），WP 端实际解析是并行的。MainLayout 每页执行 `navQuery`（串行）+ 侧边栏 3 查询（并行）→ 多次连接累积。

**实测对比**（侧边栏 3 查询）：
| 方式 | 耗时 |
|---|---|
| 并行 3 请求 | 平均 1099ms |
| 拼接 1 请求 | 平均 446ms（**快 2.5 倍**）|

**用户决策**：仅拼接查询（消除连接开销），**不做 TTL 缓存**（保持评论/文章实时——ADR-0003 移除 Apollo 缓存的原因）。

## 需求

- 将侧边栏 + 导航 + 首页随机推荐的多个独立查询**拼接成一个大 GraphQL 查询**，减少 HTTP 连接次数。
- 文章内容/评论（nodeByUri、实时评论）**保持独立实时查询**，不拼接、不缓存。
- 不引入缓存（避免数据陈旧）。

## 决策

### 1. 新建 `megaQuery` 拼接函数

`src/api/api.ts` 新增统一的拼接查询函数，包含全站共享数据：

```ts
export async function megaQuery(vars: {
  postsFirst?: number;
  randomFirst?: number;
}) {
  const { data } = await client.query({
    query: gql`
      query MegaQuery($postsFirst: Int!, $randomFirst: Int!) {
        # 导航
        menus { nodes { name menuItems { nodes { uri url order label } } } }
        generalSettings { title url description }
        # 侧边栏
        recentPosts: posts(first: $postsFirst) { nodes { databaseId title uri date } }
        allTags: tags(first: 50) { nodes { name uri count } }
        recentComments: comments(first: 5, where: { order: DESC }) { nodes { ... } }
        # 随机推荐（热门）
        mostViewedPosts(first: $randomFirst) { databaseId date uri title ... }
      }
    `,
    variables: vars,
  });
  return data;
}
```

- **一次 HTTP 连接**获取全部全站共享数据。
- GraphQL 允许查询方取所需字段子集（MainLayout 和首页各自消费需要的部分）。

### 2. MainLayout 使用 megaQuery

```ts
const data = await megaQuery({ postsFirst: 5, randomFirst: 0 });
// 消费 menus / generalSettings / recentPosts / allTags / recentComments
```

- 替换现有 `navQuery()`（串行）+ `Promise.all([getRecentPosts, getAllTags, getRecentComments])`。
- 消除 MainLayout 的串行 navQuery 等待。

### 3. 首页使用 megaQuery

```ts
const data = await megaQuery({ postsFirst: 10, randomFirst: 8 });
// 消费 posts / mostViewedPosts（随机推荐）
```

- 替换 `homePagePostsQuery` + `getStickyPosts` + `getRandomPosts` 的组合（若字段兼容）。
- 若首页 posts 需要的字段与 megaQuery 不完全一致，保留首页专用查询或扩展 megaQuery 字段。

### 4. 实时数据不拼接

- 文章页 `nodeByUri`（含评论）保持独立实时查询。
- 评论增删改后刷新页面即时可见（无缓存干预）。

## 数据流

```
MainLayout（每个页面）
  旧: navQuery(串行 0.5s) → Promise.all(3 查询, 最慢 0.98s) ≈ 1.5s+
  新: megaQuery(1 请求 0.45s) → 消费子集 ≈ 0.45s

首页
  旧: Promise.all(3 查询, 最慢 0.82s) + MainLayout ≈ 2.3s
  新: megaQuery(1 请求) + 首页专用(如有) 
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| 60s TTL 缓存 | 缓存慢查询结果 | 用户要求保持评论/文章实时，拒绝缓存 |
| 只拼接不建新函数 | MainLayout 内联大查询 | 首页未受益，重复代码 |
| 拼接 + 主动失效 | 发布时清缓存 | 复杂度高，用户选"仅拼接" |

## 影响

### 前端
- `src/api/api.ts`：新增 `megaQuery` 函数。
- `src/layouts/MainLayout.astro`：改用 `megaQuery`。
- `src/pages/index.astro`：改用 `megaQuery`（字段兼容时）。

### 风险与注意
- `megaQuery` 字段需覆盖首页与 MainLayout 的所有需求；字段差异时扩展 megaQuery 或保留专用查询。
- 每次请求仍打 WP（无缓存）——性能提升来自**连接合并**（2.5 倍），若未来仍需提速再考虑缓存。
- `getStickyPosts`（置顶）是否并入需评估——置顶是首页专属且慢（406ms），可并入 megaQuery 或保留。

## 参考文献

- ADR-0003（view-count-cache-invalidation，含 Apollo 缓存移除背景）：`docs/decisions/0003-view-count-cache-invalidation.md`
- ADR-0012（SSR token 刷新队列）：`docs/decisions/0012-ssr-token-refresh-queue.md`
- 性能诊断：页面 TTFB 秒级 + WP 查询耗时实测
