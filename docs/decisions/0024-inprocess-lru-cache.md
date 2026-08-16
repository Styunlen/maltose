# ADR-0024: 进程内 LRU 缓存（LruLink + SWR）替代手动 queryCache

## 状态

已接受

## 日期

2026-08-16

## 背景

TTFB 优化（ADR-0013/0014/0015）引入了分层缓存：低变动数据走 `cachedQuery`（模块级 Map，60s TTL，手动 key），实时数据显式 `network-only`。随着博客访问量增长，该设计暴露三个问题：

1. **手动 Map 是"伪 LRU"**：`queryCache`（`MAX_CACHE_ENTRIES=50`）用 Map 插入序淘汰，无真 LRU 语义、无 per-operation TTL、无 SWR 后台刷新。缓存过期后下一次请求必须等网络（TTFB 回升）。
2. **实时数据与缓存数据二元对立**：`network-only` 查询（getNodeByURI/homePagePosts/getRandomPosts/getQuery）完全放弃缓存收益；而缓存查询（layout/mega/timeline）过期时无 stale 兜底。
3. **无法区分匿名/登录用户**：若将来认证查询进缓存，无用户维度隔离会串数据。

**需求**：所有 GraphQL 请求都能兼顾数据实时性与页面实时性——大部分数据直接返回缓存（TTFB 最优），过期时后台异步刷新（不阻塞响应），强实时数据（写后读场景）过期时等网络返回最新值。

## 决策

### 1. LruLink：进程内 LRU 缓存 ApolloLink

新增 `LruLink`（基于 `lru-cache`），作为 Apollo link 链第一环，实现 stale-while-revalidate（SWR）：

```
ApolloClient (单例, ssrMode:true)
└── link 链: [LruLink → errorLink → httpLink]
     │              └── /api/graphql-proxy（签名转发 WP）
     └── InMemoryCache（仅满足 ApolloClient 构造要求，不做跨请求缓存）
```

**行为矩阵**：

| 缓存状态 | SWR 查询 | STRONG_CONSISTENCY 查询 |
|---|---|---|
| 未命中 | 网络 → 写缓存 | 网络 → 写缓存 |
| 新鲜（age < TTL×threshold） | 返回缓存 | 返回缓存 |
| 达标（TTL×threshold ≤ age < TTL） | 返回缓存 + 后台刷新 | 返回缓存 + 后台刷新 |
| 过期（age ≥ TTL） | 返回 stale + 后台刷新 | 等网络 → 最新数据 |

**关键参数**：
- `TTL_CONFIG: Record<operationName, seconds>`，缺省 60s
- `REVALIDATE_THRESHOLD = 0.5`（age > TTL×0.5 触发后台刷新）
- `STRONG_CONSISTENCY: Set<operationName>`——过期时等网络而非返回 stale
- 并发刷新锁（Map<key, Promise>）——同 key 并发只发起一次回源

### 2. 缓存 Key：operationName + 稳定 variables + 可选用户维度

```
key = sha256(operationName + stableStringify(variables))           # 公开查询
      + (有 Authorization ? ":" + sha256(bearerToken) : "")       # 认证查询追加用户维度
```

- `stableStringify`：字段排序后序列化（与输入顺序无关），保证同一查询不同 variables 顺序产生相同 key。
- **认证隔离**：LruLink 读取 `operation.getContext().headers.Authorization`，若存在则 key 追加 `sha256(token)`。匿名用户与每个登录用户各自独立缓存条目，杜绝串数据。
- 现有 `getNodeByURI(uri, wpToken)` 通过 context 传 Authorization，LruLink 自动感知，调用点零改动。

### 3. 分级 TTL

| operation | TTL | 策略 | 理由 |
|---|---|---|---|
| LayoutQuery / MegaQuery / TimelinePosts / TimelineStats / PostsByMonth | 300s | SWR | 站点级低变动数据 |
| RandomPosts | 180s | SWR | 推荐池变动不敏感 |
| HomePosts | 60s | SWR | 新文章发布频率低 |
| GetNodeByURI / GetPost | 30s | **STRONG_CONSISTENCY** | 评论/正文是写后读场景，过期等网络 |

### 4. mutation 后主动失效

暴露 `__internalLruCache = { cache, makeCacheKey, deleteKey, deleteByPrefix }`：

| mutation | 失效操作 |
|---|---|
| `recordPostView` | `deleteByPrefix(viewCount 相关 key 组)`——统一失效跨查询浏览数（homePagePosts/getNodeByURI/mega/timeline 都含 viewCount） |
| 评论 create/update/delete | `deleteByPrefix(GetNodeByURI 相关)` |
| 正文保存 | `deleteKey(GetPost 相关)` |

### 5. client 架构：保留单例 + LruLink 进链

- **保留模块级单例 client**，加 `ssrMode: true`，LruLink 进链。8 个查询函数零签名变更。
- 不做 per-request client（YAGNI）：当前唯一认证查询（getNodeByURI）通过 context 传 token，LruLink 读 context 即可隔离用户。未来若需每用户私有数据缓存，LruLink 设计可平滑演进（共享实例注入 per-request client 链路）。
- 删除 `queryCache` Map + `cachedQuery`（手动 key）——由 LruLink 统一接管。

### 6. 测试

- **vitest 单测**：makeCacheKey 稳定性、缓存命中/未命中、SWR 后台刷新、并发锁、强一致等待、认证 key 隔离。
- **Playwright 验收**：示例页面首次请求走网络、第二次命中缓存（TTFB 显著下降）。

## 影响

- **TTFB**：缓存命中 4-13ms（与 ADR-0015 持平），过期时 SWR 后台刷新不阻塞响应，强一致查询过期时等待网络（300-800ms，可接受）。
- **一致性**：写后读场景（评论/正文/浏览数）由 STRONG_CONSISTENCY + mutation 失效双保险保证。
- **隐私**：认证查询 key 含用户维度，匿名/登录用户数据隔离。
- **内存**：lru-cache `maxSize` 设上限（如 1000 条），配合 TTL 自动过期。

## pm2 部署限制

- 进程内 LRU **每进程独立**——pm2 cluster 模式下各进程缓存互不相通，缓存命中率随进程数下降，且失效广播不跨进程。
- 当前部署为单进程 `node ./dist/server/entry.mjs`（standalone），无此问题。
- 若未来启用 cluster：可选方案——短 TTL 兜底、HTTP webhook 失效通知、`process.send` 广播，或迁移外部缓存（Redis/Upstash）。

## 备选方案

- **per-request client（createApolloClientForSSR）**：更规范但现阶段无认证查询需要，改造 8 个查询函数签名收益为零，弃。
- **Redis/Upstash 外部缓存**：跨进程共享 + 集中失效，但引入外部依赖，与"不写磁盘、单进程"约束冲突，弃。

## 参考文献

- lru-cache 文档
- Apollo Client ApolloLink 文档
- stale-while-revalidate (RFC 5861) 思想
- ADR-0013（查询合并）、ADR-0014（TTFB）、ADR-0015（分层缓存）
