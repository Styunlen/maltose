# ADR-0015: GraphQL 缓存分层——低变动数据缓存 + 实时数据不缓存

## 状态

已接受

## 日期

2026-08-09

## 背景

性能优化演进中，TTFB 与实时性存在权衡：

| 模式 | 热缓存 TTFB | 数据实时性 |
|---|---|---|
| cache-first（ADR-0003 早期）| ~16ms | 陈旧（评论/文章改后不更新）|
| network-only（ADR-0003 修订 + ADR-0013/0014）| ~1.5-1.8s | 实时 ✓ |

ADR-0003 移除 Apollo 缓存是因为**全量缓存**导致评论/文章陈旧。但**部分数据变动极低频**（侧边栏、导航、随机推荐、置顶）——这些可以安全缓存 60s，不影响评论/文章实时性。

WPGraphQL 官方性能文档建议：**Include Global IDs in Queries and Fragments**（Global ID 帮助 Apollo 实体归一化）。当前 network-only 下缓存不读，Global ID 无价值；改用部分缓存后，缓存命中的查询需要 Global ID 归一化。

## 需求

- **低变动数据**（导航、侧边栏、随机推荐、置顶）用 Apollo 缓存，60s TTL。
- **实时数据**（文章内容、评论、浏览数）保持 network-only，发布/评论后立即可见。
- `megaQuery` 的 `includeSticky` 从模板字符串插值改为 **`@include(if:)` 指令**（规范、可被缓存系统识别）。
- 避免 ADR-0003 的"全量缓存陈旧"问题。

## 决策

### 1. fetchPolicy 分层

**全局默认改为 `cache-first`**（缓存低变动数据），**实时查询显式 `network-only`**：

```ts
export const client = new ApolloClient({
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { fetchPolicy: "cache-first" },  // 默认缓存低变动数据
  },
});
```

实时查询显式覆盖（保持 ADR-0003 的实时性）：
- `getNodeByURI`（文章页，含评论）→ `network-only`
- `getViewCounts`（浏览数实时）→ `network-only`
- `recordPostView`（mutation 本就实时）

### 2. 60s TTL：模块级 Map + cachedQuery 封装

Apollo InMemoryCache 无内置 TTL。用模块级 Map 封装：

```ts
const queryCache = new Map<string, { data: any; expiresAt: number }>();

async function cachedQuery<T>(
  key: string,
  query: DocumentNode,
  variables?: any,
  ttlMs = 60 * 1000,
): Promise<T> {
  const now = Date.now();
  const hit = queryCache.get(key);
  if (hit && now < hit.expiresAt) {
    return hit.data as T;  // TTL 内直接返回
  }
  // 过期或未命中 → 打 WP（network-only 绕过 Apollo 缓存），写回
  const { data } = await client.query({ query, variables, fetchPolicy: "network-only" });
  queryCache.set(key, { data, expiresAt: now + ttlMs });
  return data as T;
}
```

- `key` 用查询名 + 变量序列化（如 `megaQuery:5:5:30:true`）。
- **`megaQuery` 走 cachedQuery**：60s 内侧边栏/导航/随机推荐/置顶不重复打 WP。
- 模块级 Map 在 SSR 常驻进程跨请求存活（与 ADR-0012 的 refreshInFlight 同理）。

### 3. `megaQuery` 改用 `@include(if:)` 指令

```graphql
query MegaQuery($sidebarPosts: Int!, $recentComments: Int!, $randomFirst: Int!, $includeSticky: Boolean!) {
  # ... 常驻字段
  stickyPosts @include(if: $includeSticky) {
    ...
  }
}
```

- 替代 `includeSticky ? \`...\` : ""` 模板插值。
- 变量 `includeSticky` 由调用方传入（MainLayout: false，首页: true）。
- GraphQL 指令更规范，查询结构稳定（利于缓存键一致性）。

### 4. 低变动数据加 Global ID

缓存命中的节点补 `id`（Global ID），Apollo 归一化复用：
- `recentPosts` / `allTags` / `recentComments` / `mostViewedPosts` / `stickyPosts` 加 `id` 字段。
- `getViewCounts` 已手动构造 Global ID 入参，无需改。

## 数据流

```
低变动数据（导航/侧边栏/随机推荐/置顶）
  → cachedQuery(60s TTL)
  → TTL 内: 模块 Map 命中，不打 WP
  → 过期: client.query(network-only) 刷新 + 写回 Map

实时数据（文章/评论/浏览数）
  → 显式 network-only，每次打 WP（实时性保证）

megaQuery
  → stickyPosts @include(if: $includeSticky) 指令控制
```

## 备选方案

| 方案 | 说明 | 未采纳原因 |
|---|---|---|
| WPGraphQL Smart Cache | WP 端响应缓存 | 需装插件，Astro 端无控制权 |
| Apollo field policy TTL | typePolicies 自定义 read | 复杂且难全局生效 |
| 全部缓存 | 回到 cache-first | 评论/文章陈旧问题重现 |
| 全不缓存 | network-only 现状 | TTFB 1.5-1.8s，低变动数据浪费 |

## 影响

### 前端
- `src/api/api.ts`：`defaultOptions` 改 cache-first；新增 `cachedQuery` + `queryCache` Map；`megaQuery` 改用 `@include(if:)` 并走 cachedQuery；实时查询（getNodeByURI 等）显式 network-only；低变动节点加 `id`。

### 风险与注意
- **模块级 Map 内存**：SSR 常驻进程长期运行，queryCache 可能累积。需上限控制（如 LRU 或固定条数）或定期清理。
- **缓存键**：`megaQuery` 的 key 必须包含所有变量（sidebarPosts/recentComments/randomFirst/includeSticky），否则不同参数串缓存。
- **实时性边界**：评论/文章发布后，低变动数据（如侧边栏最近评论）最多 60s 延迟——可接受（用户确认）。
- **Global ID 归一化**：需确保同一节点在不同查询中的 `id` 一致（WPGraphQL Global ID 稳定）。

## 参考文献

- WPGraphQL Performance: https://www.wpgraphql.com/docs/performance（Include Global IDs + Request Only What You Need）
- ADR-0003（Apollo 缓存移除背景）：`docs/decisions/0003-view-count-cache-invalidation.md`
- ADR-0013（GraphQL 查询拼接）：`docs/decisions/0013-graphql-query-merge.md`
- ADR-0014（TTFB 字段瘦身）：`docs/decisions/0014-ttfb-query-field-slimming.md`
