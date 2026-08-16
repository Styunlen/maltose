# 术语表 (Glossary)

## 浏览量 (Post View)

一篇 WordPress 文章的浏览次数。本项目存储在文章的 postmeta 中，key 为 `views`（整数）。

## WP-PostViews 插件

WordPress 的浏览量统计插件。本项目的 Maltose 主题**不依赖**该插件的任何函数，仅与其共用 `views` postmeta key。安装与否都不影响主题的浏览量功能。

## viewCount

Maltose 主题在 WPGraphQL 的 `Post` 类型上注册的字段，返回文章浏览量（整数）。前端文章卡片、文章详情页均通过它读取浏览量。

## recordPostView

Maltose 主题在 WPGraphQL 的 `Mutation` 类型上注册的 mutation，入参为文章 `postId`，将浏览量 +1 并返回最新值。前端文章页挂载时调用一次，用于计数。

## mostViewedPosts

Maltose 主题在 WPGraphQL 的 `RootQuery` 类型上注册的字段，返回按浏览量倒序排列的文章列表，可传入 `first` 控制数量。用于首页「热门文章」区块。

## 防刷窗口 (Anti-abuse Window)

防止浏览量被刷量而设置的时间窗口。本项目采用双层：
- **Astro 代理层**：`rate-limiter-flexible` 按 `IP + postId` 做 60 秒粗粒度限流。
- **WordPress 端**：transient `maltose_view_{postId}_{ipHash}` 做 5 分钟精确窗口，窗口内同一 IP 对同一文章只计一次。

## Apollo 内存缓存 (Apollo InMemoryCache)

Astro SSR 进程中 `client`（ApolloClient 单例）持有的查询结果缓存。**已于 2026-08-05 移除实际作用**：`defaultOptions.query.fetchPolicy` 设为 `network-only` 后，所有查询每次从 WordPress 实时拉取，不再读写该缓存。保留空 `InMemoryCache` 实例仅为满足 ApolloClient 构造要求。

## 缓存主动失效 (Cache Purge)

**已废弃（2026-08-05）**。原机制：WordPress 保存文章（`save_post`，仅 publish 状态）时签名 POST 到 Astro `/api/cache-purge` 触发 `client.cache.evict()`。Apollo 缓存移除后该链路整体删除（含 Astro 端点、WP 侧 `class-cache-purge.php`、`maltose_astro_url` 设置项）。

## cache-purge 端点

**已删除（2026-08-05）**。原为 Astro 端接收 WordPress 失效通知的 API 端点，校验签名后清空 Apollo 内存缓存。Apollo 缓存移除后无缓存可清，端点与相关代码一并移除。

## ViewCountsProvider

**已废弃（2026-08-09）**。原为 Astro 前端的全局客户端组件（`client:load`），收集首页所有需要浏览数的文章 `databaseId`，挂载后一次性通过 `posts(where:{in})` 批量查询最新浏览数并分发回各卡片（渐进更新）。Apollo 缓存移除后 SSR 首屏即实时值，该组件失去意义，已删除（组件文件、事件监听、`data-view-dbid` 属性）。

## getViewCounts

Astro `api.ts` 中的批量浏览数查询函数，使用 `fetchPolicy: "network-only"` 每请求实时打 WordPress。查询体复用 WPGraphQL 原生 `posts(where:{in})` 连接，只取 `databaseId` 与 `viewCount` 字段。**保留**（ViewCountsProvider 删除后无自动调用者，未来如需批量刷新仍可用）。

## 渐进更新 (Progressive Update)

**已废弃（2026-08-09）**。原为"首屏显示缓存旧值 → 客户端挂载后 0.5s 更新为最新值"的过渡方式（配合 ViewCountsProvider）。Apollo 缓存移除后 SSR 首屏即实时值，渐进更新机制整体移除。

## GraphQL 查询拼接（Query Merging）

将多个独立 GraphQL 查询合并为一次请求的优化（ADR-0013）。实测侧边栏 3 查询并行 1099ms vs 拼接 446ms（快 2.5 倍）——瓶颈在每请求的 HTTP 连接/签名验证开销（约 300ms），WP 端解析本身并行。通过新建 `megaQuery`（含导航 + 侧边栏 + 随机推荐）一次连接获取全站共享数据。**不做 TTL 缓存**——保持评论/文章实时（承接 ADR-0003 移除 Apollo 缓存的决定）。

## 查询字段瘦身（Query Field Slimming）

按组件实际消费裁剪 GraphQL 查询字段的优化（ADR-0014）。排查发现 mostViewedPosts 查询了组件不用的 excerpt/featuredImage/srcSet 等字段（PopularPosts 只消费 5 字段），HomePosts 的 featuredImage 也只用到 sourceUrl——无用字段的 WP 解析是 TTFB 慢的根源。瘦身后 MegaQuery 1211→866ms、HomePosts 870→718ms，首页 TTFB 降到 ~1.5s。

## GraphQL 分层缓存（Layered GraphQL Caching）

在 Apollo 客户端缓存与实时性之间取平衡的方案（ADR-0015）。**低变动数据**（导航、侧边栏、随机推荐、置顶）用模块级 Map + `cachedQuery` 封装实现 60s TTL 缓存；**实时数据**（文章内容、评论、浏览数）显式 `network-only` 保持实时。避免 ADR-0003 全量缓存的评论陈旧问题，同时把低变动数据的 TTFB 降回缓存命中水平。配合 Global ID 归一化（WPGraphQL 官方性能建议）与 `@include(if:)` 指令（替代模板插值）。
