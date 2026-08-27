# Maltose

Headless WordPress blog built with Astro.

## GraphQL 缓存架构

所有 GraphQL 查询流经进程内 LRU 缓存 link（`LruLink`，`src/lib/lru-link.ts`），实现 **stale-while-revalidate（SWR）** 策略。详见 `docs/adr/0024-inprocess-lru-cache.md` 与 `docs/glossary/lru-cache.md`。

### 工作原理

```
ApolloClient (单例, ssrMode:true)
└── link 链: [LruLink → errorLink → httpLink]
     │              └── /api/graphql-proxy（签名转发 WP）
     └── InMemoryCache（仅满足构造要求，跨请求缓存由 LruLink 负责）
```

- **缓存命中**（新鲜）：直接返回缓存，TTFB 4-13ms。
- **revalidate 窗口**（TTL×0.5 后）：返回缓存 + 后台异步刷新，不阻塞响应。
- **过期**：非强一致查询返回 stale + 后台刷新；强一致查询（`GetNodeByURI`/`GetPost`）等网络返回最新。
- **并发刷新锁**：同一 key 同时只有一个后台刷新。

### 配置 TTL

`src/api/api.ts` 的 `TTL_CONFIG` 按 operationName 分级（缺省 60s）：

```ts
const TTL_CONFIG = {
  LayoutQuery: 300,        // 站点级低变动
  MegaQuery: 300,
  TimelinePosts: 300,
  TimelineStats: 300,
  PostsByMonth: 300,
  RandomPosts: 180,        // 推荐池
  HomePosts: 60,           // 首页列表
  GetNodeByURI: 30,        // 文章+评论（强一致）
  GetPost: 30,             // 正文块（强一致）
};
```

调优建议：变动越频繁的查询 TTL 越短；写后读场景（用户提交后需立即看到）进 `STRONG_CONSISTENCY` 并配合 mutation 失效。

### mutation 后主动失效

评论 create/update/delete 成功后调用 `__internalLruCache.deleteByPrefix("GetNodeByURI:")`，使文章+评论缓存立即失效、下次读取回源。

### pm2 部署限制

进程内缓存**每进程独立**。当前为单进程 `node ./dist/server/entry.mjs`，无影响。若启用 pm2 cluster：
- 各进程缓存互不相通，命中率随进程数下降；
- 失效广播不跨进程（进程 A 发评论，进程 B 的缓存仍是旧的，最长滞后其 TTL）；
- 替代方案：短 TTL 兜底、HTTP webhook 失效通知、`process.send` 广播，或迁移外部缓存（Redis/Upstash）。

### 测试

```bash
pnpm test  # vitest 运行 src/**/*.test.ts
```

单测覆盖：makeCacheKey 稳定性、缓存命中/未命中、SWR 后台刷新、并发刷新锁、强一致等待、认证 key 隔离。
